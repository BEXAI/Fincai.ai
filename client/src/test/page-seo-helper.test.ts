import { readFileSync, existsSync, readdirSync } from "node:fs";
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
const CLIENT_SRC = path.join(REPO_ROOT, "client", "src");
const APP_TSX_PATH = path.join(CLIENT_SRC, "App.tsx");

/**
 * A "public page" here is any router path that resolves to real SEO metadata
 * via getRouteSeo() (marketed / indexable surfaces). App-only / authenticated
 * routes have NO seo-config entry (see APP_ONLY_ROUTES in router-seo.test.ts)
 * and are therefore naturally excluded — no duplicate allowlist to keep in sync.
 *
 * The companion router-seo.test.ts guards router ↔ seo-config coverage (every
 * public route HAS metadata). This test guards the next hop: the actual page
 * COMPONENT for each public route must mount the client-side SEO helper
 * (useSeo/Seo from client/src/components/seo.tsx) so a real browser and any
 * JS-executing link-preview scraper get the per-route OG/Twitter/canonical
 * tags. Without it a page would silently inherit stale/homepage tags on
 * client-side navigation, producing bad social share previews.
 */

/**
 * Public pages that intentionally rely ONLY on the app-level <RouteSeo />
 * safety net (mounted once in App.tsx) and do NOT call useSeo/Seo themselves.
 * Empty by design today: every public page sets its own per-route metadata.
 *
 * This is the explicit escape hatch — a new public page that deliberately
 * defers to RouteSeo must be listed here (with justification), otherwise the
 * coverage test below fails. RouteSeo already resets metadata on every
 * navigation, so listing a page here is safe for tags; the per-page helper is
 * enforced anyway so page authors keep SEO a first-class, visible concern.
 */
const ROUTESEO_ONLY_PAGES: ReadonlySet<string> = new Set<string>([]);

interface RouteBinding {
  routePath: string;
  componentName: string;
}

/**
 * Extract every <Route path="..."> and the component it renders. Handles both
 *   <Route path="/x" component={Foo} />
 * and inline render forms
 *   <Route path="/x">{() => <Foo ... />}</Route>
 * (for the inline form we take the first Capitalized JSX tag as the component).
 * The catch-all <Route component={NotFound} /> has no path and is ignored.
 */
function readRouteBindings(): RouteBinding[] {
  const src = readFileSync(APP_TSX_PATH, "utf8");
  const routeRegex =
    /<Route\s+path="([^"]+)"(?:\s+component=\{(\w+)\})?\s*(?:\/>|>([\s\S]*?)<\/Route>)/g;
  const bindings: RouteBinding[] = [];
  for (const m of src.matchAll(routeRegex)) {
    const routePath = m[1];
    let componentName = m[2];
    if (!componentName && m[3]) {
      // Inline render: first Capitalized JSX tag inside the children.
      const child = m[3].match(/<([A-Z]\w+)/);
      if (child) componentName = child[1];
    }
    if (componentName) bindings.push({ routePath, componentName });
  }
  return bindings;
}

/**
 * Map a component identifier used in App.tsx to its `@/pages/...` source file.
 * Covers both lazy imports:
 *   const Foo = lazy(() => import("@/pages/foo"));
 * and eager imports:
 *   import Foo from "@/pages/foo";
 */
