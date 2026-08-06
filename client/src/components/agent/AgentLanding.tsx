import { Suspense, lazy, useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Loader2,
  Link2,
  ExternalLink,
  Copy,
  ShieldCheck,
  Lock,
  Hand,
  Sparkles,
  Cpu,
  Wand2,
  Gauge,
  LineChart,
  Bell,
  Layers,
  ArrowRight,
  PlayCircle,
  CircleAlert,
  FlaskConical,
} from "lucide-react";
import { Link } from "wouter";
import { BexaiDashboard } from "@/components/agent/BexaiDashboard";
import { PortfolioView } from "@/components/agent/PortfolioView";
import { useAgentConnect, type AgentConnectStatus } from "@/components/agent/use-agent-connect";

// Lazily code-split the scripted "watch it trade" demo so it never blocks the
// initial paint of the landing page.
const AgentTradeDemo = lazy(() => import("@/components/agent/AgentTradeDemo"));

function DemoSkeleton() {
  return (
    <div className="space-y-3 rounded-xl border border-[var(--glass-border)] glass-panel p-5">
      <div className="flex items-center justify-between gap-2">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-5 w-24" />
      </div>
      <Skeleton className="h-2 w-full" />
      <div className="space-y-2 pt-1">
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
      </div>
    </div>
  );
}

