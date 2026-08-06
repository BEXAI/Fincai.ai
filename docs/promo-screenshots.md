# Capturing /promo feature screenshots

The `/promo` tour can illustrate each feature slide with a real, optimized
product screenshot (falling back to the animated mock in
`client/src/components/promo/feature-previews.tsx` when none exists).

## Promo-capture mode

Append `?capture=1` to any route to load the app in **promo-capture mode**
(`client/src/lib/promo-capture.ts`). In this mode the app suppresses everything
that would obscure a clean screenshot:

- the first-run onboarding walkthrough, getting-started checklist, and
  new-account prompt (`OnboardingContext`)
- all toasts (`components/ui/toaster.tsx`)
- the `AuthGate` (bypassed so gated pages render, see `App.tsx`)

It also **seeds a canned demo conversation** on `/chat` and auto-opens the chat
overlay to fullscreen (`use-chat-stream.ts` + `TransparentChatOverlay.tsx`) so
the chat slide shows a real conversation instead of the empty welcome/chart
state. The seeded messages are in-memory only and never persisted.

It has no effect on normal visitors.

## How to capture

1. Open the target route with the flag, e.g. `/chat?capture=1`,
   `/builder?capture=1`.
2. Take a screenshot of the app preview and save it into
   `attached_assets/promo/<slide-id>.jpg` (JPEG keeps the files small; they are
   lazy-loaded).
3. Map the file in the `SCREENSHOTS` record in
   `client/src/components/promo/feature-previews.tsx` with a `label` and `alt`.

Slide ids come from `SLIDES` in `client/src/pages/promo.tsx`
(`chat`, `agents`, `runner`, `robinhood`, `pricing`, `data`, `psychology`).

## Market-hours-dependent features

The IV heatmap (`pricing` slide, `/volatility-surface`) needs live options
snapshots. When markets are closed there are no snapshots, so the page renders
"No data available" and confidence "0/0 valid". A capture taken then would
misrepresent the product, so the `pricing` slide intentionally keeps its
animated mock. Re-capture during market hours (with SPY options data flowing)
and map `pricing.jpg` in `SCREENSHOTS` to swap in a real screenshot.

## Current captures

`chat`, `runner`, and `data` are mapped to real screenshots; `pricing` and the
remaining slides fall back to the animated mock.
