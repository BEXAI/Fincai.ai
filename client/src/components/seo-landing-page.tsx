import { Link } from "wouter";
import type { LucideIcon } from "lucide-react";
import { ArrowRight, Info, AlertTriangle } from "lucide-react";
import { Seo } from "@/components/seo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

export interface LandingItem {
  icon: LucideIcon;
  title: string;
  detail: string;
}

export interface LandingFaq {
  q: string;
  a: string;
}

export interface LandingCta {
  href: string;
  label: string;
}

export interface SeoLandingPageProps {
  /** Canonical path for the shared SEO map. */
  seoPath: string;
  badge: string;
  h1: string;
  subtitle: string;
  primaryCta: LandingCta;
  secondaryCta?: LandingCta;
  stepsTitle: string;
  steps: LandingItem[];
  capabilitiesTitle: string;
  capabilities: LandingItem[];
  faqs: LandingFaq[];
  ctaTitle: string;
  ctaText: string;
  /** When true, render the Robinhood non-affiliation disclosure. */
  showRobinhoodDisclaimer?: boolean;
}

/**
 * Shared, keyword-focused SEO landing page layout used by the high-intent
 * AI-search landing routes. Copy is passed in per-route; compliance and
 * (optionally) Robinhood non-affiliation disclosures are rendered here so every
 * page stays consistent and compliant.
 */
export function SeoLandingPage({
  seoPath,
  badge,
  h1,
  subtitle,
  primaryCta,
  secondaryCta,
  stepsTitle,
  steps,
  capabilitiesTitle,
  capabilities,
  faqs,
  ctaTitle,
  ctaText,
  showRobinhoodDisclaimer = false,
}: SeoLandingPageProps) {
  return (
    <div className="mx-auto max-w-5xl space-y-10 px-4 py-8">
      <Seo path={seoPath} />

      {/* Hero */}
      <section className="space-y-4">
        <Badge variant="secondary" data-testid="badge-hero">
          {badge}
        </Badge>
        <h1
          className="text-3xl font-semibold tracking-tight sm:text-4xl"
          data-testid="text-page-title"
        >
          {h1}
        </h1>
        <p
          className="max-w-3xl text-lg text-muted-foreground"
          data-testid="text-hero-subtitle"
        >
          {subtitle}
        </p>
        <div className="flex flex-wrap gap-3">
          <Button asChild size="lg">
            <Link href={primaryCta.href} data-testid="link-primary-cta">
              {primaryCta.label}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
          {secondaryCta && (
            <Button asChild size="lg" variant="outline">
              <Link href={secondaryCta.href} data-testid="link-secondary-cta">
                {secondaryCta.label}
              </Link>
            </Button>
          )}
        </div>
      </section>

      {showRobinhoodDisclaimer && (
        <Alert data-testid="alert-non-affiliation">
          <Info className="h-4 w-4" />
          <AlertTitle>
            Independent product — not affiliated with Robinhood
          </AlertTitle>
          <AlertDescription>
            Fincai is an independent product and is not affiliated with,
            endorsed by, or sponsored by Robinhood Markets, Inc. Fincai connects
            to Robinhood only through Robinhood's official Trading API using
            secure OAuth authorization, and never sees or stores your Robinhood
            password. Robinhood is a trademark of its respective owner.
          </AlertDescription>
        </Alert>
      )}

      {/* How it works */}
      <section className="space-y-4">
        <h2 className="text-2xl font-semibold" data-testid="text-how-title">
          {stepsTitle}
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {steps.map((step, i) => (
            <Card key={step.title} data-testid={`card-step-${i}`}>
              <CardHeader className="flex flex-row items-center gap-3 space-y-0">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <step.icon className="h-5 w-5" />
                </span>
                <CardTitle className="text-base">
                  {i + 1}. {step.title}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{step.detail}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Capabilities */}
      <section className="space-y-4">
        <h2 className="text-2xl font-semibold" data-testid="text-safety-title">
          {capabilitiesTitle}
        </h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {capabilities.map((cap, i) => (
            <Card key={cap.title} data-testid={`card-capability-${i}`}>
              <CardHeader className="flex flex-row items-center gap-3 space-y-0">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <cap.icon className="h-5 w-5" />
                </span>
                <CardTitle className="text-base">{cap.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{cap.detail}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section className="space-y-4">
        <h2 className="text-2xl font-semibold" data-testid="text-faq-title">
          Frequently asked questions
        </h2>
        <Accordion type="single" collapsible className="w-full">
          {faqs.map((faq, i) => (
            <AccordionItem
              key={faq.q}
              value={`faq-${i}`}
              data-testid={`faq-item-${i}`}
            >
              <AccordionTrigger
                className="text-left"
                data-testid={`faq-trigger-${i}`}
              >
                {faq.q}
              </AccordionTrigger>
              <AccordionContent data-testid={`faq-answer-${i}`}>
                {faq.a}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </section>

      {/* Final CTA */}
      <section className="space-y-4 rounded-md border p-6 text-center">
        <h2 className="text-2xl font-semibold" data-testid="text-cta-title">
          {ctaTitle}
        </h2>
        <p className="mx-auto max-w-2xl text-muted-foreground">{ctaText}</p>
        <div className="flex justify-center">
          <Button asChild size="lg">
            <Link href={primaryCta.href} data-testid="link-cta-primary">
              {primaryCta.label}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </section>

      {/* Compliance disclaimer */}
      <Alert data-testid="alert-compliance">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Important disclosure</AlertTitle>
        <AlertDescription>
          Fincai is for informational purposes only and is not a registered
          investment adviser. It does not provide personalized financial or
          investment advice. Trading stocks and options involves risk, including
          the possible loss of principal. You are responsible for all trading
          activity in your account, including trades you confirm and trades
          executed by autonomous strategies you enable.
        </AlertDescription>
      </Alert>
    </div>
  );
}
