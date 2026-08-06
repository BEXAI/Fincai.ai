# Fincai — Product Requirements Document

**Product:** Fincai — AI trading platform with agentic brokerage connectivity
**Live app:** https://fincai.ai · **Repository:** https://github.com/BEXAI/Fincai.ai
**Status:** Shipped MVP · **Last updated:** August 6, 2026
**Submission docs:** [README — short writeup & code tour](./README.md) · [.cursorrules — AI rules file](./.cursorrules)
**How it was built:** vibe-coded with Cursor throughout, governed by the AI collaboration rules published in [`.cursorrules`](./.cursorrules)

---

## 1. Problem

Retail traders juggle three disconnected loops: researching a thesis, executing it at a broker, and monitoring what happens next. AI assistants can help with the first loop, but they stop at the brokerage wall — they can describe a trade, not place one. The result is copy-paste workflows, missed windows, and "analysis tools" that never touch a real account.

Robinhood's agentic trading interface (an MCP server with OAuth 2.1 authorization) changes what is possible: a user can explicitly authorize an AI agent to operate a dedicated brokerage account. What is missing is a product that makes that connection usable — and safe.

## 2. Product thesis

Fincai is the cockpit for broker-authorized AI trading:

1. **A real connection, not a simulation.** The agent terminal connects to Robinhood's agentic trading interface over MCP with OAuth 2.1 — live portfolio, live order entry, live tool activity.
2. **Safety before autonomy.** Every autonomous capability defaults to its safest form: paper mode by default, live trading as an explicit opt-in, hard caps enforced server-side, and a kill switch.
3. **Honest data or no data.** The platform never fabricates market numbers. When a data source is unavailable, the UI says so instead of inventing a price.

## 3. Goals and non-goals

### Goals
- Let a user connect a Robinhood agentic account and see the AI operate it transparently (every tool call visible).
- Let a user stage manual trades through chat or a trade form, with an explicit in-app confirmation step before any order is sent.
- Let a user run curated strategy templates autonomously with strict, server-enforced guardrails.
- Provide options analytics (Black–Scholes pricing engine with Greeks and Treasury-curve discounting) and reliable market data with transparent sourcing.
- Keep all public product copy compliance-clean and lint-enforced in CI.

### Non-goals
- **No fund movement.** Fincai cannot deposit, withdraw, or transfer funds or securities; its access is limited to the permissions granted during brokerage authorization.
- **No investment advice.** Fincai provides software and analytics, not recommendations; copy is linted to avoid advice-like claims.
- **No performance promises.** The product makes no claims about returns or win rates, anywhere.
- **No custody.** Assets stay at the brokerage; Fincai stores only encrypted OAuth authorization for the scopes the user granted.

## 4. Users

| Persona | Need | What Fincai gives them |
|---|---|---|
| Hands-on retail trader | An AI copilot that can actually execute after they approve | Agent terminal + chat with staged, confirm-before-send orders |
| Strategy tinkerer | Automation with guardrails, not a black box | Strategy runner templates, paper-first, visible activity log |
| Cautious evaluator | Understand agentic trading with zero real-money risk | Paper mode default, demo preview, transparent tool console |

## 5. Core functionality

### 5.1 Agentic Terminal (Robinhood MCP)
- OAuth 2.1 authorization with PKCE and dynamic client registration against Robinhood's agentic trading MCP endpoint.
- Server-held agent sessions (HttpOnly cookie identity); broker tokens encrypted at rest with AES-256-GCM.
- Live activity feed of every MCP tool call, result, and error — the user can always see what the agent did.
- Tool console for direct calls (quotes, holdings, orders) and a portfolio view sourced from live holdings when connected.
- Manual trade form: each order goes through an explicit in-app confirmation step (with estimated cost vs. available funds) before it is sent.
- Prerequisites surfaced in-product: Robinhood agentic program enrollment and a funded, dedicated agentic account; equities-only at the program's launch scope.

### 5.2 AI Analysis Desk
- Streaming chat backed by a multi-agent analysis pipeline; users may bring their own model key for supported providers, per session.
- A Trade/Plan toggle controls whether the AI may stage orders at all; staged orders go through the same explicit in-app confirmation step before they are sent.
- AI limitations are disclosed in-product; analysis can be wrong, and the UI says so.

### 5.3 Autonomous Strategy Runner
- Curated strategy templates run in the background against live market data.
- **Paper by default; live is opt-in.** A live run must be explicitly armed by the user; once armed, it places orders within its configured limits without a separate confirmation for each order — this is disclosed in exactly those terms before arming.
- V1 execution scope: long-only equities. Server-enforced guardrails: per-order notional caps, daily order-count limits, market-hours gating, and caps re-checked at order entry.
- Concurrency safety: order-placing transitions (entering/exiting a position) are claimed atomically, so the engine and a manual Stop cannot double-act on one run.
- Failure posture: a run interrupted mid-order pauses for human review rather than retrying blindly. A global kill switch stops all runs.

### 5.4 Options analytics
- Black–Scholes pricing engine with Greeks and Treasury-curve discounting.
- Multi-leg spread analysis for the trade panel: max profit/loss, breakevens, and probability-of-profit estimates, labeled as model estimates.

