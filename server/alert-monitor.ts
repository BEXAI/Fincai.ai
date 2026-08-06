// Alert Monitor — the always-on background engine that makes price alerts ACTUALLY
// fire. A single timer evaluates every active price alert against live quotes and,
// when the condition is met, flips the alert to 'triggered' and writes a unified
// notification (surfaced by the NotificationBell). Mirrors the strategy-runner's
// singleton/interval pattern so both engines start & stop together on boot.
//
// Safety / efficiency:
//  - One non-overlapping tick (isTicking guard) so slow market-data calls can't
//    stack up.
//  - Quotes are fetched once per unique symbol per tick and reused across all
//    alerts on that symbol (the MarketDataService cache further throttles real
//    provider hits, so we never hammer the API).
//  - Each symbol fetch is isolated in try/catch — one bad symbol can't break the
//    whole tick.
//  - Duplicate notifications are impossible: triggered alerts drop out of the
//    active set, and createNotification dedupes on (userId, dedupeKey).

import { storage } from "./storage";
import { marketDataService } from "./market-data";
import type { PriceAlert } from "@shared/schema";

const TICK_MS = 30_000;
// When a 'crosses' alert was created without a reference price, fall back to a
// touch test: trigger when price is within this fraction of the target.
const CROSS_TOUCH_EPSILON = 0.001; // 0.1%

// Decide whether an alert's condition is satisfied at the given live price.
function shouldTrigger(alert: PriceAlert, price: number): boolean {
  const target = alert.targetPrice;
  switch (alert.condition) {
    case "above":
      return price >= target;
    case "below":
      return price <= target;
    case "crosses": {
      const ref = alert.currentPriceAtCreation;
      if (ref == null) {
        return Math.abs(price - target) / target <= CROSS_TOUCH_EPSILON;
      }
      // Crossed if the price is now on the opposite side of the target relative
      // to where it sat when the alert was created.
      return (ref < target && price >= target) || (ref > target && price <= target);
    }
    default:
      return false;
  }
}

function describeCondition(alert: PriceAlert, price: number): { title: string; message: string } {
  const sym = alert.symbol.toUpperCase();
  const target = alert.targetPrice;
  const verb =
    alert.condition === "below" ? "fell below" : alert.condition === "above" ? "rose above" : "crossed";
  return {
    title: `${sym} ${verb} $${target.toFixed(2)}`,
    message: `${sym} is now $${price.toFixed(2)} — your alert (${alert.condition} $${target.toFixed(2)}) just triggered.`,
  };
}

// Trigger an alert AND guarantee a unified-feed notification exists. This is the
// single shared path used by every engine that can fire an alert — the always-on
// 30s monitor below AND the legacy 2s WebSocket broadcaster in routes.ts — so a
// triggered alert can never bypass the NotificationBell.
//
// Ordering is deliberately notification-first: the notification is deduped on
// (userId, `alert:<id>`) so it's created at most once, and writing it BEFORE
// flipping the alert to 'triggered' means a failed status update simply retries
// on the next pass (the alert stays active) instead of silently dropping the
// feed entry. Returns the triggered alert (or undefined if it was already gone).
export async function triggerAlertAndNotify(
  alert: PriceAlert,
  price: number,
): Promise<PriceAlert | undefined> {
  const { title, message } = describeCondition(alert, price);
  await storage.createNotification({
    userId: alert.userId,
    type: "price_alert",
    title,
    message,
    symbol: alert.symbol.toUpperCase(),
    relatedId: alert.id,
    dedupeKey: `alert:${alert.id}`,
  });
  return storage.triggerPriceAlert(alert.id, price, message);
}

class AlertMonitor {
  private timer: NodeJS.Timeout | null = null;
  private isTicking = false;

  async start(): Promise<void> {
    if (this.timer) return;
    this.timer = setInterval(() => void this.tick(), TICK_MS);
    // Don't keep the event loop alive solely for this timer.
    if (typeof this.timer.unref === "function") this.timer.unref();
    // Kick a first tick shortly after boot.
    setTimeout(() => void this.tick(), 4_000);
    console.log(`[alert-monitor] started (tick every ${TICK_MS / 1000}s)`);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      console.log("[alert-monitor] stopped");
    }
  }

  private async tick(): Promise<void> {
    if (this.isTicking) return;
    this.isTicking = true;
    try {
      const active = await storage.getActivePriceAlerts();
      if (active.length === 0) return;

      // Expire any alerts past their expiry first; keep the rest live.
      const now = Date.now();
      const live: PriceAlert[] = [];
      for (const alert of active) {
        if (alert.expiresAt && new Date(alert.expiresAt).getTime() < now) {
          await storage.updatePriceAlert(alert.id, { status: "expired" }).catch(() => {});
          continue;
        }
        live.push(alert);
      }
      if (live.length === 0) return;

      // One quote per unique symbol, reused across that symbol's alerts.
      const symbols = Array.from(new Set(live.map(a => a.symbol.toUpperCase())));
      const priceBySymbol = new Map<string, number>();
      for (const symbol of symbols) {
        try {
          const quote = await marketDataService.getQuote(symbol);
          if (quote && Number.isFinite(quote.price)) {
            priceBySymbol.set(symbol, quote.price);
          }
        } catch (err: any) {
          console.warn(`[alert-monitor] quote failed for ${symbol}: ${err?.message ?? err}`);
        }
      }

      for (const alert of live) {
        const price = priceBySymbol.get(alert.symbol.toUpperCase());
        if (price == null) continue;
        if (!shouldTrigger(alert, price)) continue;
        try {
          await triggerAlertAndNotify(alert, price);
        } catch (err: any) {
          console.warn(`[alert-monitor] trigger failed for ${alert.id}: ${err?.message ?? err}`);
        }
      }
    } catch (err: any) {
      console.warn(`[alert-monitor] tick error: ${err?.message ?? err}`);
    } finally {
      this.isTicking = false;
    }
  }
}

export const alertMonitor = new AlertMonitor();
