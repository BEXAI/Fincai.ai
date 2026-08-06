---
name: Autonomous Strategy Runner
description: Server-side engine that auto-trades the strategy templates; durable safety + concurrency rules.
---

# Autonomous Strategy Runner

A background engine makes the KalshiBot-derived strategy templates ACTUALLY RUN: it watches live
quotes and auto-applies each template's entry trigger / stop-loss / profit-target / trailing-stop /
time-stop, placing & managing real EQUITY trades through the user's connected Robinhood Agentic
Trading MCP. State machine: watching → entering → in_position → exiting → closed (plus error/paused).

## Safety model (these are deliberate constraints, not incidental)
- **Paper is the default; live is explicit per-run opt-in.** Anonymous users are paper-only; live
  requires a connected Robinhood agent.
- **Live is LONG-only in V1.** Short-direction templates are forced to paper. The live entry path
  fail-closed guards on direction (pauses if not long) and hardcodes the buy side.
- **Equity-only V1.** Options-leg execution was deferred — opaque MCP option payloads are too
  failure-prone for unattended trades.
- **Caps are centralized and rechecked at entry** (max quantity + max notional). The notional cap is
  re-evaluated against the live price at entry time, not just at create time → pause if exceeded.
- **Market-hours guard** gates live entries/exits.
- **Honest triggers:** momentum/reversion/immediate are computed from quotes only. There is NO real
  multi-agent-debate / fair-value compute in the loop; the UI labels them as quote-based.

## Idempotency & concurrency (the part that protects real money)
- **Persist the in-flight status BEFORE the MCP order.** On boot/restart, any run stuck mid-order
  (entering/exiting) is PAUSED for manual review — NEVER auto re-placed. A failed live entry/exit
  also goes to `paused`, never auto-retried (auto-retry risks a duplicate buy or an oversell).
  **Why:** the order may have actually executed at the broker even if our call appeared to fail.
- **Atomic compare-and-set guards every state transition** (claim watching→entering and
  in_position→exiting via a conditional update that only succeeds from the expected prior status;
  bail if the claim fails). **Why:** the periodic tick and a user's manual Stop/kill-switch can race;
  CAS serializes them so the same run can't be entered/exited twice.
- The active-runs query used to resume the engine **excludes paused runs** so a paused (needs-human)
  run is never silently resurrected by the loop.

## CSRF (anonymous paper runs)
The strategy-run POST routes validate CSRF BEFORE the optional-auth middleware, and the app primes
the CSRF cookie once on mount. **Why:** without the priming, an anonymous user's first paper-run POST
had no cookie yet and 403'd. CSRF cookie/header/endpoint names live in csrf.ts — read, don't guess.

## Deployment caveat
The engine is an in-process interval loop. On an **autoscale** deployment that scales to zero, the
loop stops when the instance is torn down (runs resume on next boot via the active-runs query, but
paused/mid-order ones stay paused). For always-on autonomous trading use a Reserved VM, not autoscale.

## Test flakiness note
The runner panel form is pre-populated with valid template defaults on mount, so "Start paper run" is
enabled immediately. Number inputs use `parseFloat(value) || 0`, so an automated test that CLEARS a
numeric field transiently sets it to 0 and disables the button → false failure. e2e should use the
pre-filled defaults (or set values without leaving a field empty), not clear-then-retype.
