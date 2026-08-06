/**
 * Single source of truth for per-route SEO / GEO metadata.
 *
 * Consumed by BOTH:
 *  - the client `useSeo`/`Seo` component (client/src/components/seo.tsx), which
 *    upserts title/meta/canonical/OG/Twitter + route JSON-LD on mount, and
 *  - the server crawler injector (server/index.ts), which rewrites the served
 *    HTML for search + AI answer-engine bots that don't run JavaScript.
 *
 * Keeping both readers on this one map is what prevents canonical/metadata
 * drift between what a real browser renders and what a crawler is served.
 *
 * This module is intentionally dependency-free (pure string/data helpers, no
 * fs/path/process) so it is safe to import into the client bundle.
 */

import { TRADEMARK_ROBINHOOD_SHORT } from "./disclosures";

export const SITE_URL = "https://fincai.ai";

export const SEO_COMPLIANCE_LINE =
  "Fincai is for informational purposes only and is not a registered investment adviser. It does not provide personalized financial advice. Trading stocks and options involves risk, including the possible loss of principal.";

export const ROBINHOOD_DISCLAIMER =
  "Fincai is an independent product and is not affiliated with, endorsed by, or sponsored by Robinhood Markets, Inc. Fincai connects to Robinhood only through Robinhood's official Trading API using secure OAuth authorization, and never sees or stores your Robinhood password. Robinhood is a trademark of its respective owner.";

export interface RouteNoscript {
  h1: string;
  paragraphs: string[];
  bullets?: string[];
}

export type JsonLdObject = Record<string, unknown>;

export interface RouteSeo {
  /** Canonical path beginning with "/". */
  path: string;
  title: string;
  description: string;
  ogType?: string;
  /** Short breadcrumb label for this page (defaults to the title). */
  crumb?: string;
  /** Optional richer no-JS fallback; otherwise derived from title + description. */
  noscript?: RouteNoscript;
  /** Extra JSON-LD beyond the automatic WebPage + BreadcrumbList. */
  extraJsonLd?: (url: string) => JsonLdObject[];
}

/**
 * Routes with dedicated, keyword-optimized metadata. These mirror the public
 * pages that mount `useSeo` and the URLs in sitemap.xml. Unmapped routes fall
 * back to the base index.html shell (homepage metadata), matching prior behavior.
 */
