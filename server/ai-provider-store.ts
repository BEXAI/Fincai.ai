import { and, eq } from "drizzle-orm";
import { db } from "./db";
import {
  aiProviderConnections,
  aiAnalysisPreferences,
  isAllowedModel,
  PROVIDER_MODELS,
  type AiProvider,
  type AnalysisProvider,
} from "@shared/schema";
import {
  isEncryptionConfigured,
  encryptToken,
  decryptToken,
  maskToken,
} from "./encryption";

// Persistence for user-supplied third-party AI provider API keys (OpenAI,
// Gemini). Keys are AES-256-GCM encrypted at rest via SESSION_SECRET — the same
// mechanism that protects the Robinhood agent OAuth tokens — and are keyed by
// the server-issued agent session id. The plaintext key never leaves the
// server: status callers only ever receive the masked `keyHint`.

export interface ProviderConnectionStatus {
  provider: AiProvider;
  keyHint: string;
  updatedAt: Date | null;
}

export async function listProviderConnections(
  sessionId: string,
): Promise<ProviderConnectionStatus[]> {
  if (!isEncryptionConfigured()) return [];
  try {
    const rows = await db
      .select()
      .from(aiProviderConnections)
      .where(eq(aiProviderConnections.sessionId, sessionId));
    return rows.map((row) => ({
      provider: row.provider as AiProvider,
      keyHint: row.keyHint,
      updatedAt: row.updatedAt ?? null,
    }));
  } catch (err) {
    console.warn(
      "[ai-provider-store] Failed to list provider connections:",
      (err as Error)?.message,
    );
    return [];
  }
}

export async function saveProviderKey(
  sessionId: string,
  provider: AiProvider,
  apiKey: string,
): Promise<void> {
  if (!isEncryptionConfigured()) {
    throw new Error("Server encryption is not configured");
  }
  const encryptedKey = encryptToken(apiKey);
  const keyHint = maskToken(apiKey);
  const updatedAt = new Date();
  await db
    .insert(aiProviderConnections)
    .values({ sessionId, provider, encryptedKey, keyHint, updatedAt })
    .onConflictDoUpdate({
      target: [aiProviderConnections.sessionId, aiProviderConnections.provider],
      set: { encryptedKey, keyHint, updatedAt },
    });
}

export async function getProviderKey(
  sessionId: string,
  provider: AiProvider,
): Promise<string | null> {
  if (!isEncryptionConfigured()) return null;
  try {
    const rows = await db
      .select()
      .from(aiProviderConnections)
      .where(
        and(
          eq(aiProviderConnections.sessionId, sessionId),
          eq(aiProviderConnections.provider, provider),
        ),
      )
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    return decryptToken(row.encryptedKey);
  } catch (err) {
    console.warn(
      "[ai-provider-store] Failed to load provider key:",
      (err as Error)?.message,
    );
    return null;
  }
}

export async function deleteProviderKey(
  sessionId: string,
  provider: AiProvider,
): Promise<void> {
  // Intentionally let errors propagate: a failed delete of a stored secret must
  // surface as an error to the caller, never be silently reported as success.
  await db
    .delete(aiProviderConnections)
    .where(
      and(
        eq(aiProviderConnections.sessionId, sessionId),
        eq(aiProviderConnections.provider, provider),
      ),
    );
}

// ---------------------------------------------------------------------------
// Multi-agent analysis model selection (which provider powers the analysis
// agents for this session). Built-in Claude is the default — represented by the
// absence of a stored row — so anonymous sessions work with no setup.
// ---------------------------------------------------------------------------

export interface AnalysisSelection {
  provider: AnalysisProvider; // 'claude' when using the built-in default
  model: string | null; // null for built-in Claude
}

export async function getAnalysisSelection(
  sessionId: string,
): Promise<AnalysisSelection> {
  if (!isEncryptionConfigured()) return { provider: "claude", model: null };
  try {
    const rows = await db
      .select()
      .from(aiAnalysisPreferences)
      .where(eq(aiAnalysisPreferences.sessionId, sessionId))
      .limit(1);
    const row = rows[0];
    if (!row) return { provider: "claude", model: null };
    return {
      provider: row.provider as AnalysisProvider,
      model: row.model ?? null,
    };
  } catch (err) {
    console.warn(
      "[ai-provider-store] Failed to load analysis selection:",
      (err as Error)?.message,
    );
    return { provider: "claude", model: null };
  }
}

export async function setAnalysisSelection(
  sessionId: string,
  provider: AnalysisProvider,
  model?: string,
): Promise<void> {
  // Choosing the built-in default simply clears any stored preference.
  if (provider === "claude") {
    await db
      .delete(aiAnalysisPreferences)
      .where(eq(aiAnalysisPreferences.sessionId, sessionId));
    return;
  }

  // A bring-your-own provider can only be selected once its key is connected.
  const key = await getProviderKey(sessionId, provider as AiProvider);
  if (!key) {
    throw new Error(
      `Connect your ${provider} API key before selecting it for analysis.`,
    );
  }

  const chosen =
    model && isAllowedModel(provider as AiProvider, model)
      ? model
      : PROVIDER_MODELS[provider as AiProvider].default;

  const updatedAt = new Date();
  await db
    .insert(aiAnalysisPreferences)
    .values({ sessionId, provider, model: chosen, updatedAt })
    .onConflictDoUpdate({
      target: aiAnalysisPreferences.sessionId,
      set: { provider, model: chosen, updatedAt },
    });
}

// When a provider key is removed, drop any analysis selection that pointed at
// it so the session transparently reverts to the built-in Claude default.
export async function clearAnalysisSelectionForProvider(
  sessionId: string,
  provider: AiProvider,
): Promise<void> {
  try {
    await db
      .delete(aiAnalysisPreferences)
      .where(
        and(
          eq(aiAnalysisPreferences.sessionId, sessionId),
          eq(aiAnalysisPreferences.provider, provider),
        ),
      );
  } catch (err) {
    console.warn(
      "[ai-provider-store] Failed to clear analysis selection:",
      (err as Error)?.message,
    );
  }
}
