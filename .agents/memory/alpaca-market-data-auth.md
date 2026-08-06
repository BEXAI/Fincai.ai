---
name: Alpaca market-data auth
description: Which credential type authenticates the Alpaca market data API, and the trap of broker-OAuth auto-selection.
---

# Alpaca market data API authentication

The Alpaca market data API (`data.alpaca.markets`) authenticates with **Trading API key
headers**: `APCA-API-KEY-ID` / `APCA-API-SECRET-KEY` (the `PK…` paper or live trading keys).
It does **not** accept Broker API OAuth client-credential grants or Basic-Auth with
`ALPACA_CLIENT_ID:ALPACA_CLIENT_SECRET` — those return `unauthorized_client` / 401.

**Rule:** in `getAlpacaAuthHeadersAsync()` always prefer the Trading API key headers when
`ALPACA_API_KEY` + `ALPACA_API_SECRET` are present. Only fall back to broker OAuth when no
trading keys exist.

**Why:** a prior auto-detect picked "broker" OAuth mode whenever `ALPACA_CLIENT_ID/SECRET`
were set, failed the OAuth grant, then short-circuited on a Basic-Auth fallback and never
reached the (working) trading-key path. Result: `/api/market/intraday`, `/movers`, `/summary`
returned 503/timeouts plus an OAuth retry storm, even though valid trading keys were configured.

**How to apply:** if Alpaca market-data calls 401/503 while a `PK…` key is set, suspect the
auth-header selection, not the keys. Verify with a direct curl to the bars endpoint using
`APCA-*` headers. Note `ALPACA_CLIENT_ID`/`ALPACA_CLIENT_SECRET` are unused by the data path now.

**Weekend/closed-market note:** intraday bars use a 3-day lookback and filter to the most
recent trading day, so weekends/holidays still return the last session's data.