const ROUTES: RouteSeo[] = [
  {
    path: "/",
    title: "Fincai — Agentic AI Trading Assistant for Stocks & Options",
    description:
      "Deploy an agentic AI trading agent that analyzes stocks and options in real time, runs autonomous strategies, and executes manual trades on your confirmation.",
    crumb: "Home",
    noscript: {
      h1: "Fincai — Agentic AI Trading Assistant for Stocks & Options",
      paragraphs: [
        "Fincai is an agentic AI trading assistant. It analyzes stocks and options in real time with a multi-agent AI system, runs autonomous trading strategies with built-in risk controls, and executes manual equity trades through a connected brokerage — Robinhood, via its official Trading API — on your confirmation.",
        ROBINHOOD_DISCLAIMER,
      ],
      bullets: [
        "Agentic AI trading agent for stocks and options",
        "Connects to Robinhood through its official Trading API and secure OAuth (no password stored)",
        "Autonomous strategy runner (paper by default, live opt-in, long-only in V1)",
        "Multi-agent market analysis with bull/bear debate",
        "Conversational AI chat for analysis and trade execution",
      ],
    },
  },
  {
    path: "/robinhood-ai-agent",
    title: "Agentic AI Trading Agent for Your Brokerage | Fincai",
    description:
      "Fincai connects an agentic AI trading agent to your Robinhood account through its official Trading API and secure OAuth (no password stored). It analyzes markets and places manual equity trades on your confirmation.",
    crumb: "AI Trading Agent",
    noscript: {
      h1: "Connect an Agentic AI Trading Agent to Your Brokerage — Fincai",
      paragraphs: [
        "Fincai connects a live, reasoning AI trading agent to your Robinhood account through Robinhood's official Trading API using secure OAuth (with PKCE). It analyzes stocks and options in real time and places equity trades — manual trades only on your explicit confirmation.",
        "You never share your Robinhood password with Fincai. Autonomous strategies default to paper (simulated) trading; live trading is an explicit per-strategy opt-in and is long-only in the current version.",
        ROBINHOOD_DISCLAIMER,
      ],
      bullets: [
        "Connects via Robinhood's official Trading API and OAuth — no password stored",
        "Confirmation-first: trades execute only when you approve them",
        "Paper trading by default; live trading is an explicit opt-in",
        "Real-time multi-agent analysis of stocks and options",
      ],
    },
    extraJsonLd: (url) => [
      {
        "@context": "https://schema.org",
        "@type": "HowTo",
        name: "How to connect an AI trading agent to Robinhood with Fincai",
        description:
          "Connect Fincai's agentic AI trading agent to your Robinhood account securely through Robinhood's official Trading API and OAuth, then let it analyze markets and place manual trades on your confirmation.",
        totalTime: "PT3M",
        step: [
          {
            "@type": "HowToStep",
            position: 1,
            name: "Open the Fincai trading agent",
            text: "Open the Fincai trading agent and choose to connect your brokerage.",
            url: `${SITE_URL}/agent`,
          },
          {
            "@type": "HowToStep",
            position: 2,
            name: "Authorize with Robinhood",
            text: "Sign in on Robinhood's official OAuth page and approve access. Fincai uses PKCE and never sees or stores your Robinhood password.",
          },
          {
            "@type": "HowToStep",
            position: 3,
            name: "Review the AI agent's plan",
            text: "The AI agent analyzes live market data and proposes trades. You review and confirm each manual trade before it runs.",
          },
          {
            "@type": "HowToStep",
            position: 4,
            name: "Confirm trades",
            text: "Manual trades execute only on your explicit confirmation. Autonomous strategies default to paper (simulated) trading, with live trading as an explicit opt-in.",
          },
        ],
      },
    ],
  },
  {
    path: "/ai-options-trading-assistant",
    title: "AI Options Trading Assistant — Greeks & Payoffs | Fincai",
    description:
      "Fincai is an AI options trading assistant: analyze options strategies in real time with a full Greeks calculator, break-evens, and payoff scenarios from a Black-Scholes and Bjerksund-Stensland options pricing engine. Paper trading by default; manual live trades require your confirmation.",
    crumb: "AI Options Assistant",
    noscript: {
      h1: "AI Options Trading Assistant — Fincai",
      paragraphs: [
        "Yes — there is an AI options trading assistant. Fincai analyzes options strategies in real time, computing a full set of Greeks (delta, gamma, theta, vega, rho), break-evens, and payoff scenarios from an options pricing engine (Generalized Black-Scholes, the Bjerksund-Stensland (2002) approximation for American-style contracts, a Newton-Raphson/Brent implied-volatility solver, and an SVI-smoothed volatility surface).",
        "Describe a strategy in plain English and Fincai reads live market data to analyze it. Paper (simulated) trading is the default; manual live equity trades execute only on your explicit confirmation, while autonomous strategies you opt into live trading run within the limits you set.",
      ],
      bullets: [
        "Full Greeks and payoff analysis for spreads, condors, covered calls, and more",
        "Black-Scholes and Bjerksund-Stensland options pricing engine with an implied-volatility solver",
        "Paper trading by default; live trading is an explicit opt-in",
        "Informational only — not personalized financial advice",
      ],
    },
    extraJsonLd: (url) => [
      {
        "@context": "https://schema.org",
        "@type": "HowTo",
        name: "How to analyze an options strategy with Fincai's AI assistant",
        description:
          "Use Fincai's AI options trading assistant to analyze a strategy in real time — Greeks, break-evens, and payoff scenarios — then decide with full control.",
        totalTime: "PT2M",
        step: [
          {
            "@type": "HowToStep",
            position: 1,
            name: "Ask about an options strategy",
            text: "Describe the options strategy you want to analyze in plain English.",
            url: `${SITE_URL}/chat`,
          },
          {
            "@type": "HowToStep",
            position: 2,
            name: "Review Greeks and payoff",
            text: "Fincai surfaces delta, gamma, theta, and vega with break-evens and a payoff view from its pricing engine.",
          },
          {
            "@type": "HowToStep",
            position: 3,
            name: "Weigh the trade-offs",
            text: "Multi-agent analysis and a bull/bear debate frame the setup — informational only, never personalized advice.",
          },
          {
            "@type": "HowToStep",
            position: 4,
            name: "Confirm before anything runs",
            text: "Manual live equity trades execute only on your explicit confirmation; autonomous strategies default to paper trading and go live only when you opt in.",
          },
        ],
      },
      buildFaqJsonLd([
        {
          q: "Is there an AI options trading assistant?",
          a: "Yes. Fincai is an AI options trading assistant that analyzes options in real time — computing Greeks, break-evens, and payoff scenarios from a Black-Scholes and Bjerksund-Stensland options pricing engine — and can place manual equity trades through a connected brokerage on your explicit confirmation.",
        },
        {
          q: "Can AI analyze options strategies for me?",
          a: "Yes. Describe a strategy in plain English and Fincai's AI reads live market data to surface delta, gamma, theta, and vega, break-evens, and a payoff view. The analysis is informational only and is not personalized financial advice.",
        },
        {
          q: "Can I paper trade options with the AI?",
          a: "Yes. Paper (simulated) trading is the default, so you can test options ideas without risking real capital. Anonymous users are paper-only; live trading through a connected brokerage is an explicit opt-in.",
        },
        {
          q: "Does Fincai give options trading advice?",
          a: "No. Fincai is for informational purposes only and is not a registered investment adviser. It does not provide personalized financial or investment advice. Trading options involves risk, including the possible loss of principal.",
        },
      ]),
    ],
  },
  {
    path: "/ai-stock-analysis-bot",
    title: "AI Stock Analysis Bot — Real-Time Signals | Fincai",
    description:
      "Fincai is an AI stock analysis bot that reads live market data and runs multi-agent technical, sentiment, and fundamental analysis with a bull/bear debate. Ask about any ticker in plain English. Informational only; you stay in control.",
    crumb: "AI Stock Analysis Bot",
    noscript: {
      h1: "AI Stock Analysis Bot — Fincai",
      paragraphs: [
        "Yes — there is an AI stock analysis bot. Fincai reads live quotes and historical bars and automatically computes technical signals (pivot points, Fibonacci levels, ATR, and Bollinger Bands), then layers on multi-agent technical, sentiment, and fundamental analysis plus a bull/bear debate and market-regime detection.",
        "Ask about any ticker in plain English. Fincai presents its findings for you to review — it does not give personalized financial advice or fabricated ratings. Manual live equity trades through a connected brokerage execute only on your explicit confirmation; autonomous strategies default to paper trading.",
      ],
      bullets: [
        "Real-time technical signals on live market data",
        "Multi-agent technical, sentiment, and fundamental analysis",
        "Bull/bear debate and market-regime detection",
        "Informational only — no fabricated ratings, no personalized advice",
      ],
    },
    extraJsonLd: (url) => [
      {
        "@context": "https://schema.org",
        "@type": "HowTo",
        name: "How to analyze a stock with Fincai's AI stock analysis bot",
        description:
          "Use Fincai's AI stock analysis bot to analyze any ticker with live data, technical signals, and a multi-agent bull/bear debate.",
        totalTime: "PT2M",
        step: [
          {
            "@type": "HowToStep",
            position: 1,
            name: "Ask about any stock",
            text: "Type a ticker or a question in plain English; Fincai reads live quotes and historical bars.",
            url: `${SITE_URL}/chat`,
          },
          {
            "@type": "HowToStep",
            position: 2,
            name: "Get technical signals",
            text: "Pivot points, Fibonacci levels, ATR, and Bollinger Bands are computed automatically on real-time data.",
          },
          {
            "@type": "HowToStep",
            position: 3,
            name: "See the multi-agent view",
            text: "Technical, sentiment, and fundamental agents weigh in, then a bull/bear debate frames both sides.",
          },
          {
            "@type": "HowToStep",
            position: 4,
            name: "Decide with full control",
            text: "Everything is informational; manual live equity trades execute only on your explicit confirmation, and autonomous strategies default to paper trading.",
          },
        ],
      },
      buildFaqJsonLd([
        {
          q: "Is there an AI stock analysis bot?",
          a: "Yes. Fincai is an AI stock analysis bot that reads live market data and runs multi-agent technical, sentiment, and fundamental analysis, plus a bull/bear debate. It presents findings for you to review — it does not give personalized financial advice.",
        },
        {
          q: "Can AI analyze stocks in real time?",
          a: "Yes. Fincai pulls live quotes and historical bars and automatically computes technical signals — pivot points, Fibonacci levels, ATR, and Bollinger Bands — then layers on multi-agent analysis and a bull/bear debate.",
        },
        {
          q: "Can the bot trade stocks for me?",
          a: "If you connect a brokerage, Fincai's agent can place equity trades — manual trades only on your explicit confirmation. Autonomous strategies default to paper (simulated) trading; anonymous users are paper-only.",
        },
        {
          q: "Does Fincai give stock recommendations?",
          a: "No. Fincai is for informational purposes only and is not a registered investment adviser. It does not provide personalized financial or investment advice, and it never shows fabricated ratings. Trading stocks involves risk, including the possible loss of principal.",
        },
      ]),
    ],
  },
  {
    path: "/paper-trading-ai-agent",
    title: "Paper Trading AI Agent — Simulate Strategies | Fincai",
    description:
      "Fincai's autonomous strategy runner is a paper trading AI agent by default. Set entry, stop-loss, profit-target, and trailing-stop rules and let the AI run them on live market data with zero capital at risk. Go live only when you opt in.",
    crumb: "Paper Trading AI Agent",
    noscript: {
      h1: "Paper Trading AI Agent — Fincai",
      paragraphs: [
        "Yes — there is a paper trading AI agent. Fincai's autonomous strategy runner applies your entry, stop-loss, profit-target, trailing-stop, and time-stop rules to live market data with simulated fills, so you can test strategies with zero capital at risk.",
        "Paper (simulated) trading is the default and works in demo mode with no account. Live trading is an explicit per-strategy opt-in that requires a connected brokerage and is long-only in the current version, with position caps and a market-hours guard.",
      ],
      bullets: [
        "Paper (simulated) trading by default — no capital at risk",
        "Autonomous engine applies entry, stop, target, and trailing rules on live data",
        "Free demo mode with no account; anonymous users are paper-only",
        "Live trading is an explicit opt-in — simulated results are not indicative of future performance",
      ],
    },
    extraJsonLd: (url) => [
      {
        "@context": "https://schema.org",
        "@type": "HowTo",
        name: "How to paper trade a strategy with Fincai's AI agent",
        description:
          "Use Fincai's paper trading AI agent to simulate a strategy on live market data before risking any capital.",
        totalTime: "PT3M",
        step: [
          {
            "@type": "HowToStep",
            position: 1,
            name: "Pick or describe a strategy",
            text: "Choose a curated template or describe your own idea — no account needed to start in paper mode.",
            url: `${SITE_URL}/builder`,
          },
          {
            "@type": "HowToStep",
            position: 2,
            name: "Set your rules",
            text: "Configure entry triggers, stop-loss, profit-target, trailing-stop, and time-stop rules.",
          },
          {
            "@type": "HowToStep",
            position: 3,
            name: "Run it on paper",
            text: "Paper (simulated) trading is the default; the AI applies your rules to live data without risking capital.",
          },
          {
            "@type": "HowToStep",
            position: 4,
            name: "Go live only when ready",
            text: "Live trading is an explicit per-strategy opt-in requiring a connected brokerage; it is long-only in the current version.",
          },
        ],
      },
      buildFaqJsonLd([
        {
          q: "Is there a paper trading AI agent?",
          a: "Yes. Fincai's autonomous strategy runner is a paper trading AI agent by default — it applies your entry, stop-loss, profit-target, and trailing-stop rules to live market data with simulated fills, so you can test strategies with no capital at risk.",
        },
        {
          q: "Can I paper trade with AI for free?",
          a: "Yes. Paper (simulated) trading works in demo mode with no account and no credit card. Anonymous users are paper-only, and live trading is a separate explicit opt-in that requires a connected brokerage.",
        },
        {
          q: "How do I switch from paper to live trading?",
          a: "Live trading is an explicit per-strategy opt-in that requires connecting a brokerage. It is long-only in the current version, with position caps and a market-hours guard. You confirm before going live.",
        },
        {
          q: "Is paper trading with Fincai financial advice?",
          a: "No. Fincai is for informational purposes only and is not a registered investment adviser. Simulated results are not indicative of future performance, and it does not provide personalized financial advice. Trading involves risk, including the possible loss of principal.",
        },
      ]),
    ],
  },
  {
    path: "/promo",
    title: "Watch Fincai in Action — AI Trading Demo Tour | Fincai",
    description:
      "A slide-by-slide tour of Fincai: agentic AI analysis, autonomous strategies, a Black-Scholes and Bjerksund-Stensland options pricing engine, and a live trading agent that connects to Robinhood — with you in control.",
    crumb: "Watch Demo",
    noscript: {
      h1: "Watch Fincai in Action — a tour of the AI trading assistant",
      paragraphs: [
        "This is a slide-by-slide promotional tour of Fincai, the agentic AI trading assistant for stocks and options. It walks through the conversational AI assistant, multi-agent market analysis with a bull/bear debate, the autonomous strategy runner, the live trading agent that connects to Robinhood, the options pricing engine, real-time market data and technical signals, and the trading psychology tracker.",
        ROBINHOOD_DISCLAIMER,
      ],
      bullets: [
        "Conversational AI assistant for real-time stock and options analysis",
        "Multi-agent analysis with technical, sentiment, and fundamental agents",
        "Autonomous strategy runner (paper by default, live opt-in)",
        "Live trading agent that connects to Robinhood via official OAuth (no password stored)",
        "Options pricing engine with full Greeks and implied volatility",
      ],
    },
  },
  {
    path: "/chat",
    title: "AI Trading Chat — Analyze Stocks & Options | Fincai",
    description:
      "Chat with Fincai's agentic AI to analyze stocks and options in real time, get market analysis, and execute trades using natural language.",
    crumb: "AI Chat",
  },
  {
    path: "/market-analysis",
    title: "AI Market Analysis for Stocks & Options | Fincai",
    description:
      "Live market overview and AI-powered technical analysis — pivot points, Fibonacci, ATR and Bollinger Bands on real-time market data.",
    crumb: "Market Analysis",
  },
  {
    path: "/dashboard",
    title: "Trading Dashboard — Portfolio & AI Insights | Fincai",
    description:
      "Your Fincai trading dashboard: live portfolio overview, market snapshot, and agentic AI insights for stocks and options in one place.",
    crumb: "Dashboard",
  },
  {
    path: "/strategies",
    title: "My Trading Strategies — Manage & Track | Fincai",
    description:
      "Create, manage, and track your stock and options trading strategies with Fincai's agentic AI assistant and autonomous strategy runner.",
    crumb: "My Strategies",
  },
  {
    path: "/builder",
    title: "AI Strategy Builder — Automate Stock & Options Trades | Fincai",
    description:
      "Build and arm automated trading strategies with custom entry, stop-loss, profit-target and trailing-stop rules, run by Fincai's autonomous AI strategy engine.",
    crumb: "Strategy Builder",
  },
  {
    path: "/strategy-templates",
    title: "AI Trading Strategy Templates — Stocks & Options | Fincai",
    description:
      "Curated, runnable trading strategies with built-in stop-loss, profit-target and trailing-stop rules — armed by Fincai's autonomous AI strategy runner.",
    crumb: "Strategy Templates",
  },
  {
    path: "/ai-providers",
    title: "AI Providers — Power Trading Analysis with Your Own Model | Fincai",
    description:
      "Choose the AI model behind Fincai's multi-agent stock and options analysis. Use the built-in model or connect your own OpenAI or Google Gemini key.",
    crumb: "AI Providers",
  },
  {
    path: "/education",
    title: "Trading Education — Stocks, Options & AI Trading | Fincai",
    description:
      "Learn trading mechanics, strategies, and best practices for stocks and options, curated for use with Fincai's agentic AI trading assistant.",
    crumb: "Education",
  },
  {
    path: "/psychology",
    title: "Trading Psychology Tracker — Emotions & Mistakes | Fincai",
    description:
      "Log your emotions and trading mistakes to build discipline. Fincai's trading psychology tracker helps you trade more consistently.",
    crumb: "Psychology Tracker",
  },
  {
    path: "/watchlist",
    title: "Stock Watchlist — Track Tickers in Real Time | Fincai",
    description:
      "Build a real-time watchlist of stocks and options and let Fincai's agentic AI monitor prices and surface trading opportunities.",
    crumb: "Watchlist",
  },
  {
    path: "/pnl-simulator",
    title: "Options P&L Simulator — Visualize Payoffs | Fincai",
    description:
      "Simulate profit and loss across price scenarios for stock and options strategies with Fincai's interactive P&L simulator.",
    crumb: "P&L Simulator",
  },
  {
    path: "/var-calculator",
    title: "Value at Risk (VaR) Calculator — Portfolio Risk | Fincai",
    description:
      "Estimate portfolio downside with Fincai's Value at Risk (VaR) calculator for stocks and options positions.",
    crumb: "VaR Calculator",
  },
  {
    path: "/greeks-visualizer",
    title: "Options Greeks Visualizer — Delta, Gamma, Theta, Vega | Fincai",
    description:
      "Visualize options Greeks — delta, gamma, theta, and vega — across price and time with Fincai's interactive Greeks visualizer.",
    crumb: "Greeks Visualizer",
  },
  {
    path: "/position-sizing",
    title: "Position Sizing Calculator — Risk Management | Fincai",
    description:
      "Calculate optimal trade size with Fincai's position sizing calculator to manage risk on every stock and options trade.",
    crumb: "Position Sizing",
  },
  {
    path: "/walmart",
    title: "Walmart Nasdaq-100 Options Case Study | Fincai",
    description:
      "A case study of options strategies around Walmart's Nasdaq listing and expected Nasdaq-100 inclusion — conservative, moderate, and aggressive QQQ approaches with defined risk.",
    crumb: "Walmart Case Study",
    extraJsonLd: (url) => [
      {
        "@context": "https://schema.org",
        "@type": "Article",
        headline: "Walmart Nasdaq-100 Inclusion: Options Strategy Case Study",
        description:
          "A case study of options strategies around Walmart's Nasdaq listing and expected Nasdaq-100 inclusion, with conservative, moderate, and aggressive QQQ approaches.",
        author: { "@type": "Organization", name: "Fincai", url: SITE_URL },
        publisher: {
          "@type": "Organization",
          name: "Fincai",
          logo: { "@type": "ImageObject", url: `${SITE_URL}/logo.jpeg` },
        },
        mainEntityOfPage: url,
        datePublished: "2025-11-20",
        dateModified: "2026-07-02",
      },
    ],
  },
  {
    path: "/security",
    title: "Security — Fincai",
    description:
      "How Fincai connects to your brokerage account, what it can and cannot do, and how your data is handled.",
    crumb: "Security",
    noscript: {
      h1: "Security",
      paragraphs: [
        "Fincai cannot withdraw funds from your brokerage account, cannot deposit or transfer funds or securities out of it, and never sees or stores your Robinhood password.",
        "Fincai connects to Robinhood using the OAuth 2.1 authorization-code flow with PKCE — you authorize on Robinhood's own domain. OAuth tokens are stored encrypted at rest using AES-256-GCM and are deleted when you disconnect.",
        "New accounts run in paper (simulated) mode by default; live trading requires an explicit opt-in. Fincai holds no third-party security certification at this time.",
      ],
    },
  },
  {
    path: "/privacy",
    title: "Privacy Policy — Fincai",
    description:
      "What data Fincai collects, why, who it is shared with, and the choices you have.",
    crumb: "Privacy Policy",
    noscript: {
      h1: "Privacy Policy",
      paragraphs: [
        "This policy describes the data Fincai collects — account and identity data, brokerage data received via API, chat and prompt content, usage telemetry, and device and log data — and how it is used.",
        "When you use Fincai's AI features, the content of your prompts, including any symbols or positions you reference, is sent to a third-party AI model provider (Anthropic by default) to generate a response.",
      ],
    },
  },
  {
    path: "/terms",
    title: "Terms of Service — Fincai",
    description:
      "The agreement between you and Fincai governing your use of the product, including risk and AI-output limitations.",
    crumb: "Terms of Service",
    noscript: {
      h1: "Terms of Service",
      paragraphs: [
        "Fincai is a software tool for market analysis and order entry. It is not an investment adviser, broker-dealer, or financial planner, and nothing it produces is personalized investment advice.",
        "Trading involves substantial risk, including the possible loss of the entire amount invested. Automated and agentic strategies can act faster than you can review them; you remain responsible for every position in your account.",
      ],
    },
  },
  {
    path: "/disclosures",
    title: "Disclosures — Fincai",
    description:
      "The full text of every disclosure referenced across Fincai: not investment advice, trading and options risk, automated strategy risk, AI limitations, and trademarks.",
    crumb: "Disclosures",
    noscript: {
      h1: "Disclosures",
      paragraphs: [
        "Fincai is a software tool for market analysis and order entry. Nothing it produces is personalized investment advice, a recommendation, or an offer or solicitation of any kind.",
        "Trading involves substantial risk, including the possible loss of the entire amount invested. Options carry additional risk. Fincai does not promise, project, or imply any level of trading performance.",
        "Fincai is not affiliated with, endorsed by, or sponsored by Robinhood Markets, Inc.",
      ],
    },
  },
];

