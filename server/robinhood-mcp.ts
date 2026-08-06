import { randomUUID } from "crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { UnauthorizedError, type OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import type {
  OAuthClientMetadata,
  OAuthClientInformationFull,
  OAuthClientInformation,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import {
  loadAgentCreds,
  saveAgentCreds,
  deleteAgentCreds,
  type AgentCredsSnapshot,
} from "./agent-store";

export const ROBINHOOD_MCP_URL = "https://agent.robinhood.com/mcp/trading";

type ConnectionStatus = "disconnected" | "authorizing" | "connected" | "error";

export interface AgentActivityEntry {
  id: string;
  ts: number;
  kind: "system" | "tool_call" | "tool_result" | "error" | "thought";
  title: string;
  detail?: string;
  confidence?: number;
}

interface AgentSession {
  sessionId: string;
  provider: InMemoryOAuthProvider;
  transport?: StreamableHTTPClientTransport;
  client?: Client;
  status: ConnectionStatus;
  authorizationUrl?: string;
  lastError?: string;
  tools: { name: string; description?: string }[];
  activity: AgentActivityEntry[];
  connectedAt?: number;
}

/**
 * In-memory OAuth client provider implementing the MCP OAuth 2.1 flow
 * (PKCE + dynamic client registration). State lives only for the lifetime
 * of the server process / browser session.
 */
class InMemoryOAuthProvider implements OAuthClientProvider {
  private _clientInformation?: OAuthClientInformationFull;
  private _tokens?: OAuthTokens;
  private _codeVerifier?: string;
  public authorizationUrl?: string;

  constructor(
    private readonly _redirectUrl: string,
    private readonly _state: string,
    private readonly _onPersist?: (snapshot: AgentCredsSnapshot) => void,
    initial?: AgentCredsSnapshot,
  ) {
    this._clientInformation = initial?.clientInfo;
    this._tokens = initial?.tokens;
  }

  private persist(): void {
    this._onPersist?.({
      clientInfo: this._clientInformation,
      tokens: this._tokens,
    });
  }

  snapshot(): AgentCredsSnapshot {
    return { clientInfo: this._clientInformation, tokens: this._tokens };
  }

  get redirectUrl(): string {
    return this._redirectUrl;
  }

  get clientMetadata(): OAuthClientMetadata {
    return {
      client_name: "Fincai Agentic Terminal",
      redirect_uris: [this._redirectUrl],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    };
  }

  state(): string {
    return this._state;
  }

  clientInformation(): OAuthClientInformation | undefined {
    return this._clientInformation;
  }

  saveClientInformation(info: OAuthClientInformationFull): void {
    this._clientInformation = info;
    this.persist();
  }

  tokens(): OAuthTokens | undefined {
    return this._tokens;
  }

  saveTokens(tokens: OAuthTokens): void {
    this._tokens = tokens;
    this.persist();
  }

  redirectToAuthorization(authorizationUrl: URL): void {
    // Instead of redirecting server-side, capture the URL so the frontend
    // can open it for the user (Robinhood requires a desktop browser).
    this.authorizationUrl = authorizationUrl.toString();
  }

  saveCodeVerifier(codeVerifier: string): void {
    this._codeVerifier = codeVerifier;
  }

  codeVerifier(): string {
    if (!this._codeVerifier) {
      throw new Error("No PKCE code verifier saved for this session");
    }
    return this._codeVerifier;
  }
}

class RobinhoodMcpManager {
  private sessions = new Map<string, AgentSession>();
  private stateToSession = new Map<string, string>();
  private restoringPromises = new Map<string, Promise<void>>();
  private restoreAttempted = new Set<string>();

  private getOrCreate(sessionId: string): AgentSession {
    let s = this.sessions.get(sessionId);
    if (!s) {
      s = {
        sessionId,
        provider: new InMemoryOAuthProvider("", randomUUID()),
        status: "disconnected",
        tools: [],
        activity: [],
      };
      this.sessions.set(sessionId, s);
    }
    return s;
  }

  private log(s: AgentSession, entry: Omit<AgentActivityEntry, "id" | "ts">) {
    s.activity.unshift({ id: randomUUID(), ts: Date.now(), ...entry });
    if (s.activity.length > 100) s.activity.length = 100;
  }

