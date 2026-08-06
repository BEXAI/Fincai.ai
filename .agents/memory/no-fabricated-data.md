---
name: No fabricated market/portfolio data
description: Production data-honesty rule — never fabricate prices or holdings; the only intentional simulation is the labeled marketing preview.
---

# No fabricated data reaches end users

**Rule:** Fincai must not fabricate market data or portfolio positions for real users.
- Intraday/chart: when the provider (Alpaca) fails, `getIntradayData` returns an empty
  result with `source: 'unavailable'` (union: `'alpaca' | 'cache' | 'unavailable'`) and the
  route 503s "Market data temporarily unavailable". No generated/jittered price series.
- Portfolio: when no Robinhood agent is connected (or a live call fails),
  `getPortfolioForSession` returns `emptyPortfolio()` — `source: 'none'`, zeros, `[]`.
  `Portfolio.source` is `'robinhood' | 'none'` (server AND client interface must match).
  The frontend renders a "Connect your agent" empty state instead of holdings.
- Real agent terminal shows real activity or a "standing by" empty state — never a
  simulated thought feed.

**The ONE intentional exception (do NOT delete as "mock data"):** the marketing
"Demo Preview" on the agent landing. `BexaiDashboard` animates a simulated thought
stream ONLY when `demo && !connected`; that `demo` prop is passed exclusively by
`AgentLanding` (labeled "Demo Preview"), never by the real terminal. Form placeholders,
skeleton widths, the anonymous "demo-user" persistence identity, and Monte-Carlo
`Math.random` are also NOT fabricated data.

**Why:** Compliance is informational-only, no fabricated data. A previous pass had a
demo-price fallback and a fake `DEMO_HOLDINGS` portfolio that could mislead users into
thinking simulated numbers were live/theirs.

**How to apply:** If tempted to add a "fallback" that generates plausible prices or
positions, don't — surface unavailability instead. If reviewing and you see the landing
"Demo Preview" simulation, leave it; it is a labeled marketing surface, not a bug.
