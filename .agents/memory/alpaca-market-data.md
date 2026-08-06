---
name: Alpaca market-data quirks
description: Non-obvious Alpaca/Alpha Vantage limits hit when Yahoo Finance was removed and market data was rebuilt on Alpaca.
---

# Alpaca market-data quirks

Yahoo Finance was fully removed; market data (quotes, historical bars, options) now runs on Alpaca with Alpha Vantage as a quote-only fallback.

## Options snapshots are paginated (cap 1000 per page)
Alpaca's options `/snapshots/{symbol}` endpoint returns at most 1000 contracts per response and a `next_page_token` cursor for the rest. A naive single fetch silently clips large chains (e.g. AAPL came back as exactly 1000 = 507 calls + 493 puts). Must loop on `page_token` until `next_page_token` is empty (with a sane page cap).
**Why:** clipped chains corrupt strike/expiry coverage and downstream AI analysis.
**How to apply:** any new Alpaca list endpoint (bars, snapshots, trades) — check for and follow `next_page_token`.

## Indicative options feed has no real OI/volume
`feed=indicative` options snapshots return openInterest=0 and a default IV; this is expected on the current Alpaca plan, not a bug.

## VIX is unsupported; canonicalize to "VIX"
Neither Alpaca nor Alpha Vantage support the volatility index, and the caret form `^VIX` breaks provider URLs. `getQuote` normalizes `^VIX` -> `VIX` and the VIX guards return null gracefully. The user accepted that VIX may be unavailable.
**How to apply:** never pass caret/`^`-prefixed index symbols to Alpaca/Alpha Vantage; resolve to a canonical symbol first.