  getStatus(sessionId: string) {
    const s = this.sessions.get(sessionId);
    if (!s) {
      return {
        status: "disconnected" as ConnectionStatus,
        endpoint: ROBINHOOD_MCP_URL,
        tools: [],
        activity: [],
      };
    }
    return {
      status: s.status,
      endpoint: ROBINHOOD_MCP_URL,
      authorizationUrl: s.status === "authorizing" ? s.authorizationUrl : undefined,
      lastError: s.lastError,
      tools: s.tools,
      activity: s.activity,
      connectedAt: s.connectedAt,
    };
  }

  /**
   * Begin a connection. Returns either a connected status (if tokens already
   * exist) or an authorizationUrl the user must open in a desktop browser.
   */
  async connect(sessionId: string, redirectUrl: string) {
    const state = randomUUID();
    this.restoreAttempted.delete(sessionId);
    const provider = new InMemoryOAuthProvider(redirectUrl, state, (snap) =>
      void saveAgentCreds(sessionId, snap),
    );
    const transport = new StreamableHTTPClientTransport(new URL(ROBINHOOD_MCP_URL), {
      authProvider: provider,
    });
    const client = new Client(
      { name: "fincai-agentic-terminal", version: "1.0.0" },
      { capabilities: {} },
    );

    const session: AgentSession = {
      sessionId,
      provider,
      transport,
      client,
      status: "authorizing",
      tools: [],
      activity: this.sessions.get(sessionId)?.activity ?? [],
    };
    this.sessions.set(sessionId, session);
    this.stateToSession.set(state, sessionId);
    this.log(session, {
      kind: "system",
      title: "Initiating Robinhood Trading MCP handshake",
      detail: ROBINHOOD_MCP_URL,
    });

    try {
      await client.connect(transport);
      session.status = "connected";
      session.connectedAt = Date.now();
      await this.refreshTools(session);
      this.log(session, { kind: "system", title: "Connected to Robinhood Trading MCP" });
      return { status: session.status, tools: session.tools };
    } catch (err: any) {
      if (err instanceof UnauthorizedError || provider.authorizationUrl) {
        session.status = "authorizing";
        session.authorizationUrl = provider.authorizationUrl;
        this.log(session, {
          kind: "system",
          title: "Authorization required",
          detail: "Open the Robinhood onboarding URL in a desktop browser to authorize the agent.",
        });
        return { status: session.status, authorizationUrl: provider.authorizationUrl };
      }
      session.status = "error";
      session.lastError = err?.message ?? String(err);
      this.log(session, { kind: "error", title: "Connection failed", detail: session.lastError });
      return { status: session.status, error: session.lastError };
    }
  }

  /** Complete the OAuth flow after the user authorizes on Robinhood. */
  async finishAuth(state: string, code: string): Promise<string> {
    const sessionId = this.stateToSession.get(state);
    if (!sessionId) throw new Error("Unknown or expired OAuth state");
    const session = this.sessions.get(sessionId);
    if (!session?.transport || !session.client) throw new Error("No pending agent session");

    await session.transport.finishAuth(code);

    // Re-create transport + client with the same provider (now holding tokens).
    const transport = new StreamableHTTPClientTransport(new URL(ROBINHOOD_MCP_URL), {
      authProvider: session.provider,
    });
    const client = new Client(
      { name: "fincai-agentic-terminal", version: "1.0.0" },
      { capabilities: {} },
    );
    await client.connect(transport);

    session.transport = transport;
    session.client = client;
    session.status = "connected";
    session.connectedAt = Date.now();
    session.authorizationUrl = undefined;
    await this.refreshTools(session);
    this.log(session, { kind: "system", title: "Agent authorized & connected", confidence: 1 });
    this.stateToSession.delete(state);
    return sessionId;
  }