// Only mounts its children once they scroll near the viewport, so the lazy
// chunk is fetched on demand rather than on first render.
function LazyInView({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || show) return;
    if (typeof IntersectionObserver === "undefined") {
      setShow(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShow(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [show]);

  return (
    <div ref={ref}>
      {show ? (
        <Suspense fallback={<DemoSkeleton />}>{children}</Suspense>
      ) : (
        <DemoSkeleton />
      )}
    </div>
  );
}

const HOW_IT_WORKS = [
  {
    icon: Wand2,
    title: "Create your agent",
    detail: "Spin up your personal AI trading agent in one click — no setup, no API keys.",
  },
  {
    icon: ShieldCheck,
    title: "Authorize with Robinhood",
    detail: "Connect securely through Robinhood's official OAuth flow. You approve every permission.",
  },
  {
    icon: Cpu,
    title: "Let it trade",
    detail: "Watch the agent analyze markets live. Manual trades execute only after you confirm; autonomous strategies run in paper by default and go live only when you opt in.",
  },
];

const CAPABILITIES = [
  {
    icon: Gauge,
    title: "Real-time market reasoning",
    detail: "Continuous analysis of momentum, sentiment, and risk across your watchlist.",
  },
  {
    icon: Layers,
    title: "Equities & multi-leg options",
    detail: "Place stock, single-leg, and multi-leg option strategies straight from the terminal.",
  },
  {
    icon: LineChart,
    title: "Live portfolio intelligence",
    detail: "A unified view of holdings, P/L, and buying power, refreshed as the market moves.",
  },
  {
    icon: Bell,
    title: "You stay in control",
    detail: "Manual orders are previewed for your confirmation; autonomous strategies default to paper and require an explicit opt-in to trade live.",
  },
];

const TRUST_SIGNALS = [
  {
    icon: ShieldCheck,
    title: "Official OAuth 2.1 authorization",
    detail: "Connects through Robinhood's own authorize flow with PKCE — we never see your password.",
  },
  {
    icon: Lock,
    title: "Encrypted, durable connection",
    detail: "Your agent credentials are AES-256-GCM encrypted at rest and restored only for your session.",
  },
  {
    icon: Hand,
    title: "You're always in control",
    detail: "Manual trades execute only after you confirm. Autonomous strategies run in paper by default and go live only when you opt in.",
  },
];

const PENDING_CONNECT_KEY = "fincai:pendingAgentConnect";

export function AgentLanding({
  status,
  isAuthenticated = true,
  onNavigateToAuth,
}: {
  status: AgentConnectStatus;
  isAuthenticated?: boolean;
  onNavigateToAuth?: (mode: "login" | "register") => void;
}) {
  const { busy, handleConnect, copyUrl } = useAgentConnect(status);
  const autoConnectFired = useRef(false);

  const authorizing = status.status === "authorizing";
  const errored = status.status === "error";

  // Anonymous visitors get routed into sign-up first; once they come back
  // authenticated, automatically resume the connect flow they started.
  const handlePrimaryCta = () => {
    if (!isAuthenticated) {
      try {
        sessionStorage.setItem(PENDING_CONNECT_KEY, "1");
      } catch {
        // sessionStorage may be unavailable (private mode); fall through to auth.
      }
      onNavigateToAuth?.("register");
      return;
    }
    handleConnect();
  };

  useEffect(() => {
    if (!isAuthenticated || autoConnectFired.current) return;
    let pending = false;
    try {
      pending = sessionStorage.getItem(PENDING_CONNECT_KEY) === "1";
    } catch {
      pending = false;
    }
    if (pending) {
      autoConnectFired.current = true;
      try {
        sessionStorage.removeItem(PENDING_CONNECT_KEY);
      } catch {
        // ignore
      }
      handleConnect();
    }
  }, [isAuthenticated, handleConnect]);

  const ctaLabel = authorizing
    ? "Re-initiate connection"
    : isAuthenticated
      ? "Create your trading agent"
      : "Sign up to deploy your agent";

  return (
    <div className="space-y-12 pb-8" data-testid="agent-landing">
      {/* ============ HERO ============ */}
      <section className="relative overflow-hidden rounded-2xl border border-[var(--glass-border)] glass-panel">
        {/* Ambient gold wash */}
        <div
          className="pointer-events-none absolute inset-0 opacity-70"
          style={{
            background:
              "radial-gradient(60% 80% at 20% 0%, hsl(46 65% 52% / 0.16), transparent 60%), radial-gradient(50% 70% at 100% 100%, hsl(51 100% 50% / 0.10), transparent 60%)",
          }}
          aria-hidden="true"
        />
        <div className="relative grid gap-8 p-6 sm:p-10 lg:grid-cols-2 lg:items-center lg:gap-10">
          {/* Copy + CTA */}
          <div className="space-y-6">
            <Badge
              variant="secondary"
              className="gap-1.5 border border-[var(--glass-border)]"
              data-testid="badge-hero-eyebrow"
            >
              <Sparkles className="h-3 w-3 text-primary" />
              Autonomous AI Trading Agent
            </Badge>

            <h1
              className="font-display text-3xl font-semibold leading-tight tracking-tight text-balance sm:text-4xl lg:text-5xl"
              data-testid="text-hero-headline"
            >
              Deploy your own{" "}
              <span className="bg-gradient-to-r from-[hsl(43_75%_45%)] via-[hsl(46_65%_58%)] to-[hsl(51_100%_55%)] bg-clip-text text-transparent">
                agentic AI trading agent
              </span>{" "}
              for stocks &amp; options.
            </h1>

            <p
              className="max-w-xl text-base text-muted-foreground sm:text-lg"
              data-testid="text-hero-subheadline"
            >
              Fincai connects a live, reasoning AI agent to your Robinhood account through
              an official secure link. It scans the market, builds conviction, and executes
              trades — always under your control.
            </p>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Button
                size="lg"
                onClick={handlePrimaryCta}
                disabled={busy}
                className="btn-gold gap-2 text-base"
                data-testid="button-connect-agent"
              >
                {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Link2 className="h-5 w-5" />}
                {ctaLabel}
                {!busy && <ArrowRight className="h-4 w-4" />}
              </Button>
              <a
                href="#how-it-works"
                className="text-sm font-medium text-muted-foreground hover:text-foreground"
                data-testid="link-how-it-works"
              >
                See how it works
              </a>
              <Link
                href="/promo"
                className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
                data-testid="link-watch-promo"
              >
                <PlayCircle className="h-4 w-4" />
                Watch the tour
              </Link>
            </div>

            {/* Trust bar — answers the first objection at the moment it forms */}
            <div
              className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground"
              data-testid="trust-bar"
            >
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5 text-primary" /> OAuth only — no password sharing
              </span>
              <span className="flex items-center gap-1.5">
                <Lock className="h-3.5 w-3.5 text-primary" /> Can't move or withdraw funds
              </span>
              <span className="flex items-center gap-1.5">
                <FlaskConical className="h-3.5 w-3.5 text-primary" /> Paper trading by default
              </span>
              <span className="flex items-center gap-1.5">
                <Hand className="h-3.5 w-3.5 text-primary" /> You stay in control
              </span>
            </div>

            {/* Authorizing state */}
            {authorizing && status.authorizationUrl && (
              <div
                className="space-y-2 rounded-md border border-[var(--glass-border)] bg-card/40 p-3"
                data-testid="hero-authorizing"
              >
                <p className="text-sm text-muted-foreground">
                  Open the onboarding URL in a desktop browser, sign in to Robinhood, and
                  authorize the agent. This page updates automatically once authorization
                  completes.
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    readOnly
                    value={status.authorizationUrl}
                    className="min-w-[200px] flex-1 text-base md:text-xs"
                    data-testid="input-onboarding-url"
                  />
                  <Button variant="outline" size="icon" onClick={copyUrl} data-testid="button-copy-url">
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() =>
                      window.open(status.authorizationUrl, "_blank", "noopener,noreferrer")
                    }
                    className="gap-2"
                    data-testid="button-open-onboarding"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Open
                  </Button>
                </div>
              </div>
            )}

            {/* Error state */}
            {errored && status.lastError && (
              <div
                className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
                data-testid="text-agent-error"
              >
                <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{status.lastError}</span>
              </div>
            )}
          </div>

          {/* Live demo preview */}
          <div className="relative">
            <div className="pointer-events-none absolute -inset-px rounded-2xl" aria-hidden="true" />
            <BexaiDashboard connected={false} activity={[]} demo />
            <p className="mt-2 text-center text-xs text-muted-foreground" data-testid="text-demo-caption">
              Live preview — a simulation of your agent in action
            </p>
          </div>
        </div>
      </section>

      {/* ============ HOW IT WORKS ============ */}
      <section id="how-it-works" className="space-y-6 scroll-mt-6">
        <div className="space-y-1 text-center">
          <h2 className="text-2xl font-semibold" data-testid="text-how-it-works-title">
            From zero to autonomous in three steps
          </h2>
          <p className="text-sm text-muted-foreground">
            No installs, no API keys — just authorize and go.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {HOW_IT_WORKS.map((step, i) => (
            <Card key={step.title} className="glass-panel" data-testid={`card-step-${i + 1}`}>
              <CardContent className="space-y-3 p-5">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10">
                    <step.icon className="h-5 w-5 text-primary" />
                  </span>
                  <span className="font-mono text-2xl font-semibold text-primary/40">
                    0{i + 1}
                  </span>
                </div>
                <h3 className="text-base font-semibold">{step.title}</h3>
                <p className="text-sm text-muted-foreground">{step.detail}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* ============ WATCH IT TRADE DEMO ============ */}
      <section className="space-y-6">
        <div className="space-y-1 text-center">
          <h2 className="text-2xl font-semibold" data-testid="text-demo-title">
            See a trade play out, start to finish
          </h2>
          <p className="text-sm text-muted-foreground">
            A scripted walkthrough of how the agent reasons, proposes, and executes — with you in the loop.
          </p>
        </div>
        <div className="mx-auto max-w-2xl">
          <LazyInView>
            <AgentTradeDemo />
          </LazyInView>
        </div>
      </section>

      {/* ============ CAPABILITIES ============ */}
      <section className="space-y-6">
        <div className="space-y-1 text-center">
          <h2 className="text-2xl font-semibold" data-testid="text-capabilities-title">
            Built to trade like a desk, not a dashboard
          </h2>
          <p className="text-sm text-muted-foreground">
            Real-time analysis, options pricing, and autonomous strategies — in one conversational agent.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {CAPABILITIES.map((cap, i) => (
            <Card key={cap.title} className="glass-panel" data-testid={`card-capability-${i + 1}`}>
              <CardContent className="flex items-start gap-4 p-5">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10">
                  <cap.icon className="h-5 w-5 text-primary" />
                </span>
                <div className="space-y-1">
                  <h3 className="text-base font-semibold">{cap.title}</h3>
                  <p className="text-sm text-muted-foreground">{cap.detail}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* ============ LIVE PORTFOLIO PREVIEW ============ */}
      <section className="space-y-6">
        <div className="space-y-1 text-center">
          <h2 className="text-2xl font-semibold" data-testid="text-preview-title">
            Your portfolio, watched in real time
          </h2>
          <p className="text-sm text-muted-foreground">
            A preview of the live cockpit you unlock the moment your agent connects.
          </p>
        </div>
        <div className="mx-auto max-w-2xl">
          <PortfolioView connected={false} />
        </div>
      </section>

      {/* ============ TRUST / SECURITY ============ */}
      <section className="space-y-6">
        <div className="space-y-1 text-center">
          <h2 className="text-2xl font-semibold" data-testid="text-trust-title">
            Secure by design
          </h2>
          <p className="text-sm text-muted-foreground">
            Your money, your broker, your rules — Fincai just adds the intelligence.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {TRUST_SIGNALS.map((t, i) => (
            <Card key={t.title} className="glass-panel" data-testid={`card-trust-${i + 1}`}>
              <CardContent className="space-y-3 p-5">
                <span className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10">
                  <t.icon className="h-5 w-5 text-primary" />
                </span>
                <h3 className="text-base font-semibold">{t.title}</h3>
                <p className="text-sm text-muted-foreground">{t.detail}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* ============ FINAL CTA ============ */}
      <section className="relative overflow-hidden rounded-2xl border border-[var(--glass-border)] glass-panel">
        <div
          className="pointer-events-none absolute inset-0 opacity-70"
          style={{
            background:
              "radial-gradient(50% 120% at 50% 0%, hsl(46 65% 52% / 0.14), transparent 70%)",
          }}
          aria-hidden="true"
        />
        <div className="relative flex flex-col items-center gap-4 p-8 text-center sm:p-12">
          <h2 className="font-display text-2xl font-semibold sm:text-3xl" data-testid="text-final-cta-title">
            Ready to put an AI agent to work?
          </h2>
          <p className="max-w-lg text-sm text-muted-foreground sm:text-base">
            Create your trading agent now. It's free to connect, and you stay in control of
            what it can do.
          </p>
          <Button
            size="lg"
            onClick={handlePrimaryCta}
            disabled={busy}
            className="btn-gold gap-2 text-base"
            data-testid="button-connect-agent-footer"
          >
            {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Link2 className="h-5 w-5" />}
            {ctaLabel}
          </Button>
        </div>
      </section>

      {/* ============ DISCLAIMER ============ */}
      <section
        className="rounded-2xl border border-[var(--glass-border)] glass-panel p-6"
        data-testid="section-agent-disclaimer"
      >
        <p className="text-xs leading-relaxed text-muted-foreground">
          Fincai is an independent product and is not affiliated with, endorsed
          by, or sponsored by Robinhood Markets, Inc. Fincai connects to
          Robinhood only through Robinhood's official Trading API using secure
          OAuth authorization, and never sees or stores your Robinhood password.
          Fincai is for informational purposes only and is not a registered
          investment adviser; it does not provide personalized financial advice.
          Trading involves risk, including the possible loss of principal.
          Manual trades require your confirmation; autonomous strategies default
          to paper (simulated) trading, with live trading as an explicit opt-in.
        </p>
      </section>
    </div>
  );
}
