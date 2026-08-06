import type { Express, Request, Response } from "express";
import { randomUUID } from "crypto";
import { z } from "zod";
import { robinhoodMcp, ROBINHOOD_MCP_URL } from "../robinhood-mcp";
import { marketDataService } from "../market-data";
import { strategyAnalyzer } from "../strategy-analyzer";
import { getPortfolioForSession } from "../portfolio";

const AGENT_SESSION_COOKIE = "agentSessionId";

// Resolve the agent session id strictly from the server-issued, HttpOnly cookie.
// We deliberately do NOT honor any client-supplied session header: agent
// sessions gate sensitive broker operations (e.g. place_order), so the id must
// be unguessable and server-controlled to prevent session fixation/hijacking.
function getSessionId(req: Request, res: Response): string {
  let sid = req.cookies?.[AGENT_SESSION_COOKIE];
  if (!sid) {
    sid = randomUUID();
    res.cookie(AGENT_SESSION_COOKIE, sid, {
      httpOnly: true,
      sameSite: "lax",
      secure: getTrustedOrigin().startsWith("https://"),
      maxAge: 1000 * 60 * 60 * 24 * 30,
    });
  }
  return sid;
}

// Derive the OAuth callback base URL from trusted server configuration only.
// Never trust Host / X-Forwarded-Host headers for OAuth redirect URIs, since an
// attacker-controlled header could redirect the authorization code elsewhere.
export function getTrustedOrigin(): string {
  const explicit = process.env.APP_ORIGIN || process.env.PUBLIC_APP_URL;
  if (explicit) return explicit.replace(/\/+$/, "");

  // Replit provides the canonical public domain(s) for this deployment.
  const domains = process.env.REPLIT_DOMAINS || process.env.REPLIT_DEV_DOMAIN;
  if (domains) {
    const first = domains.split(",")[0].trim();
    if (first) return `https://${first}`;
  }

  // Local development fallback.
  return `http://localhost:${process.env.PORT || 5000}`;
}

export function buildRedirectUrl(): string {
  return `${getTrustedOrigin()}/api/agent/callback`;
}

// Shared helper: resolve the caller's agent session and return their portfolio
// (live Robinhood holdings when connected, an empty portfolio otherwise). Used by both
// the agent portfolio route and the strategy P&L route so position data is
// sourced consistently.
export async function getPortfolioForRequest(req: Request, res: Response) {
  const sid = getSessionId(req, res);
  await robinhoodMcp.ensureRestored(sid, buildRedirectUrl());
  return getPortfolioForSession(sid);
}

const ConnectSchema = z.object({}).optional();
const CallToolSchema = z.object({
  name: z.string().min(1).max(120),
  arguments: z.record(z.unknown()).default({}),
});

// Multi-leg options strategy analysis (max profit/loss, breakeven, POP) used by
// the agent trade panel's spread confirmation preview. Premiums are the per-leg
// estimated mark; quantity is the number of spreads (applied per leg).
const StrategyLegSchema = z.object({
  optionType: z.enum(["call", "put"]),
  action: z.enum(["buy", "sell"]),
  strike: z.number().positive(),
  quantity: z.number().positive(),
  premium: z.number().nonnegative(),
  expirationDate: z.string().min(1),
});
const StrategyAnalyzeSchema = z.object({
  underlyingSymbol: z.string().min(1).max(12),
  legs: z.array(StrategyLegSchema).min(2).max(6),
  currentPrice: z.number().positive().optional(),
});

