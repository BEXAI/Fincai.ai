import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { getAllRoutes, injectRouteSeo } from "@shared/seo-config";
import { TRADEMARK_ROBINHOOD_SHORT } from "@shared/disclosures";

/**
 * Compliance CI checks, implemented as vitest so they run in the same gate as
 * the rest of the suite. These mirror `ci_checks` in the compliance
 * remediation spec:
 *   - banned_phrase_lint       — hard fail on banned marketing phrases
 *   - placeholder_check        — hard fail on surviving {{TOKEN}} placeholders
 *   - performance_claim_regex  — warn + manual-approval allowlist gate
 *   - disclosure_presence_check — trademark disclaimer on every prerendered route
 *
 * Scope = the shipped frontend/app bundle: client/src, shared, client/public.
 * Test files are excluded because they do not ship and (for this file) would
 * match their own pattern definitions.
 */

const ROOT = process.cwd();
const SCAN_DIRS = ["client/src", "shared", "client/public"];
// Individual files outside the scan dirs that still ship to browsers/scrapers.
// client/index.html is the raw base template served to every browser and to
// social/OG crawlers that don't run JS, so its meta/JSON-LD/noscript copy must
// pass the same banned-phrase gate as the app bundle.
const SCAN_FILES = ["client/index.html"];
const SCAN_EXT = new Set([".ts", ".tsx", ".html"]);

function isExcluded(relPath: string): boolean {
  const p = relPath.split(sep).join("/");
  return (
    p.includes("/test/") ||
    p.includes("/tests/") ||
    p.includes("/__tests__/") ||
    /\.test\.tsx?$/.test(p) ||
    /\.d\.ts$/.test(p)
  );
}

function walk(dir: string, acc: string[]): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (name === "node_modules") continue;
      walk(full, acc);
    } else {
      const ext = name.slice(name.lastIndexOf("."));
      if (SCAN_EXT.has(ext)) acc.push(full);
    }
  }
}

function collectFiles(): { abs: string; rel: string; text: string }[] {
  const files: string[] = [];
  for (const d of SCAN_DIRS) walk(resolve(ROOT, d), files);
  for (const f of SCAN_FILES) files.push(resolve(ROOT, f));
  return Array.from(new Set(files))
    .map((abs) => ({ abs, rel: abs.slice(ROOT.length + 1) }))
    .filter((f) => !isExcluded(f.rel))
    .map((f) => ({ ...f, text: readFileSync(f.abs, "utf8") }));
}

interface Hit {
  rel: string;
  line: number;
  match: string;
  lineText: string;
}

function scan(regexes: RegExp[]): Hit[] {
  const files = collectFiles();
  const hits: Hit[] = [];
  for (const f of files) {
    const seen = new Set<string>();
    // Pass 1 — per line, so single-line matches report an accurate line number.
    const lines = f.text.split("\n");
    lines.forEach((lineText, i) => {
      for (const re of regexes) {
        const rx = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
        let m: RegExpExecArray | null;
        while ((m = rx.exec(lineText)) !== null) {
          hits.push({ rel: f.rel, line: i + 1, match: m[0], lineText: lineText.trim() });
          seen.add(`${re.source}|${m[0].toLowerCase()}`);
          if (m.index === rx.lastIndex) rx.lastIndex++;
        }
      }
    });
    // Pass 2 — whitespace-collapsed full text, so a banned phrase that wraps
    // across lines in JSX (e.g. "Every\n  trade ... confirmation") is still
    // caught. `[^.]` in the patterns still stops at sentence boundaries, so this
    // only joins words WITHIN a sentence and cannot invent cross-sentence
    // matches. Matches already reported by the per-line pass are de-duped.
    const normalized = f.text.replace(/\s+/g, " ");
    for (const re of regexes) {
      const rx = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
      let m: RegExpExecArray | null;
      while ((m = rx.exec(normalized)) !== null) {
        const key = `${re.source}|${m[0].toLowerCase()}`;
        if (!seen.has(key)) {
          seen.add(key);
          const start = Math.max(0, m.index - 40);
          const end = Math.min(normalized.length, m.index + m[0].length + 40);
          hits.push({ rel: f.rel, line: 0, match: m[0], lineText: normalized.slice(start, end).trim() });
        }
        if (m.index === rx.lastIndex) rx.lastIndex++;
      }
    }
  }
  return hits;
}

const fmt = (hits: Hit[]) =>
  hits.map((h) => `  ${h.rel}:${h.line}  «${h.match}»  ${h.lineText}`).join("\n");

