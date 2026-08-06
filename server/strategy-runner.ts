// Strategy Runner — the background engine that makes strategy templates ACTUALLY
// run. A single timer evaluates every active run against live quotes and applies
// the template's entry trigger and exit rules (stop-loss, profit target,
// trailing stop, time stop). In 'live' mode it places & manages equity orders
// through the user's connected Robinhood Agentic Trading MCP; in 'paper' mode it
// simulates fills against the same live quotes.
//
// Safety:
//  - Live trading is LONG-only in V1 (no autonomous shorting); shorts run paper.
//  - Order state is made idempotent by persisting 'entering'/'exiting' BEFORE the
//    MCP order. If the process dies mid-order, the run is PAUSED on the next boot
//    for manual review — it is never auto re-placed (prevents duplicate orders).
//  - Live entries/exits are gated to US equity regular trading hours.

import { storage } from "./storage";
import { marketDataService } from "./market-data";
import { robinhoodMcp } from "./robinhood-mcp";
import { buildRedirectUrl } from "./routes/agent-routes";
import { MAX_RUN_QUANTITY, MAX_RUN_NOTIONAL } from "./strategy-run-limits";
import type { StrategyRun, InsertStrategyRun } from "@shared/schema";

const TICK_MS = 30_000;

type RunPatch = Partial<InsertStrategyRun>;

// US equity regular session: Mon-Fri 9:30-16:00 America/New_York. Uses Intl so
// DST is handled automatically. Holidays are not modeled — a live order on a
// holiday simply fails validation at the broker, which we surface as a retry.
function isUsEquityMarketOpen(date = new Date()): boolean {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const weekday = get("weekday");
  if (weekday === "Sat" || weekday === "Sun") return false;
  const hour = parseInt(get("hour"), 10) % 24;
  const minute = parseInt(get("minute"), 10);
  const minutes = hour * 60 + minute;
  return minutes >= 9 * 60 + 30 && minutes < 16 * 60;
}

// Equity place_order arguments. Mirrors the shape the app standardizes on in the
// Agent trade panel, with redundant keys for compatibility since Robinhood's
// exact tool schema is opaque. Always a plain market, day order.
function buildEquityOrderArgs(symbol: string, side: "buy" | "sell", quantity: number) {
  return {
    symbol,
    side,
    quantity,
    order_type: "market",
    type: "market",
    time_in_force: "day",
    asset_type: "equity",
    instrument_type: "equity",
  } as Record<string, unknown>;
}

// Best-effort extraction of a broker order id from an opaque MCP CallToolResult.
function extractOrderId(result: any): string | null {
  let payload: any = result?.structuredContent ?? result;
  if (payload?.content && Array.isArray(payload.content)) {
    const text = payload.content.find((c: any) => c?.type === "text")?.text;
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        /* keep payload */
      }
    }
  }
  const id = payload?.id ?? payload?.order_id ?? payload?.orderId ?? payload?.ref_id;
  return id != null ? String(id) : null;
}

function pnlPercent(direction: string, entry: number, price: number): number {
  if (!entry) return 0;
  const raw = direction === "short" ? (entry - price) / entry : (price - entry) / entry;
  return Number((raw * 100).toFixed(4));
}

class StrategyRunner {
  private timer: NodeJS.Timeout | null = null;
  private isTicking = false;

