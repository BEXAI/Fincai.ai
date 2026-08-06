import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { getRouteSeo } from "@shared/seo-config";

// Resolve the repo root from this test file's location so the check works
// regardless of the process cwd.
const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
);
const APP_TSX_PATH = path.join(REPO_ROOT, "client", "src", "App.tsx");

/**
 * Extract every path registered on a <Route path="..."> in the app router.
 * The catch-all <Route component={NotFound} /> has no `path` and is ignored.
 */
function readRouterPaths(): string[] {
  const src = readFileSync(APP_TSX_PATH, "utf8");
  const paths = [...src.matchAll(/<Route\s+path="([^"]+)"/g)].map((m) => m[1]);
  return [...new Set(paths)];
}

/**
 * Routes registered in the router that intentionally have NO SEO metadata.
 * These are app-only / authenticated / dynamic surfaces that should never be
 * indexed and should never inherit the homepage canonical from search's POV
 * (they're behind auth gates, are user-scoped detail views, or are utility
 * pages we don't market). This is the explicit escape hatch: a NEW public
 * marketing/tool page added to the router with no seo-config entry will fail
 * the coverage test below unless it is deliberately listed here.
 *
 * Distinct from SITEMAP_EXCLUDED_PATHS (routes that DO have SEO metadata but
 * are kept out of the sitemap) and from ALIASES (e.g. "/agent" -> "/", which
 * resolves to real metadata and therefore is NOT listed here).
 */
const APP_ONLY_ROUTES: ReadonlySet<string> = new Set<string>([
  "/strategy-performance", // internal performance view, not marketed
  "/strategies/:id", // user-scoped strategy detail (dynamic)
  "/compare", // strategy comparison workspace
  "/trade-journal", // profile + journal, gated on the visitor's own data
  "/performance", // personal performance dashboard
  "/alerts", // auth-gated: price alerts
  "/options", // auth-gated: options chain
  "/ai-recommendations", // auth-gated: AI recommendations
  "/volatility-surface", // auth-gated: volatility surface
]);

describe("router ↔ seo-config coverage (App.tsx routes)", () => {
  const routerPaths = readRouterPaths();

  it("the router registers routes and the homepage is one of them", () => {
    expect(routerPaths.length).toBeGreaterThan(0);
    expect(
      routerPaths.includes("/"),
      "expected App.tsx to register the homepage route \"/\"",
    ).toBe(true);
  });

  it.each(routerPaths)(
    "router route %s is either SEO-configured or explicitly app-only",
    (routePath) => {
      const hasSeo = getRouteSeo(routePath) !== undefined;
      const isAppOnly = APP_ONLY_ROUTES.has(routePath);

      expect(
        hasSeo || isAppOnly,
        `route "${routePath}" is registered in client/src/App.tsx but has no entry in shared/seo-config.ts. ` +
          `It will render yet silently inherit the homepage title/description/canonical — bad for search and users. ` +
          `Add a getRouteSeo() entry (and a sitemap.xml row) if it is a public page, ` +
          `or add it to APP_ONLY_ROUTES in this test if it is genuinely app-only/authenticated.`,
      ).toBe(true);
    },
  );

  it("APP_ONLY_ROUTES has no stale entries (each is still a real router route)", () => {
    const registered = new Set(routerPaths);
    for (const appOnly of APP_ONLY_ROUTES) {
      expect(
        registered.has(appOnly),
        `APP_ONLY_ROUTES lists "${appOnly}", which is no longer registered in client/src/App.tsx — remove the stale entry.`,
      ).toBe(true);
    }
  });

  it("APP_ONLY_ROUTES and seo-config don't contradict each other", () => {
    for (const appOnly of APP_ONLY_ROUTES) {
      expect(
        getRouteSeo(appOnly),
        `route "${appOnly}" is listed in APP_ONLY_ROUTES (intentionally no SEO) but DOES have an entry in shared/seo-config.ts. ` +
          `If it is public, remove it from APP_ONLY_ROUTES; if it should have metadata but stay out of the sitemap, use SITEMAP_EXCLUDED_PATHS instead.`,
      ).toBeUndefined();
    }
  });
});