/** Alternate paths that should resolve to the same metadata as another route. */
const ALIASES: Record<string, string> = {
  // /agent renders the same landing as "/" and intentionally canonicalizes to "/".
  "/agent": "/",
};

/**
 * Routes that DO have dedicated SEO metadata (so they render correct tags when
 * visited directly) but are intentionally kept OUT of client/public/sitemap.xml
 * — e.g. app-only surfaces we don't want crawlers to discover or rank.
 *
 * This is the escape hatch for the sitemap-coverage test: every route returned
 * by getAllRoutes() must either appear in sitemap.xml or be listed here, so a
 * new public page can never be silently forgotten from the sitemap. Aliases in
 * ALIASES are a separate concept — they never appear in getAllRoutes() at all.
 *
 * Empty by design today: all configured routes are currently indexable.
 */
export const SITEMAP_EXCLUDED_PATHS: ReadonlySet<string> = new Set<string>([]);

const ROUTE_MAP: Map<string, RouteSeo> = new Map(ROUTES.map((r) => [r.path, r]));

function normalizePath(pathname: string): string {
  let p = (pathname || "/").split("?")[0].split("#")[0];
  if (p.length > 1 && p.endsWith("/")) p = p.replace(/\/+$/, "");
  return p === "" ? "/" : p;
}

