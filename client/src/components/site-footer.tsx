import { Link } from "wouter";
import {
  TRADEMARK_ROBINHOOD_SHORT,
  NOT_ADVICE,
  RISK_GENERAL,
  firstSentence,
} from "@shared/disclosures";

const LEGAL_LINKS = [
  { href: "/disclosures", label: "Disclosures" },
  { href: "/terms", label: "Terms" },
  { href: "/privacy", label: "Privacy" },
  { href: "/security", label: "Security" },
];

export function SiteFooter() {
  return (
    <footer
      className="mt-10 border-t border-border pt-6 pb-8 text-xs leading-relaxed text-muted-foreground"
      data-testid="site-footer"
    >
      <div className="mx-auto max-w-5xl space-y-3 px-1">
        <p data-testid="text-footer-trademark">{TRADEMARK_ROBINHOOD_SHORT}</p>
        <p data-testid="text-footer-not-advice">
          {firstSentence(NOT_ADVICE)}{" "}
          <Link
            href="/disclosures"
            className="underline underline-offset-2"
            data-testid="link-footer-disclosures-advice"
          >
            Read the full disclosures
          </Link>
          .
        </p>
        <p data-testid="text-footer-risk">
          {firstSentence(RISK_GENERAL)}{" "}
          <Link
            href="/disclosures"
            className="underline underline-offset-2"
            data-testid="link-footer-disclosures-risk"
          >
            Learn more
          </Link>
          .
        </p>
        <nav className="flex flex-wrap gap-x-4 gap-y-2 pt-1" aria-label="Legal">
          {LEGAL_LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="underline underline-offset-2"
              data-testid={`link-footer-${l.label.toLowerCase()}`}
            >
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