describe("banned_phrase_lint", () => {
  const BANNED: RegExp[] = [
    /institutional[- ]grade/i,
    /bank[- ]level security/i,
    /military[- ]grade/i,
    /guaranteed (returns|profits|gains)/i,
    /risk[- ]free/i,
    /beat the market/i,
    /powered by robinhood/i,
    /partnered with robinhood/i,
    /backed by robinhood/i,
    // Universal per-order confirmation over-claims. The autonomous strategy
    // runner places live orders unattended once a user arms a strategy live, so
    // "you confirm every trade/order" is inaccurate. Accurate copy scopes
    // confirmation to MANUAL trades (e.g. "manual trades you confirm"), which
    // does NOT match these patterns.
    /confirm(?:s|ing)? every (?:\w+ )?(?:trade|order)/i,
    /every (?:trade|order)[^.]*\b(?:needs?|requires?)\b[^.]*confirm/i,
    /\balways confirm\b/i,
    // Inherently-blanket confirmation claim — can never be scoped to manual
    // trades, so it is always inaccurate given the unattended autonomous runner.
    // (The accurate "manual trades execute only after you confirm" phrasing is
    // deliberately NOT matched here.)
    /nothing executes until you confirm/i,
  ];

  /**
   * Reviewed, acceptable matches. "risk-free rate" is the standard Black–Scholes
   * discount-rate term used by the pricing engine, not a marketing claim that
   * trading is safe. Any OTHER "risk-free" usage must fail.
   */
  const isAllowlisted = (h: Hit): boolean =>
    h.rel.endsWith("shared/engine-spec.ts") &&
    /risk-free rate/i.test(h.lineText);

  it("finds no banned marketing phrases in the shipped bundle", () => {
    const violations = scan(BANNED).filter((h) => !isAllowlisted(h));
    expect(violations, `Banned phrase(s) found:\n${fmt(violations)}`).toEqual([]);
  });
});

describe("placeholder_check", () => {
  it("has no surviving {{TOKEN}} placeholders in the shipped bundle", () => {
    const hits = scan([/\{\{[A-Z_0-9-]+\}\}/]);
    expect(
      hits,
      `Unresolved placeholder token(s) found (use the <Pending> marker instead):\n${fmt(hits)}`,
    ).toEqual([]);
  });
});

describe("performance_claim_regex", () => {
  const PERF: RegExp[] = [
    /\d+(\.\d+)?%\s*(return|gain|profit|win rate|accuracy|ROI)/i,
    /\$[\d,]+\s*(profit|gain|made|earned)/i,
    /(up|down)\s+\d+(\.\d+)?%\s+(this|last)\s+(week|month|year)/i,
    /\bsharpe\b/i,
    /\bbacktest(ed)?\b/i,
  ];

  /**
   * Manual-approval record (the spec's action is warn_and_require_manual_approval).
   * The Walmart case study is a HYPOTHETICAL, forward-looking options
   * illustration — the page labels it "not a projection of results or past
   * performance" and carries a substantial-risk / not-financial-advice
   * disclaimer. These specific figures were human-reviewed and approved.
   * The allowlist is scoped to the exact file AND the exact matched strings, so
   * a NEW or different performance figure — in this file or anywhere else —
   * fails this test until a human reviews it and adds it here.
   */
  const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
  const APPROVED: { rel: string; matches: Set<string> }[] = [
    {
      rel: "client/src/pages/walmart-case-study.tsx",
      matches: new Set(["50% gain", "100% gain", "100% roi", "150% roi"]),
    },
  ];
  const isApproved = (h: Hit): boolean =>
    APPROVED.some((a) => a.rel === h.rel && a.matches.has(norm(h.match)));

  it("flags no unreviewed numeric performance claims", () => {
    const unreviewed = scan(PERF).filter((h) => !isApproved(h));
    expect(
      unreviewed,
      `Unreviewed performance claim(s) — review, and if hypothetical/illustrative add the exact match to APPROVED:\n${fmt(unreviewed)}`,
    ).toEqual([]);
  });
});

describe("disclosure_presence_check", () => {
  it("injects the trademark disclaimer into every prerendered route", () => {
    const template = readFileSync(resolve(ROOT, "client/index.html"), "utf8");
    // Sanity: the real base template must carry a <noscript> block for injection.
    expect(/<noscript>[\s\S]*?<\/noscript>/i.test(template)).toBe(true);

    const routes = getAllRoutes();
    expect(routes.length).toBeGreaterThan(0);

    const missing: string[] = [];
    for (const route of routes) {
      const html = injectRouteSeo(template, route);
      if (!html.includes(TRADEMARK_ROBINHOOD_SHORT)) missing.push(route.path);
    }
    expect(
      missing,
      `Routes missing "${TRADEMARK_ROBINHOOD_SHORT}" in prerendered HTML:\n  ${missing.join("\n  ")}`,
    ).toEqual([]);
  });
});
