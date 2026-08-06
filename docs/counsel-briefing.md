# Fincai — Securities Counsel Briefing Package

**Prepared for:** a licensed securities attorney
**Prepared by:** engineering, as the fact-gathering half of the FIN-003 remediation
**Disclosure copy version referenced:** 1.0.0 (effective 2026-07-25)

> **What this document is.** This is a fact pack to make a paid consultation
> efficient — judgment, not fact-gathering, should consume the billable hour.
> Nothing here is a legal conclusion. Engineering has **not** decided the
> registration question, has **not** claimed any exemption, and has written no
> legal conclusion into any user-facing page. Those determinations are for
> counsel.

---

## 1. The core question

Does Fincai meet the definition of an investment adviser under **Section
202(a)(11) of the Investment Advisers Act of 1940**, and if so, is it required
to register with the SEC or with the State of Florida?

### The three-prong test (engineering's factual read; conclusions are counsel's)

1. **Provides advice or issues reports about securities.** Fincai analyzes
   specific named securities and surfaces specific trade setups. *Factually, this
   prong appears met.*
2. **As part of a regular business.** This is the product. *Factually, met.*
3. **For compensation.** Met if Fincai charges anything, including subscription
   revenue; compensation need not be tied to the advice specifically. *See the
   revenue-model note in §6 — this is a live variable.*

### The publisher's exclusion — the pivotal question

Section 202(a)(11)(D) excludes bona fide publications of general and regular
circulation. **Lowe v. SEC (1985)** is the controlling case. The exclusion is
generally understood to turn on the advice being **impersonal** and not tailored
to an individual client's situation.

**Question for counsel:** Fincai's agent reads a *specific* user's watchlist and
account/holdings and generates setups for *that* user. Does that retain the
impersonality the exclusion requires, or is that precisely the tailoring the
exclusion excludes? See §4 for the exact personalization boundary the product
enforces today.

### The antifraud point (why marketing copy is not just brand hygiene)

Section 206 antifraud provisions reach **any** person meeting the adviser
definition, registered or not. Registration status does not gate antifraud
liability. This is why the marketing-copy remediation (de-branding, removing
unsubstantiated superlatives, no fabricated performance) is a substantive
compliance measure, not cosmetics.

### The Marketing Rule as a design target

Rule 206(4)-1 applies to SEC-registered advisers. Its substantive standards —
substantiation of claims, treatment of testimonials/endorsements, prohibition on
cherry-picked or unsubstantiated performance — have been adopted as a design
target **regardless of registration status**, because the underlying antifraud
principle is not registration-dependent. Concretely: no performance claims are
published (see `NO_PERFORMANCE`), and demo output is labeled as illustrative
software behavior, not trading results.

### Adjacent questions worth asking

- Does routing orders to a brokerage on a user's behalf implicate broker-dealer
  registration under **Exchange Act §15(a)**, or do the user-confirmation step
  (manual path) and the absence of transaction-based compensation keep it clear?
  **Note the asymmetry in §3:** the *autonomous* path does **not** have a
  per-order user-confirmation step.
- Does the **CFA Institute Code and Standards** apply to a candidate's own
  commercial venture, and which standards are implicated (misrepresentation,
  performance presentation, referral/endorsement disclosure)?
- **Florida** state adviser registration thresholds and any de minimis exemption
  applicable pre-revenue.
- Does founder-authored social media promoting the product constitute
  advertising subject to the same substantiation standards as the website?
- If a user's positions are transmitted to a third-party model provider, what
  consent and disclosure regime applies? (Factually, this transmission does
  occur — see §5 and `DATA_TO_AI_PROVIDERS`.)

### Documents to bring to the consultation

- This JSON spec (`attached_assets/fincai-compliance-remediation-spec_*.json`)
- Current homepage copy and screenshots of recent social posts
- The OAuth scope list — **[Pending: HD-08]**, see §5
- The description of what the autonomous strategy runner does without human
  input — provided in §3 below
- Revenue model, current and planned — **[Pending: HD-06/HD-07 owner input]**,
  see §6

---

## 2. What Fincai is (factual product description)

Fincai is an agentic AI trading assistant for stocks and options. It:

- Analyzes specific named securities in real time using a multi-agent AI system
  (technical / sentiment / fundamental agents plus a bull/bear debate).
- Provides a conversational assistant that can place and manage trades through
  the user's connected Robinhood account via Robinhood's official Trading API
  (OAuth 2.1 + PKCE; MCP Streamable HTTP).
- Runs an **autonomous strategy runner** — a server-side background engine that,
  once a user arms a strategy in live mode, evaluates entry/exit rules on a timer
  and places/closes orders automatically.

Fincai holds only an **order-entry** authorization. It never holds banking or
transfer credentials, and it stores no Robinhood password. It cannot deposit,
withdraw, or transfer funds or securities (`NO_FUND_MOVEMENT`).

---

## 3. The autonomous strategy runner — described without softening

**This is the single most important disclosure in this package for the
broker-dealer and "advice vs. execution" analysis.** It is stated plainly and
deliberately, because the compliance spec's "no-autoexecute assertion" control
required engineering to confirm the product's true posture rather than write
around it.

- The manual chat / terminal path is **confirmation-first**: every manual order
  opens a confirmation modal and is sent only after the user clicks confirm. That
  modal now also carries a point-of-decision "not a recommendation" line
  (`NOT_A_RECOMMENDATION_SHORT`).
- The autonomous strategy runner is **not** per-order confirmation-first. Once a
  user arms a strategy **in live mode**, the background engine can place and
  close **live** orders on its evaluation interval **without a separate
  confirmation for each order**, within the limits the user set when arming it.

Because of this, marketing copy that claims the user "confirms every trade" would
be **inaccurate**, and it has been removed / rewritten wherever found (landing
trust bar, capability copy, trust signals, and the landing disclaimer). The
canonical `USER_RESPONSIBILITY` string is written to be true for **both** paths.

**Guardrails that do apply to autonomous live trading today:**

- **Paper is the default; live is an explicit, per-run opt-in.** Anonymous users
  are paper-only. (Enforced at the schema level — see §4, control 1.)
- **Long-only in V1** for live runs; short/volatility templates run in paper.
- **Position caps** re-checked against the live price at entry: max quantity and
  max notional (centralized server-side).
- **Market-hours guard** on live entries/exits.
- **Idempotency / no double-acting:** in-flight status is persisted before the
  order and guarded by an atomic compare-and-set; any run found stuck mid-order
  on restart, or any failed live order, is set to `paused` for manual review and
  never auto re-placed.
- **Kill switch:** a user can stop individual runs or halt all runs.

**Question for counsel:** given the autonomous path executes without per-order
human action, does this change the §15(a) broker-dealer analysis and/or the
"impersonal advice" analysis relative to a purely confirmation-first tool?

---

## 4. Engineering controls — status against the FIN-003 list

The spec lists eight controls and accepts each as **implemented** or
**explicitly deferred with a written reason**. Status below is factual.