/** Resolve a request/browser path to its canonical route metadata (or undefined). */
export function getRouteSeo(pathname: string): RouteSeo | undefined {
  const clean = normalizePath(pathname);
  const key = ALIASES[clean] ?? clean;
  return ROUTE_MAP.get(key);
}

export function getAllRoutes(): RouteSeo[] {
  return ROUTES;
}

/** Build a FAQPage JSON-LD object from a list of question/answer pairs. */
export function buildFaqJsonLd(
  faqs: { q: string; a: string }[],
): JsonLdObject {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
}

function buildBreadcrumb(route: RouteSeo, siteUrl: string): JsonLdObject {
  const items: { name: string; url: string }[] = [
    { name: "Home", url: `${siteUrl}/` },
  ];
  if (route.path !== "/") {
    items.push({ name: route.crumb ?? route.title, url: siteUrl + route.path });
  }
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      item: it.url,
    })),
  };
}

/** Build the route's JSON-LD objects: WebPage + BreadcrumbList + any extras. */
export function buildRouteJsonLd(
  route: RouteSeo,
  siteUrl: string = SITE_URL,
): JsonLdObject[] {
  const url = siteUrl + route.path;
  const webPage: JsonLdObject = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: route.title,
    description: route.description,
    url,
    inLanguage: "en-US",
    isPartOf: { "@type": "WebSite", name: "Fincai", url: siteUrl },
  };
  const extra = route.extraJsonLd ? route.extraJsonLd(url) : [];
  return [webPage, buildBreadcrumb(route, siteUrl), ...extra];
}

