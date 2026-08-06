import {
  Bot,
  Sigma,
  Layers,
  ShieldCheck,
  MessageSquare,
  CheckCircle2,
  FlaskConical,
  LineChart,
} from "lucide-react";
import { SeoLandingPage } from "@/components/seo-landing-page";
import {
  OPTIONS_ENGINE_PHRASE,
  OPTIONS_ENGINE_SPEC_SHORT,
} from "@shared/engine-spec";

const STEPS = [
  {
    icon: MessageSquare,
    title: "Ask about an options strategy",
    detail:
      "Describe what you want in plain English — a covered call on a ticker, an iron condor, or a defined-risk spread — and the AI assistant reads live market data to analyze it.",
  },
  {
    icon: Sigma,
    title: "Review Greeks and payoff",
    detail:
      `The assistant surfaces delta, gamma, theta, and vega alongside break-evens and a payoff view from Fincai's ${OPTIONS_ENGINE_PHRASE}.`,
  },
  {
    icon: LineChart,
    title: "Weigh the trade-offs",
    detail:
      "Multi-agent technical, sentiment, and fundamental analysis plus a bull/bear debate frame the setup — informational only, never personalized advice.",
  },
  {
    icon: CheckCircle2,
    title: "Confirm before anything runs",
    detail:
      "If you connect a brokerage, manual equity trades execute only on your explicit confirmation. Autonomous strategies default to paper (simulated) trading.",
  },
];

const CAPABILITIES = [
  {
    icon: Sigma,
    title: "Full Greeks & pricing",
    detail: OPTIONS_ENGINE_SPEC_SHORT,
  },
  {
    icon: Layers,
    title: "Strategy analysis",
    detail:
      "Payoff, break-evens, and defined-risk metrics for spreads, condors, covered calls, and more — visualized in the P&L simulator.",
  },
  {
    icon: FlaskConical,
    title: "Paper by default",
    detail:
      "Test options ideas with simulated trades before risking real capital. Anonymous users are paper-only.",
  },
];

const FAQS = [
  {
    q: "Is there an AI options trading assistant?",
    a: `Yes. Fincai is an AI options trading assistant that analyzes options in real time — computing Greeks, break-evens, and payoff scenarios from a ${OPTIONS_ENGINE_PHRASE} — and can place manual equity trades through a connected brokerage on your explicit confirmation.`,
  },
  {
    q: "Can AI analyze options strategies for me?",
    a: "Yes. Describe a strategy in plain English and Fincai's AI reads live market data to surface delta, gamma, theta, and vega, break-evens, and a payoff view. The analysis is informational only and is not personalized financial advice.",
  },
  {
    q: "Does the assistant compute options Greeks?",
    a: "Yes. Fincai's pricing engine computes a full set of Greeks (delta, gamma, theta, vega, rho) using Generalized Black-Scholes and Bjerksund-Stensland for American options, plus an implied-volatility solver and volatility surface.",
  },
  {
    q: "Can I paper trade options with the AI?",
    a: "Yes. Paper (simulated) trading is the default, so you can test options ideas without risking real capital. Anonymous users are paper-only; live trading through a connected brokerage is an explicit opt-in.",
  },
  {
    q: "Does Fincai give options trading advice?",
    a: "No. Fincai is for informational purposes only and is not a registered investment adviser. It does not provide personalized financial or investment advice. Trading options involves risk, including the possible loss of principal.",
  },
];

export default function AiOptionsTradingAssistant() {
  return (
    <SeoLandingPage
      seoPath="/ai-options-trading-assistant"
      badge="AI for options traders"
      h1="AI Options Trading Assistant"
      subtitle={`Fincai is an AI options trading assistant that analyzes strategies in real time — Greeks, break-evens, and payoff scenarios from a ${OPTIONS_ENGINE_PHRASE}. Ask in plain English, review the numbers, and stay in control. Paper trading by default.`}
      primaryCta={{ href: "/chat", label: "Analyze an options strategy" }}
      secondaryCta={{ href: "/pnl-simulator", label: "Open the P&L simulator" }}
      stepsTitle="How the AI options assistant works"
      steps={STEPS}
      capabilitiesTitle="Built for options analysis"
      capabilities={CAPABILITIES}
      faqs={FAQS}
      ctaTitle="Put an AI to work on your options strategies"
      ctaText="Start in demo mode with no account — analyze options, view Greeks, and simulate payoffs. You confirm your manual trades."
      showRobinhoodDisclaimer
    />
  );
}