function readPageComponentFiles(): Map<string, string> {
  const src = readFileSync(APP_TSX_PATH, "utf8");
  const map = new Map<string, string>();
  const lazyRegex =
    /const\s+(\w+)\s*=\s*lazy\(\s*\(\)\s*=>\s*import\(\s*["']@\/pages\/([^"']+)["']/g;
  for (const m of src.matchAll(lazyRegex)) {
    map.set(m[1], m[2]);
  }
  const eagerRegex = /import\s+(\w+)\s+from\s+["']@\/pages\/([^"']+)["']/g;
  for (const m of src.matchAll(eagerRegex)) {
    map.set(m[1], m[2]);
  }
  return map;
}

function resolvePageFile(relative: string): string | undefined {
  for (const ext of [".tsx", ".ts", "/index.tsx", "/index.ts", ""]) {
    const candidate = path.join(CLIENT_SRC, "pages", relative + ext);
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

/** True if the source directly mounts the base SEO helper (useSeo(...) or <Seo ...>). */
function usesBaseSeoHelper(source: string): boolean {
  return /\buseSeo\s*\(/.test(source) || /<Seo\b/.test(source);
}

/**
 * Discover shared components (under client/src/components) that themselves mount
 * the base SEO helper — e.g. <SeoLandingPage> renders <Seo /> internally. A page
 * that renders one of these is just as covered as one calling useSeo directly,
 * so we detect them dynamically instead of hardcoding wrapper names (which would
 * silently rot if a wrapper is renamed or a new one is introduced).
 */
function discoverSeoWrapperComponents(): Set<string> {
  const componentsDir = path.join(CLIENT_SRC, "components");
  const wrappers = new Set<string>();
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name.endsWith(".tsx")) {
        const source = readFileSync(full, "utf8");
        if (!usesBaseSeoHelper(source)) continue;
        for (const m of source.matchAll(/export\s+function\s+([A-Z]\w+)/g)) {
          wrappers.add(m[1]);
        }
        for (const m of source.matchAll(/export\s+const\s+([A-Z]\w+)/g)) {
          wrappers.add(m[1]);
        }
      }
    }
  };
  walk(componentsDir);
  return wrappers;
}

const SEO_WRAPPER_COMPONENTS = discoverSeoWrapperComponents();

/**
 * True if the source mounts SEO — either directly (useSeo/<Seo>) or by rendering
 * a discovered shared wrapper component that mounts it (e.g. <SeoLandingPage>).
 */
function usesSeoHelper(source: string): boolean {
  if (usesBaseSeoHelper(source)) return true;
  for (const wrapper of SEO_WRAPPER_COMPONENTS) {
    if (new RegExp(`<${wrapper}\\b`).test(source)) return true;
  }
  return false;
}

const routeBindings = readRouteBindings();
const componentFiles = readPageComponentFiles();

// Public routes = router paths that resolve to real SEO metadata, de-duped by
// the page component that renders them (so aliases like /agent -> / and any
// route pointing at the same page are only checked once).
const publicPagesByComponent = new Map<string, RouteBinding>();
for (const binding of routeBindings) {
  if (getRouteSeo(binding.routePath) === undefined) continue;
  if (!publicPagesByComponent.has(binding.componentName)) {
    publicPagesByComponent.set(binding.componentName, binding);
  }
}
const publicPages = [...publicPagesByComponent.values()];

describe("public page components mount the per-route SEO helper", () => {
  it("discovers public routes and their page components from App.tsx", () => {
    expect(routeBindings.length).toBeGreaterThan(0);
    expect(
      publicPages.length,
      "expected to discover at least one public (SEO-configured) page in App.tsx",
    ).toBeGreaterThan(0);
    expect(
      publicPages.some((b) => b.routePath === "/"),
      'expected the homepage route "/" to be a discovered public page',
    ).toBe(true);
  });

  it("mounts the app-level <RouteSeo /> safety net exactly once", () => {
    const src = readFileSync(APP_TSX_PATH, "utf8");
    const mounts = [...src.matchAll(/<RouteSeo\s*\/>/g)].length;
    expect(
      mounts,
      "App.tsx must mount <RouteSeo /> so every navigation (including RouteSeo-only pages) resets metadata",
    ).toBe(1);
  });

  it.each(publicPages)(
    "public route $routePath ($componentName) renders useSeo/Seo",
    ({ routePath, componentName }) => {
      if (ROUTESEO_ONLY_PAGES.has(componentName)) return; // relies on RouteSeo

      const relative = componentFiles.get(componentName);
      expect(
        relative,
        `component "${componentName}" (route "${routePath}") is not an @/pages import in App.tsx — ` +
          `cannot verify its SEO helper. If it is a public marketing/tool page, import it from @/pages.`,
      ).toBeDefined();

      const file = resolvePageFile(relative!);
      expect(
        file,
        `could not resolve source file for @/pages/${relative} (route "${routePath}")`,
      ).toBeDefined();

      const source = readFileSync(file!, "utf8");
      expect(
        usesSeoHelper(source),
        `public page "${componentName}" (route "${routePath}", ${path.relative(REPO_ROOT, file!)}) ` +
          `does not call useSeo(...) or render <Seo />. It has a seo-config entry but would ship without its ` +
          `per-route Open Graph/Twitter/canonical tags, so social/link-preview shares would show stale homepage ` +
          `metadata. Add useSeo()/<Seo /> from @/components/seo, or (rarely) add "${componentName}" to ` +
          `ROUTESEO_ONLY_PAGES in this test if it should intentionally rely only on the app-level <RouteSeo />.`,
      ).toBe(true);
    },
  );

  it("ROUTESEO_ONLY_PAGES has no stale entries (each is still a public page)", () => {
    const publicComponentNames = new Set(publicPages.map((b) => b.componentName));
    for (const name of ROUTESEO_ONLY_PAGES) {
      expect(
        publicComponentNames.has(name),
        `ROUTESEO_ONLY_PAGES lists "${name}", which is no longer a public page component in App.tsx — remove the stale entry.`,
      ).toBe(true);
    }
  });
});
