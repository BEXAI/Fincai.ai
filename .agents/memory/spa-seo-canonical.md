---
name: SPA SEO canonical + GEO setup
description: How Fincai does client-rendered + crawler-injected SEO/GEO from one shared source, and the canonical-vs-sitemap trap that silently deindexes pages.
---

Fincai is a client-rendered React SPA. There is ONE source of truth for per-route SEO: `shared/seo-config.ts` (route map + `getRouteSeo`, `getAllRoutes`, `buildRouteJsonLd`, `injectRouteSeo`, `SITE_URL`, `SEO_COMPLIANCE_LINE`, `ROBINHOOD_DISCLAIMER`). Both the server injector and the client applier read it, so crawler-served and client-rendered metadata can never drift.

**Rule:** to add/change a public page's SEO, edit only `shared/seo-config.ts` (+ `client/public/sitemap.xml` if it's a sitemap URL). Do not hardcode titles/canonicals in pages.

Three layers, all fed by that map:
- **Boot fallback:** `client/index.html` hardcodes an absolute homepage canonical + OG/Twitter and the global FAQPage/Org JSON-LD. Every route boots with this before JS/crawler injection.
- **Server crawler injection:** `server/index.ts` middleware `injectRouteSeo` rewrites the served HTML per-route FOR CRAWLERS ONLY. It skips non-GET, `/api`, static extensions, and non-crawler UAs; unmapped routes call `next()` (fall through to the boot fallback / Vite). Crawler list covers search + social + AI bots (Googlebot/GPTBot/ClaudeBot/PerplexityBot…). baseUrl = `process.env.SITE_URL || SITE_URL`. Dev reads `client/index.html`; prod reads `import.meta.dirname/public/index.html`.
- **Client applier:** `client/src/components/seo.tsx` exports `useSeo({title,description,path})`, `<Seo>`, and `<RouteSeo>`. All converge on one `applyRouteSeo(pathname)` that upserts title/description/canonical/og/twitter and syncs `script[data-seo-route]` JSON-LD. `<RouteSeo>` is mounted ONCE in `App.tsx` (inside providers, above the auth/immersive/main early-returns) and re-runs on every wouter location change.

**Canonical/sitemap trap (the core lesson):** a sitemap route that does NOT set its own canonical inherits index.html's hardcoded homepage canonical → Googlebot treats it as a duplicate of "/" and drops it. Fixed by the shared map + `RouteSeo`. **Why RouteSeo exists:** unmapped SPA routes (`/alerts`, `/options`, `/compare`, not-found, …) used to keep the PREVIOUS route's stale title/canonical/JSON-LD after client-side nav. `applyRouteSeo` handles unmapped routes by falling back to the homepage title/description but self-canonicalizing to `SITE_URL+pathname` and CLEARING route JSON-LD. Mapped routes canonicalize via their configured `route.path` (so aliases like `/agent` → `/` still collapse correctly).

**How to apply:** new public page → add a route entry in `shared/seo-config.ts` (unique keyword title/description/path + any JSON-LD), add `<Seo path="/x" />` or `useSeo({path:"/x"})` in the page (idempotent with RouteSeo, harmless), and add the sitemap URL. Removing a page → remove its map entry and sitemap URL together.

**AI-search landing pages:** high-intent keyword landing pages share ONE layout component and pass copy as props; each needs HowTo + FAQPage JSON-LD in its seo-config entry (a `buildFaqJsonLd` helper exists). **Non-negotiable:** every such landing page MUST render BOTH the compliance disclosure AND the Robinhood non-affiliation disclosure — a shared layout that gates the non-affiliation alert behind a flag will silently drop it if a page forgets to opt in (this failed code review once). Prefer defaulting the disclosure ON, or assert both alerts render per page.

GEO assets in `client/public/` (root in dev via Vite, prod via express.static from `dist/public`): `robots.txt`, `sitemap.xml`, `llms.txt`. In robots.txt each named AI/search UA group repeats `Disallow: /api/` because a named group fully overrides the `*` group per the robots spec. **Compliance is a hard constraint in all SEO/GEO copy + JSON-LD:** informational-only, "not a registered investment adviser", confirmation-first execution, paper-by-default, explicit Robinhood non-affiliation, and NO fabricated aggregateRating/reviews (deliberately omitted from JSON-LD).
