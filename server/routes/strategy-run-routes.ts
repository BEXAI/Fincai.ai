// Routes for the live Strategy Runner. A "run" arms a strategy template against
// the live market; the strategy-runner engine then evaluates and (in live mode)
// trades it. These routes only create/list/stop runs — all order placement is
// owned by the engine.
//
// Safety enforced here at creation time:
//  - Anonymous users are paper-only (live requires an account).
//  - Live runs are LONG-only in V1 (short templates must run in paper).
//  - Live runs require a connected Robinhood agent (verified now for fast feedback).
//  - Position size is capped by max quantity and max notional.
import type { Express, Request } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { marketDataService } from "../market-data";
import { robinhoodMcp } from "../robinhood-mcp";
import { buildRedirectUrl } from "./agent-routes";
import { strategyRunner } from "../strategy-runner";
import { getStrategyTemplate, getEquityRunDefaults } from "@shared/strategy-templates";
import type { InsertStrategyRun, StrategyRun } from "@shared/schema";
import { validateCsrf } from "../csrf";
import { MAX_RUN_QUANTITY, MAX_RUN_NOTIONAL } from "../strategy-run-limits";

const DEMO_USER_ID = "demo-user";

// Re-exported so existing importers of the caps keep working.
export { MAX_RUN_QUANTITY, MAX_RUN_NOTIONAL };

// Aggregated KPIs over a user's runs. P&L figures are percent-based (the runner
// records each run's realized/unrealized return as `pnlPercent`), so averages
// and best/worst are percentages too.
export interface StrategyRunSummary {
  totalRuns: number;
  activeRuns: number;
  closedRuns: number;
  wins: number;
  losses: number;
  breakeven: number;
  winRate: number; // % of closed runs that finished profitable
  averagePnlPercent: number; // mean realized return across closed runs
  bestPnlPercent: number | null;
  worstPnlPercent: number | null;
  cumulativePnlPercent: number; // sum of realized returns across closed runs
  paperRuns: number;
  liveRuns: number;
  paperClosedRuns: number;
  liveClosedRuns: number;
}

const ACTIVE_RUN_STATUSES = ["watching", "entering", "in_position", "exiting", "paused"];

// Compute the performance summary from the raw runs. Closed runs (status
// "closed") are the only ones with realized P&L; active/error runs are counted
// but excluded from win-rate and average math.
function computeRunSummary(runs: { status: string; mode: string; pnlPercent: number | null }[]): StrategyRunSummary {
  const closed = runs.filter((r) => r.status === "closed");
  const realized = closed
    .map((r) => r.pnlPercent)
    .filter((p): p is number => p !== null && p !== undefined);

  const wins = realized.filter((p) => p > 0).length;
  const losses = realized.filter((p) => p < 0).length;
  const breakeven = realized.filter((p) => p === 0).length;
  const cumulative = realized.reduce((sum, p) => sum + p, 0);

  return {
    totalRuns: runs.length,
    activeRuns: runs.filter((r) => ACTIVE_RUN_STATUSES.includes(r.status)).length,
    closedRuns: closed.length,
    wins,
    losses,
    breakeven,
    winRate: realized.length > 0 ? (wins / realized.length) * 100 : 0,
    averagePnlPercent: realized.length > 0 ? cumulative / realized.length : 0,
    bestPnlPercent: realized.length > 0 ? Math.max(...realized) : null,
    worstPnlPercent: realized.length > 0 ? Math.min(...realized) : null,
    cumulativePnlPercent: cumulative,
    paperRuns: runs.filter((r) => r.mode === "paper").length,
    liveRuns: runs.filter((r) => r.mode === "live").length,
    paperClosedRuns: closed.filter((r) => r.mode === "paper").length,
    liveClosedRuns: closed.filter((r) => r.mode === "live").length,
  };
}

// Read the agent session strictly from the server-issued HttpOnly cookie. We
// never create one here — if it's absent the user simply has no live agent.
function readAgentSessionId(req: Request): string | null {
  return (req as any).cookies?.["agentSessionId"] ?? null;
}

const createRunSchema = z.object({
  templateId: z.string().min(1),
  symbol: z.string().trim().min(1).max(10).optional(),
  quantity: z.coerce.number().positive().max(MAX_RUN_QUANTITY),
  mode: z.enum(["paper", "live"]).default("paper"),
  // Optional rule overrides (otherwise the template's equity defaults are used).
  stopLossPercent: z.coerce.number().positive().max(90).optional(),
  profitTargetPercent: z.coerce.number().positive().max(500).optional(),
  useTrailingStop: z.boolean().optional(),
  trailingStopPercent: z.coerce.number().positive().max(90).optional(),
  timeStopMinutes: z.coerce.number().int().positive().max(1440).optional(),
  entryThresholdPct: z.coerce.number().min(0).max(50).optional(),
});

