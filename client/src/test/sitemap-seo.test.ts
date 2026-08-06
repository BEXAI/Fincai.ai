import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import {
  SITE_URL,
  getRouteSeo,
  getAllRoutes,
  SITEMAP_EXCLUDED_PATHS,
} from "@shared/seo-config";

// Resolve the repo root from this test file's location so the check works
// regardless of the process cwd.
const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
);
const SITEMAP_PATH = path.join(REPO_ROOT, "client", "public", "sitemap.xml");

/** Extract every <loc> URL from the sitemap. */
function readSitemapUrls(): string[] {
  const xml = readFileSync(SITEMAP_PATH, "utf8");
  const locs = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map(
    (m) => m[1],
  );
  return locs;
}

/** Convert a full sitemap URL into a path beginning with "/". */
function urlToPath(url: string): string {
  const rest = url.startsWith(SITE_URL) ? url.slice(SITE_URL.length) : url;
  const withSlash = rest.startsWith("/") ? rest : `/${rest}`;
  // Strip a trailing slash (except for the root "/") to match normalizePath.
  return withSlash.length > 1 ? withSlash.replace(/\/+$/, "") : withSlash;
}

const HOMEPAGE_TITLE = getRouteSeo("/")?.title;

describe("sitemap ↔ seo-config coverage", () => {
  const urls = readSitemapUrls();

  it("sitemap has entries and the homepage is configured", () => {
    expect(urls.length).toBeGreaterThan(0);
    expect(HOMEPAGE_TITLE, "homepage route must define a title").toBeTruthy();
  });

  it.each(urls)(
    "%s has a self-canonical SEO config entry",
    (url) => {
      const pathname = urlToPath(url);
      const route = getRouteSeo(pathname);

      // 1. Every sitemap URL must have a config entry.
      expect(
        route,
        `sitemap URL ${url} (path "${pathname}") has no entry in shared/seo-config.ts — it will silently inherit the homepage canonical and get dropped from search.`,
      ).toBeDefined();
      if (!route) return;

      // 2. The entry must self-reference its canonical: the resolved route path
      //    must equal the sitemap path. If it aliases elsewhere (e.g. -> "/"),
      //    the canonical points at another page and the URL gets deindexed.
      expect(
        route.path,
        `sitemap URL ${url} resolves to canonical "${SITE_URL}${route.path}" instead of itself — a sitemap URL must be its own canonical, not an alias.`,
      ).toBe(pathname);

      // 3. Non-empty title + description.
      expect(
        route.title?.trim(),
        `sitemap URL ${url} has an empty title.`,
      ).toBeTruthy();
      expect(
        route.description?.trim(),
        `sitemap URL ${url} has an empty description.`,
      ).toBeTruthy();

      // 4. Non-homepage URLs must not reuse the homepage title.
      if (pathname !== "/") {
        expect(
          route.title,
          `sitemap URL ${url} reuses the homepage title "${HOMEPAGE_TITLE}" — give it a unique, page-specific title.`,
        ).not.toBe(HOMEPAGE_TITLE);
      }
    },
  );

  it("no two configured routes share a title (unique titles)", () => {
    const seen = new Map<string, string>();
    for (const route of getAllRoutes()) {
      const existing = seen.get(route.title);
      expect(
        existing,
        `routes "${existing}" and "${route.path}" share the identical title "${route.title}" — titles must be unique per page.`,
      ).toBeUndefined();
      seen.set(route.title, route.path);
    }
  });
});

describe("seo-config → sitemap coverage (reverse direction)", () => {
  const sitemapPaths = new Set(readSitemapUrls().map(urlToPath));

  // Every configured route that is NOT explicitly excluded is considered
  // public/indexable and MUST be discoverable via the sitemap.
  const indexableRoutes = getAllRoutes().filter(
    (r) => !SITEMAP_EXCLUDED_PATHS.has(r.path),
  );

  it.each(indexableRoutes.map((r) => r.path))(
    "configured route %s is present in sitemap.xml",
    (routePath) => {
      expect(
        sitemapPaths.has(routePath),
        `route "${routePath}" has an SEO config entry in shared/seo-config.ts but is missing from client/public/sitemap.xml — crawlers will never discover it. Add it to the sitemap, or add it to SITEMAP_EXCLUDED_PATHS if it is intentionally app-only.`,
      ).toBe(true);
    },
  );

  it("SITEMAP_EXCLUDED_PATHS stays consistent (no stale or contradictory entries)", () => {
    for (const excluded of SITEMAP_EXCLUDED_PATHS) {
      // The exclusion must reference a real, configured route.
      expect(
        getRouteSeo(excluded),
        `SITEMAP_EXCLUDED_PATHS lists "${excluded}", which has no entry in shared/seo-config.ts — remove the stale exclusion.`,
      ).toBeDefined();

      // A path can't be both excluded AND in the sitemap.
      expect(
        sitemapPaths.has(excluded),
        `SITEMAP_EXCLUDED_PATHS lists "${excluded}", but it IS present in client/public/sitemap.xml — remove it from one place or the other.`,
      ).toBe(false);
    }
  });
});