export function registerAgentRoutes(app: Express): void {
  // Status of the current agent connection
  app.get("/api/agent/status", async (req, res) => {
    const sid = getSessionId(req, res);
    await robinhoodMcp.ensureRestored(sid, buildRedirectUrl());
    res.json(robinhoodMcp.getStatus(sid));
  });

  // Begin connecting / authorizing the agent against the Robinhood Trading MCP
  app.post("/api/agent/connect", async (req, res) => {
    const sid = getSessionId(req, res);
    const parsed = ConnectSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request body" });
    }
    try {
      const redirectUrl = buildRedirectUrl();
      const result = await robinhoodMcp.connect(sid, redirectUrl);
      res.json({ endpoint: ROBINHOOD_MCP_URL, ...result });
    } catch (err: any) {
      res.status(502).json({
        status: "error",
        error: err?.message ?? "Failed to reach Robinhood Trading MCP",
      });
    }
  });

  // OAuth redirect target — Robinhood sends the user back here after authorizing
  app.get("/api/agent/callback", async (req, res) => {
    const code = typeof req.query.code === "string" ? req.query.code : undefined;
    const state = typeof req.query.state === "string" ? req.query.state : undefined;
    const error = typeof req.query.error === "string" ? req.query.error : undefined;

    if (error) {
      return res.redirect(`/agent?agent_error=${encodeURIComponent(error)}`);
    }
    if (!code || !state) {
      return res.redirect(`/agent?agent_error=${encodeURIComponent("Missing authorization code")}`);
    }
    try {
      await robinhoodMcp.finishAuth(state, code);
      res.redirect("/agent?agent_connected=1");
    } catch (err: any) {
      res.redirect(`/agent?agent_error=${encodeURIComponent(err?.message ?? "Authorization failed")}`);
    }
  });

  // List tools exposed by the connected MCP server
  app.get("/api/agent/tools", async (req, res) => {
    const sid = getSessionId(req, res);
    await robinhoodMcp.ensureRestored(sid, buildRedirectUrl());
    try {
      const tools = await robinhoodMcp.listTools(sid);
      res.json({ tools });
    } catch (err: any) {
      res.status(409).json({ error: err?.message ?? "Agent not connected" });
    }
  });

  // Invoke an MCP tool (e.g. get_quote, get_holdings, place_order)
  app.post("/api/agent/tools/call", async (req, res) => {
    const sid = getSessionId(req, res);
    const parsed = CallToolSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid tool call payload", details: parsed.error.flatten() });
    }
    await robinhoodMcp.ensureRestored(sid, buildRedirectUrl());
    try {
      const result = await robinhoodMcp.callTool(sid, parsed.data.name, parsed.data.arguments);
      res.json({ result });
    } catch (err: any) {
      res.status(502).json({ error: err?.message ?? "Tool call failed" });
    }
  });

  // Analyze a multi-leg options strategy for the spread confirmation preview.
  // Uses the live underlying quote (or a client-supplied price) plus per-leg
  // premiums to compute max profit/loss, breakevens, and probability of profit.
  app.post("/api/agent/strategy/analyze", async (req, res) => {
    const parsed = StrategyAnalyzeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid strategy payload", details: parsed.error.flatten() });
    }
    try {
      const underlyingSymbol = parsed.data.underlyingSymbol.toUpperCase();
      let currentPrice = parsed.data.currentPrice;
      if (currentPrice == null) {
        const quote = await marketDataService.getQuote(underlyingSymbol);
        if (!quote) {
          return res.status(503).json({ error: `Market data temporarily unavailable for ${underlyingSymbol}` });
        }
        currentPrice = quote.price;
      }
      const analysis = strategyAnalyzer.analyzeStrategy({
        underlyingSymbol,
        currentPrice,
        legs: parsed.data.legs,
        riskFreeRate: 0.05,
        volatility: 0.2,
      });
      res.json(analysis);
    } catch (err: any) {
      res.status(500).json({ error: err?.message ?? "Strategy analysis failed" });
    }
  });

  // Disconnect the agent
  app.post("/api/agent/disconnect", async (req, res) => {
    const sid = getSessionId(req, res);
    await robinhoodMcp.disconnect(sid);
    res.json({ status: "disconnected" });
  });

  // Portfolio view — real holdings when connected, empty portfolio otherwise
  app.get("/api/agent/portfolio", async (req, res) => {
    const sid = getSessionId(req, res);
    await robinhoodMcp.ensureRestored(sid, buildRedirectUrl());
    res.json(await getPortfolioForSession(sid));
  });
}
