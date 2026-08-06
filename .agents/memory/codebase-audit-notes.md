---
name: Codebase audit — by-design traps & non-duplicates
description: Things that look like bugs/dupes in this repo but are intentional; check before "fixing" or deleting.
---

# Audit findings that are NOT defects (don't "fix" or delete)

- **Real-time price-alert path is duplicate-safe by dedupeKey, not by a concurrency guard.**
  The 2s WebSocket `checkPriceAlerts` loop in `server/routes.ts` has no `isTicking` guard, but it can't double-fire
  user-visible notifications: every trigger goes through the shared `triggerAlertAndNotify`, and `createNotification`
  dedupes on `(userId, "alert:<id>")`. **Why:** overlapping ticks at most write a redundant DB status update — the
  feed entry is created once. **How to apply:** don't add a concurrency guard or treat this as a race bug.
  (The always-on 30s `alert-monitor` DOES have an `isTicking` guard — that's separate.)

- **The two `strategy-analyzer` files are distinct modules, not duplicates.**
  `server/strategy-analyzer.ts` = small legacy `StrategyAnalyzer` class + `strategyAnalyzer` singleton (used by
  `routes.ts` + `routes/agent-routes.ts`). `server/pricing/strategy-analyzer.ts` = the pricing-engine's payoff/greeks/
  factory functions (used by `pricing/index.ts` + `routes/pricing-routes.ts`). Both are actively imported.
  **How to apply:** don't dedupe/delete either.

# Chat transport (current vs dead)

- Active chat uses **SSE** via `client/src/hooks/use-chat-stream.ts` (consumed by `chat/TransparentChatOverlay.tsx`).
- `client/src/hooks/use-websocket-chat.ts` was the old WebSocket-based hook; it was orphaned (0 importers) and **removed**.
- Its server counterpart — the `/ws/chat` `WebSocketServer` handler in `server/routes.ts` (`chatWss`/`chatClients`/
  heartbeat) — has been **REMOVED**. It was a live, unauthenticated, un-rate-limited WS endpoint that still streamed
  billable Claude responses to anyone who connected directly, despite no first-party client using it (cost/abuse
  surface). Removal left some now-orphaned imports (`streamChatResponse`, `parsePortfolioCommand`,
  `parseStockPriceQuery`, `ChatMessage`, `sanitizeChatMessage`) and a dead local semantic-cache block
  (`getCachedResponse`/`setCachedResponse`/`semanticCache`, ~routes.ts:867-920) — left intentionally to keep the change
  minimal (a local `isMarketSensitiveQuery` shadows the imported one; untangle carefully). **The `/ws/market` WebSocket
  is a different, live endpoint — keep it.**
