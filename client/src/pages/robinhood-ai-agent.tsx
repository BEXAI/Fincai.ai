import { Link } from "wouter";
import { Seo } from "@/components/seo";
import {
  TRADEMARK_ROBINHOOD,
  NOT_ADVICE,
  RISK_GENERAL,
  USER_RESPONSIBILITY,
} from "@shared/disclosures";
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
import {
  ArrowRight,
  Bot,
  Lock,
  ShieldCheck,
  Info,
  AlertTriangle,
  MessageSquare,
  TrendingUp,
  CheckCircle2,
  FlaskConical,
} from "lucide-react";

const STEPS = [
  {
    icon: Bot,
    title: "Open the Fincai trading agent",
    detail:
      "Open the trading agent and choose to connect your brokerage. No credit card, and a free demo works with no account.",
  },
  {
    icon: Lock,
    title: "Authorize with Robinhood",
    detail:
      "Sign in on Robinhood's own OAuth page and approve access. Fincai uses PKCE and never sees or stores your Robinhood password.",
  },
  {
    icon: MessageSquare,
    title: "Review the agent's plan",
    detail:
      "The AI agent analyzes live market data across stocks and options and proposes trades. You review and confirm each manual trade before it runs.",
  },
  {
    icon: CheckCircle2,
    title: "Confirm trades",
    detail:
      "Manual trades execute only on your explicit confirmation. Autonomous strategies default to paper (simulated) trading, with live as an opt-in.",
  },
];

const CAPABILITIES = [
  {
    icon: TrendingUp,
    title: "Real-time analysis",
    detail:
      "Multi-agent technical, sentiment, and fundamental analysis with a bull/bear debate on live market data.",
  },
  {
    icon: ShieldCheck,
    title: "You stay in control",
    detail:
      "Confirmation-first execution. Live autonomous trading is an explicit per-strategy opt-in and is long-only in the current version.",
  },
  {
    icon: FlaskConical,
    title: "Paper by default",
    detail:
      "Test strategies with simulated trades before risking real capital. Anonymous users are paper-only.",
  },
];

const FAQS = [
  {
    q: "Is there an AI bot for Robinhood?",
    a: "Yes. Fincai is an agentic AI trading assistant that connects to your Robinhood account through Robinhood's official Trading API using secure OAuth. It analyzes stocks and options in real time and can place equity trades — manual trades on your confirmation, with autonomous strategies in paper by default.",
  },
  {
    q: "Can I use AI to trade stocks on Robinhood?",
    a: "Yes. Once you authorize Fincai with Robinhood, its AI agent can place and manage real equity trades. Manual trades require your explicit confirmation, and autonomous strategies run in paper (simulated) mode until you opt a strategy into live trading — after which the strategy places trades on its own within the limits you set.",
  },
  {
    q: "Does Fincai need my Robinhood password?",
    a: "No. You sign in on Robinhood's own OAuth page, not inside Fincai. Fincai uses OAuth 2.1 with PKCE and never sees or stores your Robinhood username or password. You can disconnect at any time.",
  },
  {
    q: "Is it safe to connect an AI agent to Robinhood?",
    a: "Fincai connects only through Robinhood's official Trading API with permissions you approve, stores tokens encrypted, and executes manual trades only after you confirm; autonomous strategies run in paper until you opt them into live trading. As with any trading, market risk remains — trading stocks and options can lose money.",
  },
  {
    q: "How much does Fincai cost?",
    a: "Fincai offers a free demo mode that works without an account, including live market data and AI analysis. Connecting Robinhood for live trading requires signing in.",
  },
  {
    q: "What is the best AI trading agent?",
    a: "The best AI trading agent for most retail traders is one that is transparent, confirmation-first, and connects to your real brokerage safely. Fincai is an agentic AI assistant built around those principles: real-time multi-agent analysis, paper-by-default automation, and secure OAuth brokerage connection.",
  },
];

export default function RobinhoodAiAgent() {
  return (
    <div className="mx-auto max-w-5xl space-y-10 px-4 py-8">
      <Seo path="/robinhood-ai-agent" />

      {/* Hero */}
      <section className="space-y-4">
        <Badge variant="secondary" data-testid="badge-hero">
          Agentic AI trading agent
        </Badge>
        <h1
          className="text-3xl font-semibold tracking-tight sm:text-4xl"
          data-testid="text-page-title"
        >
          Connect an AI Trading Agent to Your Brokerage
        </h1>
        <p className="max-w-3xl text-lg text-muted-foreground" data-testid="text-hero-subtitle">
          Fincai connects a live, reasoning AI trading agent to your Robinhood
          account through Robinhood's official Trading API. It analyzes stocks
          and options in real time and places trades — but only when you
          confirm. No password sharing, paper trading by default.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button asChild size="lg">
            <Link href="/agent" data-testid="link-open-agent">
              Open the AI trading agent
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/chat" data-testid="link-try-chat">
              Try the AI chat
            </Link>
          </Button>
        </div>
      </section>

      {/* Non-affiliation disclaimer */}
      <Alert data-testid="alert-non-affiliation">
        <Info className="h-4 w-4" />
        <AlertTitle>Independent product — not affiliated with Robinhood</AlertTitle>
        <AlertDescription data-testid="text-trademark-disclaimer">
          {TRADEMARK_ROBINHOOD}
        </AlertDescription>
      </Alert>

      {/* How it works */}
      <section className="space-y-4">
        <h2 className="text-2xl font-semibold" data-testid="text-how-title">
          How to connect an AI agent to Robinhood
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {STEPS.map((step, i) => (
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

      {/* Safety highlight */}
      <section className="space-y-4">
        <h2 className="text-2xl font-semibold" data-testid="text-safety-title">
          Secure by design
        </h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {CAPABILITIES.map((cap, i) => (
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
          {FAQS.map((faq, i) => (
            <AccordionItem key={faq.q} value={`faq-${i}`} data-testid={`faq-item-${i}`}>
              <AccordionTrigger className="text-left" data-testid={`faq-trigger-${i}`}>
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
          Put an AI trading agent to work on your brokerage account
        </h2>
        <p className="mx-auto max-w-2xl text-muted-foreground">
          Start in demo mode with no account, or connect Robinhood securely when
          you're ready. You stay in control.
        </p>
        <div className="flex justify-center">
          <Button asChild size="lg">
            <Link href="/agent" data-testid="link-cta-agent">
              Open the AI trading agent
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </section>

      {/* Compliance disclaimer */}
      <Alert data-testid="alert-compliance">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Important disclosure</AlertTitle>
        <AlertDescription data-testid="text-compliance-disclaimer">
          {NOT_ADVICE} {RISK_GENERAL} {USER_RESPONSIBILITY}
        </AlertDescription>
      </Alert>
    </div>
  );
}