### 5.5 Market data
- Redundant provider chain: quotes try Alpha Vantage first, then Alpaca Market Data; historical bars and options snapshots come from Alpaca Market Data.
- Multi-tier caching (hot cache, main cache, stale-while-revalidate window) to stay responsive under provider limits.
- Honesty rule: if all providers fail, endpoints return an explicit unavailable state — never a fabricated number. The only simulated data in the product is the clearly labeled landing-page demo preview.

### 5.6 Accounts, alerts, and onboarding
- JWT-based auth with user-scoped data access; account features are optional for exploring the terminal.
- Price alerts route through a notification-first pipeline into an in-app notification feed.
- First-run walkthrough and a getting-started checklist gate on account state, not tracking tables.

## 6. Security and compliance requirements

- CSRF validation (double-submit cookie/header) on state-changing API routes — authentication, agent connect/disconnect and broker tool calls, strategy runs, notifications, AI analysis.
- Rate limiting on authentication endpoints; auth secrets required in production.
- OAuth callback URLs derive only from trusted server configuration — never from request Host headers.
- Broker OAuth tokens encrypted at rest (AES-256-GCM); no plaintext broker credentials anywhere in the system.
- Compliance lint runs in CI over public copy (landing page, README, this PRD) banning performance claims, advice-like language, and overstated safety claims; canonical risk disclosures ship in a single shared module used across the app.
- Screenshots and demos are illustrative of software behavior, not trading results.

## 7. Success metrics

- **Activation:** visitor → connected agent session; connected session → first confirmed manual order.
- **Safety adoption:** share of strategy runs started in paper mode; zero orders observed outside configured caps.
- **Transparency engagement:** activity-feed views per connected session.
- **Reliability:** market-data endpoints degrade to explicit unavailable states (no fabricated values) during provider outages.

## 8. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Broker interface evolves (tool schemas are discovered at runtime) | Tools listed dynamically per session; order payloads carry redundant descriptors; failures surface in the activity feed |
| Market-data provider limits | Provider chain + multi-tier caching + stale-while-revalidate; explicit unavailable states |
| Autonomous execution risk | Paper default, explicit arming, server-side caps, market-hours gating, atomic order claims, pause-on-interrupt, kill switch |
| AI error / hallucination | Confirmation step for staged orders, AI-limitations disclosure, no-fabricated-data rule |
| Compliance drift in copy | CI lint over public copy; single shared disclosure module |

## 9. Rollout

- **Now:** MVP live at fincai.ai — agent terminal, AI analysis desk, strategy runner (paper default / live opt-in), options analytics, alerts, onboarding.
- **Launch scope:** equities-only, matching the brokerage program's launch scope; options are analytics-only.
- **Operational note:** the always-on runner requires an always-on deployment (reserved VM class) in production.
- **Next (directional):** options and short-direction execution as the brokerage program's scope expands beyond long equities; per-template run history and exportable results; additional agentic-broker connections as more brokers expose MCP endpoints.

## 10. Tech overview

TypeScript end-to-end: React + Vite client, Express server, Drizzle ORM on PostgreSQL, MCP SDK for the brokerage connection, streaming AI chat, Vitest for the test suite (including the compliance lint).

## Appendix A — 2-minute demo script (no account required)

1. **Agent terminal** — open https://fincai.ai. With no agent connected, it runs a clearly-labeled demo preview of the terminal surface.
2. **AI desk** — at `/chat`, ask for an analysis of SPY: multi-agent output (technical / sentiment / fundamental agents plus a bull–bear debate) over live market data.
3. **Autonomous runner (paper)** — at `/builder`, arm any template in the default paper mode and watch the run appear under active runs with its state machine and rules.
4. **Guided pass** — `/promo` is a cinematic walkthrough of every feature.

The live Robinhood connection requires enrollment in Robinhood's agentic program and a funded, dedicated agentic account; the README screenshots stand in for that surface.

## Appendix B — The hard problems

1. **A broker connection with no fixed schema.** Robinhood's MCP tools are discovered at runtime per session; the client handles OAuth 2.1 dynamic client registration, PKCE, encrypted token persistence, and lazy session restore across server restarts.
2. **Unattended execution that fails safe.** Armed live runs trade without per-order review, so every guard is server-side: caps re-checked at entry against the live price, market-hours gating, atomic compare-and-set claims on order-placing transitions, and unknown-outcome orders that pause for a human instead of retrying.
3. **Compliance as code.** Public copy (landing page, README, this PRD) is scanned by a CI lint against over-claims; all risk disclosures live in one importable module so product surfaces cannot drift.
4. **Honest market data under rate limits.** A provider chain with tiered caching and a persistent per-decision audit log — and a hard rule that a provider outage yields "unavailable", never an invented number.

---

*Robinhood is a trademark of Robinhood Markets, Inc. Fincai is not affiliated with, endorsed by, or sponsored by Robinhood Markets, Inc. or its subsidiaries.*

*Fincai is a software platform, not an investment adviser or broker-dealer, and does not provide investment advice or recommendations. All investing involves risk, including possible loss of principal. Autonomous strategies can place real orders in a live brokerage account when explicitly armed by the user; market conditions can change faster than automated logic reacts.*
