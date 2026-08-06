import { useEffect } from "react";
import { useLocation } from "wouter";
import {
  SITE_URL,
  getRouteSeo,
  buildRouteJsonLd,
} from "@shared/seo-config";

const ROUTE_LD_ATTR = "data-seo-route";

/** Site-wide defaults, used for routes not present in the shared SEO map. */
const DEFAULT_SEO = getRouteSeo("/");

function upsertMeta(attr: "name" | "property", key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function upsertCanonical(href: string) {
  let el = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!el) {
    el = document.createElement("link");
    el.rel = "canonical";
    document.head.appendChild(el);
  }
  el.href = href;
}

/** Replace any previously-injected route JSON-LD with the current route's set. */
function syncRouteJsonLd(objects: Record<string, unknown>[]) {
  document.head
    .querySelectorAll(`script[${ROUTE_LD_ATTR}]`)
    .forEach((el) => el.remove());
  for (const obj of objects) {
    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.setAttribute(ROUTE_LD_ATTR, "");
    script.textContent = JSON.stringify(obj);
    document.head.appendChild(script);
  }
}

/**
 * Apply per-route SEO to the live document for `pathname`.
 * - Mapped routes get their title/description/canonical/OG/Twitter + route JSON-LD.
 * - Unmapped routes fall back to the site default title/description, a
 *   self-referencing canonical (so the actual URL is indexed, not the homepage),
 *   and no route JSON-LD — preventing stale metadata from leaking across
 *   client-side navigations.
 */
function applyRouteSeo(pathname: string, overrides?: SeoProps) {
  const route = getRouteSeo(pathname);
  const title = overrides?.title ?? route?.title ?? DEFAULT_SEO?.title;
  const description =
    overrides?.description ?? route?.description ?? DEFAULT_SEO?.description;
  // Mapped routes canonicalize via their configured path (handles aliases like
  // "/agent" -> "/"); unmapped routes canonicalize to their own path.
  const canonicalPath = route?.path ?? pathname;
  const url = SITE_URL + canonicalPath;

  if (title) {
    document.title = title;
    upsertMeta("property", "og:title", title);
    upsertMeta("name", "twitter:title", title);
  }
  if (description) {
    upsertMeta("name", "description", description);
    upsertMeta("property", "og:description", description);
    upsertMeta("name", "twitter:description", description);
  }
  upsertCanonical(url);
  upsertMeta("property", "og:url", url);

  syncRouteJsonLd(route ? buildRouteJsonLd(route, SITE_URL) : []);
}

export interface SeoProps {
  /** Canonical path beginning with "/". Defaults to the current pathname. */
  path?: string;
  /** Optional overrides; when omitted, values come from the shared route map. */
  title?: string;
  description?: string;
}

/**
 * Per-route SEO driven by the shared `@shared/seo-config` map — the same source
 * the server injector reads, so client-rendered and crawler-served metadata
 * never drift. Updates the document title, meta description, canonical link,
 * Open Graph / Twitter tags, and route JSON-LD.
 */
export function useSeo(props: SeoProps = {}) {
  const { title, description, path } = props;
  useEffect(() => {
    const pathname =
      path ?? (typeof window !== "undefined" ? window.location.pathname : "/");
    applyRouteSeo(pathname, { title, description });
  }, [title, description, path]);
}

/** Component wrapper around {@link useSeo}. Renders nothing. */
export function Seo(props: SeoProps) {
  useSeo(props);
  return null;
}

/**
 * App-level, location-driven SEO applier. Mount exactly once near the root so
 * EVERY client-side navigation (including routes with no page-level `useSeo`,
 * and unmapped routes) resets the document metadata correctly. Idempotent with
 * page-level `useSeo`/`Seo` — both converge to the same map-derived state.
 */
export function RouteSeo() {
  const [location] = useLocation();
  useEffect(() => {
    applyRouteSeo(location);
  }, [location]);
  return null;
}
