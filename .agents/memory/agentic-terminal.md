---
name: Agentic Terminal (Robinhood MCP)
description: How the /agent terminal connects a real AI agent to Robinhood Trading MCP, plus durable constraints.
---

The `/agent` page connects a live agent to the Robinhood Trading MCP (https://agent.robinhood.com/mcp/trading) over Streamable HTTP + OAuth 2.1 (PKCE + dynamic client registration). Backend lives in `server/robinhood-mcp.ts` (connection manager) and `server/routes/agent-routes.ts`. Demo data is the fallback whenever no agent is connected.

**OAuth redirect-origin rule:** the callback URL must be derived from trusted server config only (`APP_ORIGIN`/`PUBLIC_APP_URL`, then `REPLIT_DOMAINS`/`REPLIT_DEV_DOMAIN`), never from `Host`/`X-Forwarded-Host` request headers.
**Why:** trusting request headers for an OAuth redirect URI lets an attacker redirect the authorization code to a host they control (code/state leakage).
**How to apply:** any new OAuth/callback URL builder uses the trusted-origin helper in agent-routes.ts, not request headers.

**Live MCP tool inputSchemas are NOT surfaced to the frontend.** Because of this, trade calls (`place_order` via `/api/agent/tools/call`) send the app's canonical arg shape plus redundant descriptors (equity, single-option, and multi-leg variants) to maximize compatibility with whatever the live tool expects. If you touch the trade payloads, keep this redundancy intentional — do not "clean it up" assuming a known schema.
**Why:** the real tool contract is opaque at build time; over-trimming args silently breaks live orders.

**Never return raw MCP results to the UI.** `/api/agent/portfolio` runs a normalizer that probes unknown field names, unwraps MCP CallToolResult text/structuredContent, and falls back to demo data; the frontend `PortfolioView` requires the exact normalized `Portfolio` shape.

**Connection state is durable across restarts.** OAuth client info + tokens are persisted AES-256-GCM-encrypted (via SESSION_SECRET, reusing the helpers in `server/encryption.ts`) in the `agent_connections` table, keyed by the HttpOnly `agentSessionId` cookie; `server/agent-store.ts` does best-effort load/save/delete and the manager lazily rebuilds the transport on demand. On disconnect, or when tokens are invalid/unrefreshable, the row is deleted and the user re-authorizes.
**Why:** in-memory-only tokens forced re-auth on every server restart, making the connection feel broken. Persistence is best-effort: if SESSION_SECRET/DB is unavailable it falls back to in-memory, so the connect flow is unchanged when encryption isn't configured.

Decision: `/` is the AI Agent Dashboard (the terminal, inside the sidebar shell) with the Live Agent Activity feed as the hero; the immersive chart/chat moved to `/chat`. `/agent` remains a valid alias because the OAuth callback lands there before the frontend normalizes the URL to `/`. `isImmersivePage` (in App.tsx) now short-circuits the shell only for `/chat`, not `/`.
**Why:** the agent is the product's headline feature, so it should be the landing page rather than buried behind `/agent`.

Decision: `/` (agent-terminal.tsx) renders a conversion-focused marketing landing (`AgentLanding`) whenever the agent is NOT connected (covers disconnected/authorizing/error), and the working dashboard only when `status === "connected"`. The connect/authorize/disconnect flow is centralized in the `useAgentConnect` hook so the landing hero CTA and the compact connected status bar (`AgentConnect`) share identical behavior. The hero primary CTA MUST keep `data-testid="button-connect-agent"` — BexaiDashboard's empty-feed button scrolls to that selector.
**Why:** a logged-in-but-unconnected user previously saw a bare connect card; the landing converts them by selling the agent first. Navigation (sidebar, mobile bottom nav, chat slide-out) frames the agent as the single flagship item, AI Chat/Recommendations as secondary, and all research/analysis tools as a de-emphasized group.

**Robinhood agentic-MCP real-world eligibility constraints (from RH's own docs/launch, ~June 2026):**
- Equities-only at launch; options/crypto/futures/event-contracts are "coming soon", not yet exposed by the MCP tools. (Fincai's headline use case is options — so this MCP can't trade them yet.)
- The agent can READ all of a user's RH accounts but can only PLACE trades in a separate, dedicated **Agentic account** the user funds on its own; the main account can't be agent-traded.
- OAuth starts on desktop but completing it requires an explicit human **Authorize** click AND a confirmation in the Robinhood **mobile app** — desktop authorize alone does not finish the flow.
- A bare landing on `https://robinhood.com/oauth/error` after a spec-correct authorize request means **Robinhood-side rejection** (account not enrolled in the agentic program / no Agentic account, or an expired dynamic client registration), NOT a malformed request. Verified our authorize params match the discovered metadata: `scope=internal` (the only `scopes_supported`), `code_challenge_method=S256`, `response_type=code`, `token_endpoint_auth_method=none`, RFC-8707 `resource` indicator; registration_endpoint issues a client_id fine.
**How to apply:** before touching our OAuth code for an `oauth/error`, confirm the RH account is enrolled in agentic trading + has the funded Agentic account, retry from a FRESH `/agent` Connect (each connect re-registers a fresh, possibly-short-lived dynamic client_id), and complete the mobile-app confirmation. Only debug our callback/token-exchange once the user actually reaches `/api/agent/callback?code=…`.
