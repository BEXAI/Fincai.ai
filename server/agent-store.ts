import { eq, sql } from "drizzle-orm";
import { db } from "./db";
import { agentConnections } from "@shared/schema";
import type {
  OAuthClientInformationFull,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import {
  isEncryptionConfigured,
  encryptToken,
  decryptToken,
} from "./encryption";

export interface AgentCredsSnapshot {
  clientInfo?: OAuthClientInformationFull;
  tokens?: OAuthTokens;
}

/**
 * Persistence for the Robinhood Agentic Trading MCP OAuth connection.
 *
 * The dynamically-registered client info and OAuth tokens are stored
 * AES-256-GCM encrypted (via SESSION_SECRET) so an authorized agent
 * connection survives a server restart. All operations are best-effort:
 * if encryption is not configured or the DB is unavailable, the manager
 * silently falls back to in-memory-only state.
 */

export async function loadAgentCreds(
  sessionId: string,
): Promise<AgentCredsSnapshot | null> {
  if (!isEncryptionConfigured()) return null;
  try {
    const rows = await db
      .select()
      .from(agentConnections)
      .where(eq(agentConnections.sessionId, sessionId))
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    return {
      clientInfo: row.clientInfo
        ? (JSON.parse(decryptToken(row.clientInfo)) as OAuthClientInformationFull)
        : undefined,
      tokens: row.tokens
        ? (JSON.parse(decryptToken(row.tokens)) as OAuthTokens)
        : undefined,
    };
  } catch (err) {
    console.warn(
      "[agent-store] Failed to load persisted credentials:",
      (err as Error)?.message,
    );
    return null;
  }
}

export async function saveAgentCreds(
  sessionId: string,
  snapshot: AgentCredsSnapshot,
): Promise<void> {
  if (!isEncryptionConfigured()) return;
  try {
    const clientInfo =
      snapshot.clientInfo != null
        ? encryptToken(JSON.stringify(snapshot.clientInfo))
        : null;
    const tokens =
      snapshot.tokens != null
        ? encryptToken(JSON.stringify(snapshot.tokens))
        : null;
    const updatedAt = new Date();
    await db
      .insert(agentConnections)
      .values({ sessionId, clientInfo, tokens, updatedAt })
      .onConflictDoUpdate({
        target: agentConnections.sessionId,
        // COALESCE so a partial snapshot (e.g. a client-info-only write that
        // lands out of order relative to a token write) can never overwrite
        // existing credentials with NULL. Full removal goes through deleteAgentCreds.
        set: {
          clientInfo: sql`coalesce(${clientInfo}, ${agentConnections.clientInfo})`,
          tokens: sql`coalesce(${tokens}, ${agentConnections.tokens})`,
          updatedAt,
        },
      });
  } catch (err) {
    console.warn(
      "[agent-store] Failed to persist credentials:",
      (err as Error)?.message,
    );
  }
}

export async function deleteAgentCreds(sessionId: string): Promise<void> {
  try {
    await db
      .delete(agentConnections)
      .where(eq(agentConnections.sessionId, sessionId));
  } catch (err) {
    console.warn(
      "[agent-store] Failed to delete persisted credentials:",
      (err as Error)?.message,
    );
  }
}
