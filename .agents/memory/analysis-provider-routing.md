---
name: Multi-agent analysis provider routing (BYO OpenAI/Gemini)
description: How per-session analysis-provider selection is layered and why the Claude fallback is latched, not a separate probe.
---

# Multi-agent analysis provider routing

The multi-agent ANALYSIS system (technical/sentiment/fundamental agents + bull/bear debate)
can run on the built-in Claude (default) or a user's per-session bring-your-own OpenAI/Gemini key.
Tool-calling chat stays on Claude — only analysis is routable.

## Module layering (avoid an import cycle)
`anthropic.ts` → `llm-completions.ts` → `ai-provider-store.ts`.
**Why:** the shared Anthropic client + the `claudeCompleter` live in `anthropic.ts`, so the
dependency-free BYO completers (plain `fetch`, no SDKs) and `resolveAnalysisLlm` must live
*downstream* in `llm-completions.ts`. `llm-completions.ts` therefore must NOT import the Claude
completer from `anthropic.ts` (that would cycle). Consequence: any "fall back to Claude when the
BYO provider fails" logic has to be implemented inside `anthropic.ts` (it owns `claudeCompleter`),
not in `llm-completions.ts`.

## Latched fallback (not a health-check probe)
`runMultiAgentAnalysis` wraps a selected BYO completer so the FIRST call that throws latches the
entire run to `claudeCompleter` and the reported `analysisProvider` becomes `claude` + `fallbackUsed:true`.
**Why:** the common failure (revoked key / quota / outage) fails every call, so a single latch gives
accurate provenance without an extra paid "probe" LLM call, and avoids returning neutral results that
are misleadingly labelled as the BYO provider. Provenance is computed AFTER the bull/bear debate so a
fallback during the debate is also reflected.
**How to apply:** if you add more analysis sub-calls, route them through the same wrapped `complete`
and keep the provenance assignment last.

## Default = absence of a row
`claude` selection is represented by NO row in `aiAnalysisPreferences` (so anonymous sessions work with
zero setup). Selecting a BYO provider requires its key already connected; disconnecting a provider clears
any matching selection so the session reverts to Claude. Non-allowlisted models are coerced to the
provider default (safe — never executes an arbitrary model).
