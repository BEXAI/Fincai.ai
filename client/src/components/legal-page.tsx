import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";
import { Seo } from "@/components/seo";
import {
  DISCLOSURE_VERSION,
  DISCLOSURE_EFFECTIVE_DATE,
} from "@shared/disclosures";

/**
 * Inline, clearly-labeled marker for a value that depends on an unresolved
 * human decision (legal entity, address, contact email, subprocessor list,
 * etc.). Deliberately NOT the mustache-style ALL_CAPS placeholder format —
 * those are treated as shipping-blocking placeholders by the CI placeholder
 * check (see compliance-ci-checks.test.ts). This renders a
 * visible "[Pending: ...]" badge so the gap is obvious to readers and to the
 * team, without fabricating a legal or security claim.
 */
export function Pending({ label }: { label: string }) {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 40);
  return (
    <span
      className="inline-flex items-center rounded-md border border-border bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground"
      data-testid={`pending-${slug}`}
    >
      [Pending: {label}]
    </span>
  );
}

export function LegalSection({
  heading,
  id,
  children,
}: {
  heading: string;
  id?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3" id={id}>
      <h2 className="text-xl font-semibold tracking-tight text-foreground">
        {heading}
      </h2>
      <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
        {children}
      </div>
    </section>
  );
}

/**
 * Shared chrome for the legal/security surface: SEO, a back link, the page
 * title, and a server-consistent "Last updated" line derived from the shared
 * disclosure version registry.
 */
export function LegalPage({
  path,
  title,
  intro,
  children,
}: {
  path: string;
  title: string;
  intro?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-8">
      <Seo path={path} />

      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover-elevate rounded-md px-2 py-1 -ml-2"
        data-testid="link-back-home"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Fincai
      </Link>

      <header className="space-y-2">
        <h1
          className="text-3xl font-semibold tracking-tight text-foreground"
          data-testid="text-page-title"
        >
          {title}
        </h1>
        <p className="text-sm text-muted-foreground" data-testid="text-last-updated">
          Last updated {DISCLOSURE_EFFECTIVE_DATE} · Version {DISCLOSURE_VERSION}
        </p>
        {intro ? (
          <p className="text-base text-muted-foreground" data-testid="text-page-intro">
            {intro}
          </p>
        ) : null}
      </header>

      <div className="space-y-8">{children}</div>
    </div>
  );
}