  async start(): Promise<void> {
    if (this.timer) return;
    await this.reconcileOnBoot();
    // Kick a tick shortly after boot, then on a fixed cadence.
    this.timer = setInterval(() => void this.tick(), TICK_MS);
    setTimeout(() => void this.tick(), 3_000);
    console.log(`[strategy-runner] started (tick every ${TICK_MS / 1000}s)`);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      console.log("[strategy-runner] stopped");
    }
  }

  // Write a unified-feed notification for a strategy lifecycle event. Fire-and-
  // forget: a notification failure must never break the trading loop. Dedupe is
  // by (userId, `run:<id>:<event>`) so overlapping ticks can't double-notify.
  private async notifyRunEvent(
    run: StrategyRun,
    event: "entered" | "exited" | "paused" | "stopped",
    title: string,
    message: string,
  ): Promise<void> {
    try {
      await storage.createNotification({
        userId: run.userId,
        type: "strategy",
        title,
        message,
        symbol: run.symbol,
        relatedId: run.id,
        dedupeKey: `run:${run.id}:${event}`,
      });
    } catch (err: any) {
      console.warn(`[strategy-runner] notify failed for run ${run.id}: ${err?.message ?? err}`);
    }
  }

  // Manually stop a single run. Closes any open position (live = real exit order,
  // paper = simulated) and marks the run closed. Order placement stays here so
  // the routes never touch the broker directly.
  async stopRun(
    runId: string,
    userId: string,
  ): Promise<{ ok: boolean; status?: number; message?: string; run?: StrategyRun }> {
    const run = await storage.getStrategyRun(runId);
    if (!run || run.userId !== userId) {
      return { ok: false, status: 404, message: "Run not found" };
    }
    if (run.status === "closed" || run.status === "error") {
      return { ok: true, run };
    }
    if (run.status === "entering" || run.status === "exiting") {
      return { ok: false, status: 409, message: "This run is placing an order right now — try again in a few seconds." };
    }

    if (run.status === "in_position") {
      const quote = await marketDataService.getQuote(run.symbol);
      const price = quote?.price ?? run.currentPrice ?? run.entryPrice ?? 0;
      const entry = run.entryPrice ?? price;
      const pnl = pnlPercent(run.direction, entry, price);
      if (run.mode === "live") {
        const peak = run.peakPrice ?? entry;
        await this.exitLive(run, price, peak, pnl, "manual");
        return { ok: true, run: await storage.getStrategyRun(runId) };
      }
      const updated = await storage.updateStrategyRun(runId, {
        status: "closed",
        exitReason: "manual",
        currentPrice: price,
        pnlPercent: pnl,
        closedAt: new Date(),
        lastCheckedAt: new Date(),
        lastMessage: `Stopped (paper): ${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}%`,
      });
      await this.notifyRunEvent(
        run,
        "stopped",
        `${run.symbol} strategy stopped`,
        `You stopped your ${run.symbol} strategy. The paper position closed at ${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}%.`,
      );
      return { ok: true, run: updated };
    }

    // watching / paused → close without any order.
    const updated = await storage.updateStrategyRun(runId, {
      status: "closed",
      exitReason: "manual",
      closedAt: new Date(),
      lastCheckedAt: new Date(),
      lastMessage: "Stopped before entry.",
    });
    await this.notifyRunEvent(
      run,
      "stopped",
      `${run.symbol} strategy stopped`,
      `You stopped your ${run.symbol} strategy before it entered a position.`,
    );
    return { ok: true, run: updated };
  }

  // Kill switch: stop all of a user's active runs at once.
  async killSwitch(userId: string): Promise<{ count: number }> {
    const runs = await storage.getStrategyRunsForUser(userId);
    const active = runs.filter((r) =>
      ["watching", "in_position", "paused"].includes(r.status),
    );
    for (const r of active) {
      await this.stopRun(r.id, userId);
    }
    return { count: active.length };
  }

  // On boot, any run left mid-order ('entering'/'exiting') has an uncertain
  // broker state. Pause it for manual review rather than risk a duplicate order.
  private async reconcileOnBoot(): Promise<void> {
    try {
      const runs = await storage.getActiveStrategyRuns();
      for (const run of runs) {
        if (run.status === "entering" || run.status === "exiting") {
          await storage.updateStrategyRun(run.id, {
            status: "paused",
            lastMessage:
              "Paused after a server restart: the order state was uncertain. Please review your Robinhood account before resuming.",
          });
          console.warn(`[strategy-runner] paused run ${run.id} (was ${run.status} at restart)`);
          await this.notifyRunEvent(
            run,
            "paused",
            `${run.symbol} strategy paused`,
            `Your ${run.symbol} strategy was paused after a server restart because the order state was uncertain. Please review your Robinhood account before resuming.`,
          );
        }
      }
    } catch (err: any) {
      console.error("[strategy-runner] reconcileOnBoot failed:", err?.message ?? err);
    }
  }

  private async tick(): Promise<void> {
    if (this.isTicking) return;
    this.isTicking = true;
    try {
      const runs = await storage.getActiveStrategyRuns();
      for (const run of runs) {
        try {
          await this.processRun(run);
        } catch (err: any) {
          await storage.updateStrategyRun(run.id, {
            lastMessage: `Engine error: ${err?.message ?? String(err)}`,
            lastCheckedAt: new Date(),
          });
        }
      }
    } catch (err: any) {
      console.error("[strategy-runner] tick failed:", err?.message ?? err);
    } finally {
      this.isTicking = false;
    }
  }

  private async processRun(run: StrategyRun): Promise<void> {
    // Skip transient lock states — they resolve within the tick that set them.
    if (run.status === "entering" || run.status === "exiting") return;

    const quote = await marketDataService.getQuote(run.symbol);
    if (!quote) {
      await storage.updateStrategyRun(run.id, {
        lastMessage: `Market data temporarily unavailable for ${run.symbol}`,
        lastCheckedAt: new Date(),
      });
      return;
    }
    const price = quote.price;

    if (run.status === "watching") {
      await this.evaluateEntry(run, price);
    } else if (run.status === "in_position") {
      await this.evaluatePosition(run, price);
    }
  }

  // ---- Entry ----------------------------------------------------------------
  private shouldEnter(run: StrategyRun, price: number): boolean {
    if (run.entryTriggerType === "immediate") return true;
    const ref = run.referencePrice ?? price;
    if (!ref) return false;
    const changePct = ((price - ref) / ref) * 100;
    const threshold = run.entryThresholdPct ?? 0;
    if (run.entryTriggerType === "momentum") {
      return run.direction === "short" ? changePct <= -threshold : changePct >= threshold;
    }
    if (run.entryTriggerType === "reversion") {
      // Fade the extreme: long buys the dip, short fades the rally.
      return run.direction === "short" ? changePct >= threshold : changePct <= -threshold;
    }
    return false;
  }

  private async evaluateEntry(run: StrategyRun, price: number): Promise<void> {
    if (!this.shouldEnter(run, price)) {
      await storage.updateStrategyRun(run.id, {
        currentPrice: price,
        lastCheckedAt: new Date(),
        lastMessage: `Watching ${run.symbol} for entry (${run.entryTriggerType})`,
      });
      return;
    }

    if (run.mode === "live") {
      await this.enterLive(run, price);
    } else {
      await storage.updateStrategyRun(run.id, {
        status: "in_position",
        entryPrice: price,
        peakPrice: price,
        currentPrice: price,
        pnlPercent: 0,
        enteredAt: new Date(),
        lastCheckedAt: new Date(),
        lastMessage: `Entered (paper): ${run.direction} ${run.quantity} ${run.symbol} @ ${price}`,
      });
      await this.notifyRunEvent(
        run,
        "entered",
        `${run.symbol} strategy entered`,
        `Your ${run.symbol} strategy opened a paper position (${run.direction} ${run.quantity} shares) at $${price.toFixed(2)}.`,
      );
    }
  }

  private async enterLive(run: StrategyRun, price: number): Promise<void> {
    // Fail-closed: autonomous live trading is long-only in V1. Route creation
    // already enforces this, but a malformed/legacy row must never reach the
    // broker as an autonomous short sale.
    if (run.direction !== "long") {
      await storage.updateStrategyRun(run.id, {
        status: "paused",
        currentPrice: price,
        lastCheckedAt: new Date(),
        lastMessage: "Live trading is long-only for now — this run was paused for safety.",
      });
      await this.notifyRunEvent(
        run,
        "paused",
        `${run.symbol} strategy paused`,
        `Your ${run.symbol} strategy was paused for safety: live trading is long-only right now.`,
      );
      return;
    }
    if (!isUsEquityMarketOpen()) {
      await storage.updateStrategyRun(run.id, {
        currentPrice: price,
        lastCheckedAt: new Date(),
        lastMessage: "Entry signal hit — waiting for US market open to place the live order.",
      });
      return;
    }
    if (!run.agentSessionId) {
      await storage.updateStrategyRun(run.id, {
        currentPrice: price,
        lastCheckedAt: new Date(),
        lastMessage: "Live run has no Robinhood session. Reconnect at /agent.",
      });
      return;
    }

    await robinhoodMcp.ensureRestored(run.agentSessionId, buildRedirectUrl());
    if (!robinhoodMcp.isConnected(run.agentSessionId)) {
      // Non-destructive: stay watching and retry once the agent reconnects.
      await storage.updateStrategyRun(run.id, {
        currentPrice: price,
        lastCheckedAt: new Date(),
        lastMessage: "Robinhood agent not connected — will place the entry once reconnected (/agent).",
      });
      return;
    }

    // Re-check the position-size caps at the moment of entry. A delayed momentum/
    // reversion trigger can move the price enough that the live order would exceed
    // the per-run notional limit set when the run was armed.
    const notionalNow = price * run.quantity;
    if (run.quantity > MAX_RUN_QUANTITY || notionalNow > MAX_RUN_NOTIONAL) {
      await storage.updateStrategyRun(run.id, {
        status: "paused",
        currentPrice: price,
        lastCheckedAt: new Date(),
        lastMessage: `Entry paused for safety: the order is now ~$${Math.round(notionalNow).toLocaleString()}, above the $${MAX_RUN_NOTIONAL.toLocaleString()} per-run limit. Lower the quantity and start a new run.`,
      });
      await this.notifyRunEvent(
        run,
        "paused",
        `${run.symbol} strategy paused`,
        `Your ${run.symbol} strategy was paused for safety: the order grew above the per-run size limit.`,
      );
      return;
    }

    // Atomically claim the entry: only the caller that flips watching->entering
    // may place the order. A crash after this can't cause a duplicate buy, and
    // any concurrent path will see the lock is already taken and bail out.
    const locked = await storage.tryTransitionStrategyRun(run.id, "watching", {
      status: "entering",
      currentPrice: price,
      lastCheckedAt: new Date(),
      lastMessage: "Placing live entry order…",
    });
    if (!locked) return;

    const side: "buy" | "sell" = "buy"; // long-only (guarded above)
    const args = buildEquityOrderArgs(run.symbol, side, run.quantity);
    try {
      try {
        await robinhoodMcp.callTool(run.agentSessionId, "validate_order", args);
      } catch {
        /* validate_order is advisory; proceed to place */
      }
      const result = await robinhoodMcp.callTool(run.agentSessionId, "place_order", args);
      await storage.updateStrategyRun(run.id, {
        status: "in_position",
        entryPrice: price,
        peakPrice: price,
        currentPrice: price,
        pnlPercent: 0,
        enteredAt: new Date(),
        entryOrderId: extractOrderId(result),
        lastCheckedAt: new Date(),
        lastMessage: `Entered (live): bought ${run.quantity} ${run.symbol} @ ~${price}`,
      });
      await this.notifyRunEvent(
        run,
        "entered",
        `${run.symbol} strategy entered`,
        `Your ${run.symbol} strategy bought ${run.quantity} shares at about $${price.toFixed(2)} (live).`,
      );
    } catch (err: any) {
      // The buy may have reached Robinhood before the response failed. Never
      // auto-retry an entry whose broker state is unknown (that could place a
      // duplicate buy) — pause for manual review instead.
      await storage.updateStrategyRun(run.id, {
        status: "paused",
        currentPrice: price,
        lastCheckedAt: new Date(),
        lastMessage: `Live entry order didn't confirm — PAUSED for manual review. Check your Robinhood account before resuming; if the buy didn't fill you can stop and start a new run. (${err?.message ?? String(err)})`,
      });
      await this.notifyRunEvent(
        run,
        "paused",
        `${run.symbol} strategy paused`,
        `Your ${run.symbol} strategy was paused: the live buy order didn't confirm. Please check your Robinhood account before resuming.`,
      );
    }
  }

  // ---- Position management & exit -------------------------------------------
  private evaluateExitReason(
    run: StrategyRun,
    price: number,
    peak: number,
    pnl: number,
  ): "stop" | "target" | "trailing" | "time" | null {
    if (pnl <= -run.stopLossPercent) return "stop";

    if (run.useTrailingStop && run.trailingStopPercent && peak) {
      if (run.direction === "short") {
        // peak holds the lowest (best) price; exit if it rebounds up off the low.
        if (peak < (run.entryPrice ?? peak)) {
          const runup = ((price - peak) / peak) * 100;
          if (runup >= run.trailingStopPercent) return "trailing";
        }
      } else {
        // peak holds the highest (best) price; exit if it pulls back off the high.
        if (peak > (run.entryPrice ?? peak)) {
          const drawdown = ((peak - price) / peak) * 100;
          if (drawdown >= run.trailingStopPercent) return "trailing";
        }
      }
    }

    if (pnl >= run.profitTargetPercent) return "target";

    if (run.timeStopMinutes && run.enteredAt) {
      const elapsedMin = (Date.now() - new Date(run.enteredAt).getTime()) / 60000;
      if (elapsedMin >= run.timeStopMinutes) return "time";
    }
    return null;
  }

  private async evaluatePosition(run: StrategyRun, price: number): Promise<void> {
    const entry = run.entryPrice ?? price;
    // Track the best favorable price for the trailing stop.
    const prevPeak = run.peakPrice ?? entry;
    const peak = run.direction === "short" ? Math.min(prevPeak, price) : Math.max(prevPeak, price);
    const pnl = pnlPercent(run.direction, entry, price);

    const reason = this.evaluateExitReason(run, price, peak, pnl);
    if (!reason) {
      await storage.updateStrategyRun(run.id, {
        currentPrice: price,
        peakPrice: peak,
        pnlPercent: pnl,
        lastCheckedAt: new Date(),
        lastMessage: `Holding ${run.symbol}: ${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}%`,
      });
      return;
    }

    if (run.mode === "live") {
      await this.exitLive(run, price, peak, pnl, reason);
    } else {
      await storage.updateStrategyRun(run.id, {
        status: "closed",
        currentPrice: price,
        peakPrice: peak,
        pnlPercent: pnl,
        exitReason: reason,
        closedAt: new Date(),
        lastCheckedAt: new Date(),
        lastMessage: `Exited (paper) on ${reason}: ${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}%`,
      });
      await this.notifyRunEvent(
        run,
        "exited",
        `${run.symbol} strategy closed`,
        `Your ${run.symbol} paper position closed on ${reason} at ${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}%.`,
      );
    }
  }

  private async exitLive(
    run: StrategyRun,
    price: number,
    peak: number,
    pnl: number,
    reason: string,
  ): Promise<void> {
    const base: RunPatch = { currentPrice: price, peakPrice: peak, pnlPercent: pnl, lastCheckedAt: new Date() };

    if (!isUsEquityMarketOpen()) {
      await storage.updateStrategyRun(run.id, {
        ...base,
        lastMessage: `Exit (${reason}) pending — waiting for US market open to sell.`,
      });
      return;
    }
    if (!run.agentSessionId) {
      await storage.updateStrategyRun(run.id, {
        ...base,
        lastMessage: `Can't exit (${reason}): no Robinhood session. Reconnect at /agent.`,
      });
      return;
    }

    await robinhoodMcp.ensureRestored(run.agentSessionId, buildRedirectUrl());
    if (!robinhoodMcp.isConnected(run.agentSessionId)) {
      await storage.updateStrategyRun(run.id, {
        ...base,
        lastMessage: `Can't exit (${reason}): Robinhood agent disconnected. Will retry once reconnected (/agent).`,
      });
      return;
    }

    // Atomically claim the exit: only the caller that flips in_position->exiting
    // may place the sell. This serializes the background tick against a user's
    // manual Stop / kill switch, so the same position can never be sold twice.
    const locked = await storage.tryTransitionStrategyRun(run.id, "in_position", {
      ...base,
      status: "exiting",
      lastMessage: `Placing live exit (${reason})…`,
    });
    if (!locked) return;

    const side: "buy" | "sell" = run.direction === "short" ? "buy" : "sell";
    const args = buildEquityOrderArgs(run.symbol, side, run.quantity);
    try {
      try {
        await robinhoodMcp.callTool(run.agentSessionId, "validate_order", args);
      } catch {
        /* advisory */
      }
      const result = await robinhoodMcp.callTool(run.agentSessionId, "place_order", args);
      await storage.updateStrategyRun(run.id, {
        ...base,
        status: "closed",
        exitReason: reason,
        exitOrderId: extractOrderId(result),
        closedAt: new Date(),
        lastMessage: `Exited (live) on ${reason}: ${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}%`,
      });
      await this.notifyRunEvent(
        run,
        "exited",
        `${run.symbol} strategy closed`,
        `Your ${run.symbol} live position closed on ${reason} at ${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}%.`,
      );
    } catch (err: any) {
      // The sell may have reached Robinhood before the response failed. Do NOT
      // auto-retry — a duplicate sell could oversell the position. Pause for
      // manual review until the broker state is confirmed.
      await storage.updateStrategyRun(run.id, {
        ...base,
        status: "paused",
        lastMessage: `Live exit order (${reason}) didn't confirm — PAUSED for manual review. Check your Robinhood account; the position may still be open. (${err?.message ?? String(err)})`,
      });
      await this.notifyRunEvent(
        run,
        "paused",
        `${run.symbol} strategy paused`,
        `Your ${run.symbol} strategy was paused: the live sell order didn't confirm. Please check your Robinhood account; the position may still be open.`,
      );
    }
  }
}

export const strategyRunner = new StrategyRunner();