| # | Control | Status | Notes |
|---|---------|--------|-------|
| 1 | Server-enforced paper default | **Implemented (pre-existing, now test-locked)** | `strategy_runs.mode` defaults to `'paper'` at the Drizzle column level and in the create-run request schema; anonymous users are paper-only; live requires an account + connected agent. Test asserts the column default. There is no account-level `live_trading_enabled` column — the product's unit of live/paper is the *run*, not the account, so the test targets the real architecture. |
| 2 | Explicit live-trading opt-in | **Partial** | Enabling live is a per-run opt-in behind a confirmation dialog. **Deferred:** the *typed*-confirmation screen and a persisted acknowledgment row (timestamp + user id + exact disclosure version) are not yet built. Reason: needs a new acknowledgment table and a retention decision (**[Pending: HD-07]**); recommended as the top follow-up. The disclosure-version registry needed to back it already exists (control 8). |
| 3 | Per-order confirmation with contextual disclosure | **Implemented** | The manual order confirmation modal now shows `NOT_A_RECOMMENDATION_SHORT` at the point of decision, non-dismissible (no "don't show again"). Applies to the manual path only — the autonomous path has no per-order step by design (§3). |
| 4 | Immutable decision audit log | **Deferred** | No append-only server-side log of agent-generated setups/orders exists today (order history is client-side `localStorage`; `market_data_audit_log` covers market data only, not agent decisions). Reason: this is a cross-cutting change (capture model id/version, system-prompt hash, tool calls + raw responses, output, whether the user acted, resulting order id) whose retention is governed by **[Pending: HD-07]**. Strongly recommended follow-up — it is what makes "what did the system tell this user on this date" reconstructable. |
| 5 | No-autoexecute assertion | **Flagged, not written around** | The literal assertion ("no live order without a same-session user confirmation") is **false for this product** because of the autonomous runner (§3). Per the spec, engineering did not fake a passing test; instead the test suite locks in copy that is *accurate* about the autonomous path, and this briefing states the posture plainly for counsel. |
| 6 | Risk limits and kill switch | **Partial** | Per-run max quantity and max notional caps + a kill switch exist and are enforced. **Deferred:** a daily loss limit, a global max-open-positions cap, and surfacing all four values together in the UI. Reason: additional engine state beyond this remediation's honest-copy scope; recommended follow-up. |
| 7 | Personalization feature flag | **Implemented (declared / test-locked convention)** | `PERSONALIZATION_LEVEL` (`NONE | WATCHLIST | PORTFOLIO | PROFILE`) exists in `shared/schema.ts`, capped at `PORTFOLIO`. `PROFILE` (financial-suitability intake) is marked not shippable and `assertPersonalizationLevelShippable` throws for it. No `PROFILE` feature exists today, so nothing currently calls the assert — it is a declared, test-locked guardrail whose job is to make any future code that tries to ship suitability/risk-tolerance intake (the clearest marker of personalized advice) fail loudly until counsel weighs in, rather than an active runtime gate on a live feature. |
| 8 | Disclosure version registry | **Implemented** | Every disclosure string carries a semver + effective date via the `DISCLOSURES` registry (`DISCLOSURE_VERSION` 1.0.0 / `DISCLOSURE_EFFECTIVE_DATE` 2026-07-25), so an acknowledgment can record exactly what text a user saw. |

**Scope minimization (control 9 in the spec's prose):** the exact Robinhood OAuth
scopes cannot be enumerated from the code — the client uses dynamic client
registration with grant types `authorization_code` and `refresh_token` and **no
explicit scope field** in its registration metadata, against the Trading MCP URL
only. Documenting/minimizing the scope list is therefore **[Pending: HD-08]**.

---

## 5. Data flows relevant to counsel

- **OAuth token storage (HD-09, resolved from code):** Robinhood OAuth client
  info and tokens are stored **AES-256-GCM encrypted at rest** (key derived from
  `SESSION_SECRET` via scrypt) in the `agent_connections` table, keyed by an
  HttpOnly session cookie, and are deleted on disconnect or when tokens become
  invalid/unrefreshable.
- **Data sent to third-party model providers (`DATA_TO_AI_PROVIDERS`):** when a
  user uses AI chat or analysis, prompt content — including any symbols,
  watchlists, or position details referenced — is sent to a third-party model
  provider (Anthropic by default; the user's own OpenAI/Gemini key if connected)
  to generate a response. The full subprocessor list and per-provider data
  categories are **[Pending: HD-06]**; retention is **[Pending: HD-07]**.

---

## 6. Open human decisions blocking full closure

These are owner/counsel inputs, not engineering tasks. They are surfaced as
`[Pending: ...]` markers in the product, never guessed.

- **[Pending: HD-01]** exact legal entity name + state of incorporation.
- **[Pending: HD-02]** legal notice address.
- **[Pending: HD-03]** governing law / venue.
- **[Pending: HD-04]** support / privacy / security contact addresses.
- **[Pending: HD-06]** full subprocessor list + data categories.
- **[Pending: HD-07]** data-retention periods per data class.
- **[Pending: HD-08]** exact Robinhood OAuth scope list.
- **[Pending: HD-10]** securities-counsel review of the registration question
  and the binding Terms clauses (warranty, liability cap, indemnification,
  dispute resolution).

---

## 7. What is explicitly NOT closeable by code

- The registration determination itself.
- The binding legalese in the Terms of Service (left as `[Pending: ...]` for
  counsel rather than drafted unilaterally).
- **Scheduling the consultation** — **[Pending: HD-10]** owner action.

*End of briefing package.*
