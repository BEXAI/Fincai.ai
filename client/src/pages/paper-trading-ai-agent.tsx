import {
  FlaskConical,
  MessageSquare,
  SlidersHorizontal,
  PlayCircle,
  ShieldCheck,
  LineChart,
  ToggleRight,
  CheckCircle2,
} from "lucide-react";
import { SeoLandingPage } from "@/components/seo-landing-page";

const STEPS = [
  {
    icon: MessageSquare,
    title: "Pick or describe a strategy",
    detail:
      "Choose a curated strategy template or describe your own idea. No account and no credit card needed to start in paper mode.",
  },
  {
    icon: SlidersHorizontal,
    title: "Set your rules",
    detail:
      "Configure entry triggers, stop-loss, profit-target, trailing-stop, and time-stop rules — then let the autonomous engine watch live quotes.",
  },
  {
    icon: PlayCircle,
    title: "Run it on paper",
    detail:
      "Paper (simulated) trading is the default. The AI agent applies your rules to live market data without risking real capital.",
  },
  {
    icon: ToggleRight,
    title: "Go live only when ready",
    detail:
      "Live trading is an explicit per-strategy opt-in and requires a connected brokerage. It is long-only in the current version.",
  },
];

const CAPABILITIES = [
  {
    icon: FlaskConical,
    title: "Paper by default",
    detail:
      "Every autonomous strategy starts simulated. Test ideas with zero capital at risk before you ever go live.",
  },
  {
    icon: ShieldCheck,
    title: "You stay in control",
    detail:
      "Confirmation-first execution, position caps, and a market-hours guard. Anonymous users are paper-only.",
  },
  {
    icon: LineChart,
    title: "Live-data driven",
    detail:
      "The runner watches real quotes and applies your entry, stop, target, and trailing rules on a single non-overlapping interval.",
  },
];

const FAQS = [
  {
    q: "Is there a paper trading AI agent?",
    a: "Yes. Fincai's autonomous strategy runner is a paper trading AI agent by default — it applies your entry, stop-loss, profit-target, and trailing-stop rules to live market data with simulated fills, so you can test strategies with no capital at risk.",
  },
  {
    q: "Can I paper trade with AI for free?",
    a: "Yes. Paper (simulated) trading works in demo mode with no account and no credit card. Anonymous users are paper-only, and live trading is a separate explicit opt-in that requires a connected brokerage.",
  },
  {
    q: "How does the AI paper trading agent work?",
    a: "You pick a curated template or describe a strategy and set entry, stop-loss, profit-target, trailing-stop, and time-stop rules. A background engine watches live quotes and simulates the trades according to those rules.",
  },
  {
    q: "How do I switch from paper to live trading?",
    a: "Live trading is an explicit per-strategy opt-in that requires connecting a brokerage. It is long-only in the current version, with position caps and a market-hours guard. You confirm before going live.",
  },
  {
    q: "Is paper trading with Fincai financial advice?",
    a: "No. Fincai is for informational purposes only and is not a registered investment adviser. Simulated results are not indicative of future performance, and it does not provide personalized financial advice. Trading involves risk, including the possible loss of principal.",
  },
];

export default function PaperTradingAiAgent() {
  return (
    <SeoLandingPage
      seoPath="/paper-trading-ai-agent"
      badge="Paper trading, AI-driven"
      h1="Paper Trading AI Agent"
      subtitle="Fincai's autonomous strategy runner is a paper trading AI agent by default. Set entry, stop-loss, profit-target, and trailing-stop rules and let the AI apply them to live market data — with zero capital at risk. Go live only when you explicitly opt in."
      primaryCta={{ href: "/builder", label: "Build a paper strategy" }}
      secondaryCta={{ href: "/strategy-templates", label: "Browse templates" }}
      stepsTitle="How the paper trading AI agent works"
      steps={STEPS}
      capabilitiesTitle="Safe by design"
      capabilities={CAPABILITIES}
      faqs={FAQS}
      ctaTitle="Test your strategy on paper before risking a dollar"
      ctaText="Start in demo mode with no account — arm a strategy in paper mode and watch the AI run it on live data. Live trading is always an explicit opt-in."
      showRobinhoodDisclaimer
    />
  );
}
