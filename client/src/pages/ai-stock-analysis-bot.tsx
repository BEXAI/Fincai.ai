import {
  MessageSquare,
  BarChart3,
  Users,
  Scale,
  Gauge,
  CheckCircle2,
  FlaskConical,
  Activity,
} from "lucide-react";
import { SeoLandingPage } from "@/components/seo-landing-page";

const STEPS = [
  {
    icon: MessageSquare,
    title: "Ask about any stock",
    detail:
      "Type a ticker or a question in plain English. The AI reads live quotes and historical bars — no manual data entry.",
  },
  {
    icon: BarChart3,
    title: "Get technical signals",
    detail:
      "Pivot points, Fibonacci levels, ATR, and Bollinger Bands are computed automatically on real-time market data.",
  },
  {
    icon: Users,
    title: "See the multi-agent view",
    detail:
      "Specialized technical, sentiment, and fundamental agents weigh in, then a bull/bear debate frames both sides of the trade.",
  },
  {
    icon: CheckCircle2,
    title: "Decide with full control",
    detail:
      "Everything is informational. If you connect a brokerage, manual equity trades execute only on your explicit confirmation; autonomous strategies default to paper (simulated) trading.",
  },
];

const CAPABILITIES = [
  {
    icon: Activity,
    title: "Real-time analysis",
    detail:
      "Live quotes and historical bars power technical calculators and multi-agent analysis — no stale or fabricated data.",
  },
  {
    icon: Scale,
    title: "Bull vs. bear debate",
    detail:
      "The bot argues both sides so you see the risks, not just the upside. Analysis is informational, never personalized advice.",
  },
  {
    icon: Gauge,
    title: "Market regime detection",
    detail:
      "The system flags trending vs. range-bound conditions to put each signal in context.",
  },
];

const FAQS = [
  {
    q: "Is there an AI stock analysis bot?",
    a: "Yes. Fincai is an AI stock analysis bot that reads live market data and runs multi-agent technical, sentiment, and fundamental analysis, plus a bull/bear debate. It presents findings for you to review — it does not give personalized financial advice.",
  },
  {
    q: "Can AI analyze stocks in real time?",
    a: "Yes. Fincai pulls live quotes and historical bars and automatically computes technical signals — pivot points, Fibonacci levels, ATR, and Bollinger Bands — then layers on multi-agent analysis and a bull/bear debate.",
  },
  {
    q: "What does the AI stock bot analyze?",
    a: "It combines technical indicators, sentiment, and fundamentals across specialized AI agents, adds a bull/bear debate and market-regime detection, and can analyze both stocks and options.",
  },
  {
    q: "Can the bot trade stocks for me?",
    a: "If you connect a brokerage, Fincai's agent can place equity trades — manual trades only on your explicit confirmation. Autonomous strategies default to paper (simulated) trading; anonymous users are paper-only.",
  },
  {
    q: "Does Fincai give stock recommendations?",
    a: "No. Fincai is for informational purposes only and is not a registered investment adviser. It does not provide personalized financial or investment advice, and it never shows fabricated ratings. Trading stocks involves risk, including the possible loss of principal.",
  },
];

export default function AiStockAnalysisBot() {
  return (
    <SeoLandingPage
      seoPath="/ai-stock-analysis-bot"
      badge="AI stock analysis"
      h1="AI Stock Analysis Bot"
      subtitle="Fincai is an AI stock analysis bot that reads live market data and runs multi-agent technical, sentiment, and fundamental analysis — with a bull/bear debate on both sides of every trade. Ask about any ticker in plain English. Informational only, you stay in control."
      primaryCta={{ href: "/chat", label: "Analyze a stock" }}
      secondaryCta={{ href: "/market-analysis", label: "Open market analysis" }}
      stepsTitle="How the AI stock analysis bot works"
      steps={STEPS}
      capabilitiesTitle="What the bot brings to the table"
      capabilities={CAPABILITIES}
      faqs={FAQS}
      ctaTitle="Let an AI break down any stock for you"
      ctaText="Start in demo mode with no account — analyze tickers with live data and a multi-agent bull/bear debate. You confirm your manual trades."
      showRobinhoodDisclaimer
    />
  );
}