type ParsedRun = z.infer<typeof createRunSchema>;

// Shared single-run creation path, used by BOTH the single-run POST and the
// batch ("default agent") POST so all safety — live gating, live pricing, and
// the per-run notional cap — stays in exactly one place. Returns the created
// run or a structured error the caller maps to an HTTP status / per-symbol skip.
async function armStrategyRun(
  req: any,
  body: ParsedRun,
): Promise<{ ok: true; run: StrategyRun } | { ok: false; status: number; message: string }> {
  const userId = req.isAnonymous ? DEMO_USER_ID : req.userId;

  const template = getStrategyTemplate(body.templateId);
  if (!template) {
    return { ok: false, status: 400, message: "Unknown strategy template" };
  }
  const defaults = getEquityRunDefaults(template);
  const direction = defaults.direction;
  const symbol = (body.symbol ?? template.preset.defaultSymbol).toUpperCase();

  // Live-mode gating.
  let agentSessionId: string | null = null;
  if (body.mode === "live") {
    if (req.isAnonymous) {
      return {
        ok: false,
        status: 403,
        message: "Live trading requires an account. You can run this in paper mode for now.",
      };
    }
    if (direction === "short") {
      return {
        ok: false,
        status: 400,
        message: "Live trading is long-only in this version. Run this short strategy in paper mode instead.",
      };
    }
    agentSessionId = readAgentSessionId(req);
    if (!agentSessionId) {
      return {
        ok: false,
        status: 400,
        message: "Connect your Robinhood agent first (open the Agent page), then start a live run.",
      };
    }
    await robinhoodMcp.ensureRestored(agentSessionId, buildRedirectUrl());
    if (!robinhoodMcp.isConnected(agentSessionId)) {
      return {
        ok: false,
        status: 400,
        message: "Robinhood agent isn't connected. Connect it on the Agent page, then start a live run.",
      };
    }
  }

  // Price the symbol now: validates it, captures the reference price for the
  // entry trigger, and enforces the notional cap.
  const quote = await marketDataService.getQuote(symbol);
  if (!quote) {
    return { ok: false, status: 400, message: `Couldn't get a live price for ${symbol}.` };
  }
  const notional = quote.price * body.quantity;
  if (notional > MAX_RUN_NOTIONAL) {
    return {
      ok: false,
      status: 400,
      message: `That order is about $${Math.round(notional).toLocaleString()}, above the $${MAX_RUN_NOTIONAL.toLocaleString()} per-run limit. Lower the quantity.`,
    };
  }

  const insert: InsertStrategyRun = {
    userId,
    agentSessionId,
    templateId: template.id,
    templateName: template.name,
    symbol,
    direction,
    assetMode: "equity",
    mode: body.mode,
    quantity: body.quantity,
    entryTriggerType: defaults.entryTriggerType,
    entryThresholdPct: body.entryThresholdPct ?? defaults.entryThresholdPct,
    stopLossPercent: body.stopLossPercent ?? defaults.stopLossPercent,
    profitTargetPercent: body.profitTargetPercent ?? defaults.profitTargetPercent,
    timeStopMinutes: body.timeStopMinutes ?? defaults.timeStopMinutes ?? null,
    useTrailingStop: body.useTrailingStop ?? defaults.useTrailingStop,
    trailingStopPercent: body.trailingStopPercent ?? defaults.trailingStopPercent,
    referencePrice: quote.price,
    currentPrice: quote.price,
    status: "watching",
    lastMessage:
      body.mode === "live"
        ? "Live run armed — watching for entry."
        : "Paper run armed — watching for entry.",
  };

  const run = await storage.createStrategyRun(insert);
  return { ok: true, run };
}

// Batch ("default agent") input: arm one template across a basket of symbols in
// one click. Mirrors the single-run override fields so the same rules apply.
const batchRunSchema = z.object({
  templateId: z.string().min(1),
  symbols: z.array(z.string().trim().min(1).max(10)).min(1).max(25),
  quantity: z.coerce.number().positive().max(MAX_RUN_QUANTITY),
  mode: z.enum(["paper", "live"]).default("paper"),
  stopLossPercent: z.coerce.number().positive().max(90).optional(),
  profitTargetPercent: z.coerce.number().positive().max(500).optional(),
  useTrailingStop: z.boolean().optional(),
  trailingStopPercent: z.coerce.number().positive().max(90).optional(),
  timeStopMinutes: z.coerce.number().int().positive().max(1440).optional(),
  entryThresholdPct: z.coerce.number().min(0).max(50).optional(),
});