function resolveNoscript(route: RouteSeo): RouteNoscript {
  const base = route.noscript ?? {
    h1: route.title,
    paragraphs: [route.description],
  };
  return {
    h1: base.h1,
    paragraphs: [
      ...base.paragraphs,
      SEO_COMPLIANCE_LINE,
      TRADEMARK_ROBINHOOD_SHORT,
    ],
    bullets: base.bullets,
  };
}

// ---------------------------------------------------------------------------
// Server-side HTML injection helpers (pure string ops; no Node APIs).
// ---------------------------------------------------------------------------

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** JSON-LD serialized safely for embedding inside a <script> tag. */
function jsonLdToString(obj: JsonLdObject): string {
  return JSON.stringify(obj).replace(/</g, "\\u003c");
}

function replaceMeta(
  html: string,
  attr: "name" | "property",
  key: string,
  content: string,
): string {
  const re = new RegExp(`<meta\\s+${attr}="${escapeRegExp(key)}"[^>]*>`, "i");
  const tag = `<meta ${attr}="${key}" content="${escapeHtml(content)}" />`;
  if (re.test(html)) return html.replace(re, tag);
  return html.replace(/<\/head>/i, `    ${tag}\n  </head>`);
}

function buildNoscriptHtml(route: RouteSeo): string {
  const ns = resolveNoscript(route);
  const paras = ns.paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join("");
  const bullets =
    ns.bullets && ns.bullets.length
      ? `<ul>${ns.bullets.map((b) => `<li>${escapeHtml(b)}</li>`).join("")}</ul>`
      : "";
  return `<noscript><section><h1>${escapeHtml(ns.h1)}</h1>${paras}${bullets}</section></noscript>`;
}