  /**
   * Lazily re-establish a previously authorized connection from persisted,
   * encrypted credentials after a server restart. Best-effort and idempotent:
   * it is a no-op if the session is already live, mid-authorization, or has no
   * stored tokens. If the stored tokens are invalid and cannot be refreshed,
   * the persisted record is cleared so the user is prompted to re-authorize.
   */
  async ensureRestored(sessionId: string, redirectUrl: string): Promise<void> {
    // If a restore is already in flight for this session, await it so
    // concurrent callers (parallel status/portfolio/tools polls) don't observe
    // a transient "disconnected" while reconnection is still underway.
    const inflight = this.restoringPromises.get(sessionId);
    if (inflight) return inflight;

    const existing = this.sessions.get(sessionId);
    if (existing?.status === "connected" && existing.client) return;
    if (existing?.status === "authorizing") return; // user-initiated auth in progress
    if (this.restoreAttempted.has(sessionId)) return;

    const promise = this.doRestore(sessionId, redirectUrl, existing);
    this.restoringPromises.set(sessionId, promise);
    try {
      await promise;
    } finally {
      this.restoringPromises.delete(sessionId);
    }
  }

  private async doRestore(
    sessionId: string,
    redirectUrl: string,
    existing: AgentSession | undefined,
  ): Promise<void> {
    this.restoreAttempted.add(sessionId);
    const creds = await loadAgentCreds(sessionId);
    if (!creds?.tokens || !creds.clientInfo) return;

    const provider = new InMemoryOAuthProvider(
      redirectUrl,
      randomUUID(),
      (snap) => void saveAgentCreds(sessionId, snap),
      creds,
    );
    const transport = new StreamableHTTPClientTransport(new URL(ROBINHOOD_MCP_URL), {
      authProvider: provider,
    });
    const client = new Client(
      { name: "fincai-agentic-terminal", version: "1.0.0" },
      { capabilities: {} },
    );
    const session: AgentSession = {
      sessionId,
      provider,
      transport,
      client,
      status: "authorizing",
      tools: [],
      activity: existing?.activity ?? [],
    };
    this.sessions.set(sessionId, session);

    try {
      await client.connect(transport);
      session.status = "connected";
      session.connectedAt = Date.now();
      await this.refreshTools(session);
      this.log(session, { kind: "system", title: "Restored Robinhood agent session" });
    } catch (err: any) {
      session.status = "disconnected";
      session.client = undefined;
      session.transport = undefined;
      await deleteAgentCreds(sessionId);
      this.log(session, {
        kind: "system",
        title: "Stored agent session expired — re-authorization required",
      });
    }
  }

  private async refreshTools(session: AgentSession) {
    if (!session.client) return;
    try {
      const res = await session.client.listTools();
      session.tools = (res.tools ?? []).map((t) => ({
        name: t.name,
        description: t.description,
      }));
    } catch (err: any) {
      session.lastError = err?.message ?? String(err);
    }
  }

  async listTools(sessionId: string) {
    const s = this.sessions.get(sessionId);
    if (!s?.client || s.status !== "connected") throw new Error("Agent is not connected");
    await this.refreshTools(s);
    return s.tools;
  }

  async callTool(sessionId: string, name: string, args: Record<string, unknown>) {
    const s = this.sessions.get(sessionId);
    if (!s?.client || s.status !== "connected") throw new Error("Agent is not connected");
    this.log(s, { kind: "tool_call", title: `Calling ${name}`, detail: JSON.stringify(args) });
    try {
      const result = await s.client.callTool({ name, arguments: args });
      this.log(s, { kind: "tool_result", title: `${name} returned`, confidence: 0.92 });
      return result;
    } catch (err: any) {
      const msg = err?.message ?? String(err);
      this.log(s, { kind: "error", title: `${name} failed`, detail: msg });
      throw err;
    }
  }

  async disconnect(sessionId: string) {
    const s = this.sessions.get(sessionId);
    if (s?.transport) {
      try {
        await s.transport.close();
      } catch {
        // ignore
      }
    }
    if (s) {
      s.status = "disconnected";
      s.client = undefined;
      s.transport = undefined;
      s.tools = [];
      s.connectedAt = undefined;
      this.log(s, { kind: "system", title: "Agent disconnected" });
    }
    this.restoreAttempted.add(sessionId);
    await deleteAgentCreds(sessionId);
  }

  isConnected(sessionId: string): boolean {
    return this.sessions.get(sessionId)?.status === "connected";
  }
}

export const robinhoodMcp = new RobinhoodMcpManager();
