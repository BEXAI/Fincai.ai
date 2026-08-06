---
name: Notifications feed + alert firing
description: How triggered price alerts, strategy events, and agent orders reach the unified NotificationBell, and the one rule that keeps alerts from silently bypassing the feed.
---

# Unified notification feed (NotificationBell)

A single `notifications` table backs an in-app feed surfaced by `NotificationBell`.
Three sources write to it: triggered **price alerts** (server engines), **autonomous
strategy** run transitions (strategy-runner `notifyRunEvent`), and **agent order**
status changes (client-only, via `POST /api/notifications`). Anonymous owner is
`demo-user`; logged-in owner is the session user. Dedup is on `(userId, dedupeKey)`
(DB unique index + `onConflictDoNothing`; MemStorage mirrors it).

## The rule: never fire a price alert without routing through the shared helper

There are TWO engines that can fire a price alert:
1. The always-on 30s `alert-monitor.ts` tick.
2. The legacy 2s WebSocket broadcaster in `routes.ts` (`checkPriceAlerts`, runs only
   while `/ws/market` clients are connected).

Both MUST go through `triggerAlertAndNotify(alert, price)` exported from
`alert-monitor.ts`. Do NOT call `storage.triggerPriceAlert(...)` directly for a
user-facing alert.

**Why:** the WS path originally called `triggerPriceAlert` without creating a
notification. Once an alert flips to `triggered` it drops out of the active set the
monitor scans, so a notification was never written — the alert silently bypassed the
feed. A second alert-firing path is easy to miss because it only runs when a market
WS client is connected.

**How to apply:** the helper is **notification-first** — it `createNotification`
(deduped) and THEN `triggerPriceAlert`. Notification-first makes it retry-safe: if the
status flip fails the alert stays active and retries next pass, and the dedupe prevents
duplicate feed rows. Keep this ordering; if you ever add a third alert-firing path,
route it through the same helper.

## Client toast-on-new guard

`NotificationBell` polls `/api/notifications` (~30s) and toasts only genuinely-new
events using a seen-ids set plus a first-load/initialized guard, so a page refresh
doesn't re-toast the whole backlog. `agent-orders.tsx` has an analogous seed guard so
pre-existing terminal orders in localStorage don't backfill notifications on mount, and
it resets its dedupe refs when the user changes.
