---
name: Strategy Templates (KalshiBot-derived)
description: Which KalshiBot strategies transfer to Fincai stocks/options, and the static-catalog template wiring decision.
---

# Strategy Templates — KalshiBot derivation

Fincai offers a curated, read-only library of strategy templates "for all users", DERIVED (not imported) from the user's KalshiBot prediction-market bot and adapted to stocks/options.

## What transfers from KalshiBot -> Fincai
- MomentumRider -> "Momentum Breakout Rider": fast directional drift entry + trailing stop + hard stop + time stop. This is the one that maps cleanly onto the `strategies` table's previously-unused risk fields (stopLossPercent / profitTargetPercent / timeStopMinutes / useTrailingStop).
- TradingAgent debate + TimesFM convergence -> "AI Consensus Convergence": act only when multi-agent debate and the trend forecast agree (+20% convergence bonus / -30% divergence penalty; edge gate ~0.5%). Fincai already has the multi-agent debate.
- ArbitrageScanner spread + Kelly sizing -> "Fair-Value Edge": buy when market underprices the pricing engine's fair value; fractional Kelly sizing.
- MarketMaker fair-price deviation -> "Mean-Reversion Fade": fade overextended moves back toward fair value.
- RiskManager (max size, daily cap, drawdown, kill switch, paper mode) -> guardrail framework (roadmap, not built here).

## What does NOT transfer
Weather markets, Polymarket cross-venue arbitrage, and two-sided market making have no retail equivalent on a single-broker stock/options platform. Only their *methods* (edge thresholds, fractional Kelly sizing, convergence gating) carry over — not the strategies themselves.

## Wiring decision: static shared catalog, not a DB table
Templates are PLAIN STATIC DATA in `shared/` exposed to the client directly (no endpoint, no table). "Use This Template" -> `/builder?template=<id>`; the builder reads the query param to prefill react-hook-form defaults + shows a banner.
**Why:** the existing `strategies` table is user-scoped and options-only (legs required; a refine demands profitTarget >= 1.5x stopLoss). A static catalog reaches every user (incl. demo) with zero per-user auth and avoids inventing a "system/template strategy" concept or schema churn.
**How to apply:** edit `shared/strategy-templates.ts`; keep each preset's target >= 1.5x stop or the builder's R:R refine rejects the save. Query-param prefill only applies on builder MOUNT — switching the param while the builder is already mounted will not re-apply (would need a wouter location effect + form.reset/setLegs).