/**
 * Rewrite the base index.html for a specific route: unique title, description,
 * canonical, OG/Twitter tags, a route-specific <noscript> block, and route
 * JSON-LD injected before </head>. Pure function — safe to unit test.
 */
export function injectRouteSeo(
  html: string,
  route: RouteSeo,
  siteUrl: string = SITE_URL,
): string {
  const url = siteUrl + route.path;
  let out = html;

  if (/<title>[\s\S]*?<\/title>/i.test(out)) {
    out = out.replace(
      /<title>[\s\S]*?<\/title>/i,
      `<title>${escapeHtml(route.title)}</title>`,
    );
  }

  out = replaceMeta(out, "name", "description", route.description);

  const canonicalTag = `<link rel="canonical" href="${escapeHtml(url)}" />`;
  if (/<link\s+rel="canonical"[^>]*>/i.test(out)) {
    out = out.replace(/<link\s+rel="canonical"[^>]*>/i, canonicalTag);
  } else {
    out = out.replace(/<\/head>/i, `    ${canonicalTag}\n  </head>`);
  }

  out = replaceMeta(out, "property", "og:title", route.title);
  out = replaceMeta(out, "property", "og:description", route.description);
  out = replaceMeta(out, "property", "og:url", url);
  if (route.ogType) out = replaceMeta(out, "property", "og:type", route.ogType);
  out = replaceMeta(out, "name", "twitter:title", route.title);
  out = replaceMeta(out, "name", "twitter:description", route.description);

  if (/<noscript>[\s\S]*?<\/noscript>/i.test(out)) {
    out = out.replace(/<noscript>[\s\S]*?<\/noscript>/i, buildNoscriptHtml(route));
  }

  const scripts = buildRouteJsonLd(route, siteUrl)
    .map(
      (o) =>
        `<script type="application/ld+json" data-seo-route>${jsonLdToString(o)}</script>`,
    )
    .join("\n    ");
  out = out.replace(/<\/head>/i, `    ${scripts}\n  </head>`);

  return out;
}