type OptionalAuth = (req: any, res: any, next: any) => void | Promise<void>;

export function registerStrategyRunRoutes(app: Express, optionalAuthForFeatures: OptionalAuth) {
  // Create (arm) a new strategy run.
  app.post("/api/strategy-runs", validateCsrf, optionalAuthForFeatures, async (req: any, res) => {
    try {
      const parsed = createRunSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid run settings", errors: parsed.error.flatten() });
      }
      const result = await armStrategyRun(req, parsed.data);
      if (!result.ok) {
        return res.status(result.status).json({ message: result.message });
      }
      res.status(201).json(result.run);
    } catch (err: any) {
      console.error("[strategy-runs] create failed:", err?.message ?? err);
      res.status(500).json({ message: "Failed to start strategy run" });
    }
  });

  // Arm one template across a basket of symbols in a single request (the
  // "default agent"). Dedupes symbols, runs each through the same safety path as
  // a single run, and returns the created runs plus a per-symbol skip list.
  app.post("/api/strategy-runs/batch", validateCsrf, optionalAuthForFeatures, async (req: any, res) => {
    try {
      const parsed = batchRunSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid run settings", errors: parsed.error.flatten() });
      }
      const { symbols, ...rest } = parsed.data;
      const uniqueSymbols = Array.from(new Set(symbols.map((s) => s.toUpperCase())));

      const created: StrategyRun[] = [];
      const skipped: { symbol: string; reason: string }[] = [];
      for (const symbol of uniqueSymbols) {
        const result = await armStrategyRun(req, { ...rest, symbol });
        if (result.ok) {
          created.push(result.run);
        } else {
          skipped.push({ symbol, reason: result.message });
        }
      }

      // A validated batch always returns 2xx (201 when something was armed,
      // 200 when everything was skipped) so the client can surface the
      // per-symbol skip reasons instead of a generic request error.
      res.status(created.length > 0 ? 201 : 200).json({ created, skipped });
    } catch (err: any) {
      console.error("[strategy-runs] batch create failed:", err?.message ?? err);
      res.status(500).json({ message: "Failed to start the default agent" });
    }
  });

  // List the current user's runs (most recent first).
  app.get("/api/strategy-runs", optionalAuthForFeatures, async (req: any, res) => {
    try {
      const userId = req.isAnonymous ? DEMO_USER_ID : req.userId;
      const runs = await storage.getStrategyRunsForUser(userId);
      res.json(runs);
    } catch (err: any) {
      console.error("[strategy-runs] list failed:", err?.message ?? err);
      res.status(500).json({ message: "Failed to load strategy runs" });
    }
  });

  // History + performance: returns every run (active and closed) plus a computed
  // summary of KPIs. All P&L math is derived server-side from the per-run
  // `pnlPercent` the runner already records, keeping numbers consistent with the
  // active-runs view.
  app.get("/api/strategy-runs/history", optionalAuthForFeatures, async (req: any, res) => {
    try {
      const userId = req.isAnonymous ? DEMO_USER_ID : req.userId;
      const runs = await storage.getStrategyRunsForUser(userId);
      const summary = computeRunSummary(runs);
      res.json({ runs, summary });
    } catch (err: any) {
      console.error("[strategy-runs] history failed:", err?.message ?? err);
      res.status(500).json({ message: "Failed to load run history" });
    }
  });

  // Stop a single run (closes any open position; manual exit).
  app.post("/api/strategy-runs/:id/stop", validateCsrf, optionalAuthForFeatures, async (req: any, res) => {
    try {
      const userId = req.isAnonymous ? DEMO_USER_ID : req.userId;
      const result = await strategyRunner.stopRun(req.params.id, userId);
      if (!result.ok) {
        return res.status(result.status ?? 400).json({ message: result.message ?? "Couldn't stop run" });
      }
      res.json(result.run);
    } catch (err: any) {
      console.error("[strategy-runs] stop failed:", err?.message ?? err);
      res.status(500).json({ message: "Failed to stop strategy run" });
    }
  });

  // Kill switch: stop ALL of the user's active runs at once.
  app.post("/api/strategy-runs/kill-switch", validateCsrf, optionalAuthForFeatures, async (req: any, res) => {
    try {
      const userId = req.isAnonymous ? DEMO_USER_ID : req.userId;
      const result = await strategyRunner.killSwitch(userId);
      res.json(result);
    } catch (err: any) {
      console.error("[strategy-runs] kill-switch failed:", err?.message ?? err);
      res.status(500).json({ message: "Failed to stop runs" });
    }
  });
}
