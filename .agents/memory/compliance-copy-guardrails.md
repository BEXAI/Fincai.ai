---
name: Compliance copy guardrails
description: Rules for trust/legal/marketing copy — confirmation claims, engine claims, trademark, no-fabrication.
---

- **No blanket "you confirm every trade" claim.** The autonomous strategy runner (`server/strategy-runner.ts`) places LIVE `place_order` calls unattended inside its tick loop once a run is armed `mode:"live"` — there is NO per-order human approval. Only manual chat trades and the one-time arming of a run are user-confirmed.
  **Why:** Marketing copy across the site ("you confirm every trade", "confirmation-first", "every order needs your confirmation") is inaccurate for armed live runs. A compliance-remediation spec flagged this as a material accuracy issue to surface, not to write around.
  **How to apply:** When editing trade-safety copy, describe autonomous live runs accurately (armed once, then trades within user-set limits/caps/market-hours). Do not assert per-order confirmation unless the product actually enforces it.

- **Options-engine claims must trace to `server/pricing/*` via `shared/engine-spec.ts`.** Never use "institutional-grade" (or "institutional … pricing engine"). Canonical constants: `OPTIONS_ENGINE_PHRASE` / `OPTIONS_ENGINE_SPEC_SHORT` / `OPTIONS_ENGINE_SPEC_FULL`.
  **Why:** Superlatives are unverifiable representations; the real methods (Generalized Black-Scholes, Bjerksund-Stensland 2002, closed-form Greeks, Newton-Raphson/Brent IV to 1e-8, Treasury cubic-spline curve, SVI surface) are specific and true.

- **Robinhood OAuth scopes are not enumerable from code.** `server/robinhood-mcp.ts` uses MCP SDK dynamic client registration (grant_types authorization_code + refresh_token) with no explicit scope list; scopes are set by Robinhood's authorization server.
  **How to apply:** A security page cannot publish a definitive Robinhood scope list from code alone — get it from Robinhood docs or an actual token response, or describe it generically with a TODO.

- **Token storage is real and verifiable.** `server/encryption.ts` = AES-256-GCM, key via `scryptSync(SESSION_SECRET, salt, 32)`, format `enc:iv:authTag:ciphertext`; encrypted client-info + tokens stored in `agent_connections` (`server/agent-store.ts`), in-memory fallback. Safe to describe on a security page.

- **Never fabricate legal/security claims.** Every published trust/security/legal statement must trace to code you have read or values the user supplied. When uncertain, write a TODO + a question — not a plausible-sounding sentence.

- **Unresolved human-decision values render as visible `[Pending: ...]` markers, never `{{TOKEN}}` placeholders.** The compliance CI `placeholder_check` hard-fails on any literal `{{...}}` in shipped copy (it once tripped on a *comment* in `legal-page.tsx`), so even example tokens in comments must be reworded.
  **Why:** A raw `{{TOKEN}}` shipping to users looks broken and can misstate legal facts; a `[Pending: entity name]` marker is honest and obviously unfinished.

- **Two CI-lint false-positive traps that WILL recur on compliance edits** (`client/src/test/compliance-ci-checks.test.ts`): (1) the `risk-free` banned-phrase lint trips on the legitimate Black-Scholes "risk-free rate" term in `shared/engine-spec.ts` — allowlist it line/term-scoped, never whole-file. (2) `performance_claim_regex` trips on the illustrative options figures in `client/src/pages/walmart-case-study.tsx` (e.g. "50% gain", "150% ROI").
  **How to apply:** Allowlist perf claims scoped to file + the *exact matched strings* (not whole-file, or new claims pass silently), AND the page must carry a visible "hypothetical illustration — not a projection of results or past performance" label to stay consistent with the published `NO_PERFORMANCE` disclosure.

- **The banned-phrase lint had two COVERAGE gaps that each let a real over-claim ship — both now closed, keep them closed.** (1) The raw base template `client/index.html` (served to every browser AND to OG/social scrapers that don't run JS; `injectRouteSeo` only fixes the crawler-served copy) lives OUTSIDE `SCAN_DIRS`, so its meta/JSON-LD/noscript copy was never scanned — add such files explicitly via `SCAN_FILES`. (2) The scanner split each file per line, so a banned phrase that WRAPS across two JSX lines (e.g. "…Every\n  trade …requires…confirmation") evaded the per-line regexes — add a second pass over whitespace-collapsed full text (`[^.]` in the patterns still stops at sentence periods, so no new false positives).
  **Why:** A prior `mark_task_complete` was rejected for exactly this class of inaccurate per-order confirmation copy, and index.html + a line-wrapped strategy-templates footer were the specific survivors.
  **How to apply:** Any new user-facing surface outside `client/src` (base HTML, `public/*.html`, generated files) must be added to the lint's scan set, and trust-copy regexes must be exercised against text that wraps across lines.

- **When a spec demands a control the product can't truthfully satisfy, assert the accurate copy — don't fake a passing test.** The spec's "no live order without same-session confirmation" assertion is false here (autonomous runner trades unattended). The test instead locks in that `USER_RESPONSIBILITY`/safety copy is *accurate* about that, and the gap is disclosed in `docs/counsel-briefing.md` for counsel.

- **`PERSONALIZATION_LEVEL` cap is a declared, test-locked guardrail, not an active runtime gate.** `assertPersonalizationLevelShippable` (`shared/schema.ts`, caps at `PORTFOLIO`; `PROFILE` = suitability intake = not shippable) has NO runtime callers because no `PROFILE` feature exists — its job is to make future code that ships suitability intake fail loudly. Describe it that way, don't over-claim it as a live gate.
