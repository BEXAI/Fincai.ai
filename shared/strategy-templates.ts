// Curated, robust strategy templates derived from the KalshiBot trading engine
// and adapted from prediction markets to stocks & options for Fincai.
//
// These are READ-ONLY presets available to every user. Applying a template
// pre-fills the Strategy Builder (type + risk-management rules); the user then
// reviews the legs, analyzes, and saves it as their own strategy. Because the
// catalog is plain data it needs no database table and is visible to all users.

export type StrategyTypeOption =
  | "call"
  | "put"
  | "call_spread"
  | "put_spread"
  | "straddle"
  | "strangle"
  | "iron_condor"
  | "butterfly";

export type RiskLevel = "conservative" | "moderate" | "aggressive";

// How the live runner decides to ENTER a position, computed from live quotes:
//  - momentum:  enter once price moves >= thresholdPct in the trade direction.
//  - reversion: enter once price stretches >= thresholdPct against the trade
//               direction (fade the extreme, expecting a snap-back).
//  - immediate: enter on the first check (signal-gated templates whose real
//               edge can't be recomputed live are honestly entered immediately).
export type EntryTriggerType = "momentum" | "reversion" | "immediate";

export interface EntryTrigger {
  type: EntryTriggerType;
  thresholdPct?: number;
}

export type RunDirection = "long" | "short";

export interface StrategyTemplatePreset {
  strategyType: StrategyTypeOption;
  riskProfile: RiskLevel;
  legType: "call" | "put";
  defaultSymbol: string;
  description: string;
  stopLossPercent: number;
  profitTargetPercent: number;
  timeStopMinutes?: number;
  useTrailingStop: boolean;
  entryTrigger: EntryTrigger;
}

export interface StrategyTemplate {
  id: string;
  name: string;
  tagline: string;
  derivedFrom: string;
  riskLevel: RiskLevel;
  bestFor: string;
  sizingMethod: string;
  howItWorks: string[];
  preset: StrategyTemplatePreset;
}

export const STRATEGY_TEMPLATES: StrategyTemplate[] = [
  {
    id: "momentum-breakout-rider",
    name: "Momentum Breakout Rider",
    tagline:
      "Catch explosive intraday moves and let a trailing stop lock in the gains.",
    derivedFrom: "KalshiBot — MomentumRider",
    riskLevel: "aggressive",
    bestFor: "Trending, high-volume sessions with a clear directional catalyst.",
    sizingMethod: "Fractional Kelly — size up only when the edge is strong.",
    howItWorks: [
      "Entry: fires when the underlying drifts sharply in one direction within a short window (the bot used ~0.8% over 5 minutes). On stocks, you buy a call as upside momentum confirms.",
      "Trailing stop: rides the move and ratchets up to protect profit as price climbs, mirroring the bot's peak-tracking exit.",
      "Hard stop: a fixed stop-loss cuts the trade fast if momentum reverses.",
      "Time stop: closes the position if the move stalls, so option decay doesn't eat your gains.",
    ],
    preset: {
      strategyType: "call",
      riskProfile: "aggressive",
      legType: "call",
      defaultSymbol: "QQQ",
      description:
        "Momentum breakout: enter on a fast directional move, ride it with a trailing stop, and exit hard on reversal or stall. Derived from KalshiBot's MomentumRider.",
      stopLossPercent: 20,
      profitTargetPercent: 40,
      timeStopMinutes: 60,
      useTrailingStop: true,
      entryTrigger: { type: "momentum", thresholdPct: 0.8 },
    },
  },
  {
    id: "ai-consensus-convergence",
    name: "AI Consensus Convergence",
    tagline:
      "Only trade when the AI debate and the trend agree — skip the coin-flips.",
    derivedFrom: "KalshiBot — TradingAgent debate engine + forecast convergence",
    riskLevel: "moderate",
    bestFor: "Any market regime; built to filter out low-conviction setups.",
    sizingMethod: "Edge-weighted fractional Kelly.",
    howItWorks: [
      "Signal: Fincai's multi-agent bull/bear debate produces a probability for the move.",
      "Confirmation: the trade only fires when the AI view and the price trend point the same way (the bot's +20% convergence bonus, -30% divergence penalty).",
      "Edge gate: enter only when the modeled edge clears a minimum threshold (the bot used ~0.5%).",
      "Exit: a profit target and stop-loss keep the reward-to-risk firmly in your favor.",
    ],
    preset: {
      strategyType: "call",
      riskProfile: "moderate",
      legType: "call",
      defaultSymbol: "SPY",
      description:
        "AI consensus: act only when the multi-agent debate and the trend forecast agree and the edge clears a threshold. Derived from KalshiBot's TradingAgent.",
      stopLossPercent: 25,
      profitTargetPercent: 50,
      timeStopMinutes: 120,
      useTrailingStop: false,
      entryTrigger: { type: "immediate" },
    },
  },
  {
    id: "fair-value-edge",
    name: "Fair-Value Edge",
    tagline: "Buy when the market underprices fair value, sized by your edge.",
    derivedFrom: "KalshiBot — ArbitrageScanner spread logic + Kelly sizing",
    riskLevel: "moderate",
    bestFor: "Options that look mispriced versus Fincai's pricing engine.",
    sizingMethod: "Fractional Kelly scaled to the size of the fair-value gap.",
    howItWorks: [
      "Fair value: Fincai's autonomous pricing engine (Black-Scholes / Bjerksund-Stensland) computes the option's theoretical value.",
      "Edge: compare the live market price to fair value; the bot acted when the gap exceeded ~2%.",
      "Entry: buy when the market clearly underprices fair value, and stand aside when the edge is thin.",
      "Sizing: fractional Kelly scales the position to the size of the edge, never betting the whole bankroll.",
    ],
    preset: {
      strategyType: "call",
      riskProfile: "moderate",
      legType: "call",
      defaultSymbol: "AAPL",
      description:
        "Fair-value edge: buy when the market price trades below the pricing engine's fair value by a meaningful margin, sized by fractional Kelly. Derived from KalshiBot's ArbitrageScanner.",
      stopLossPercent: 20,
      profitTargetPercent: 40,
      useTrailingStop: false,
      entryTrigger: { type: "immediate" },
    },
  },
  {
    id: "mean-reversion-fade",
    name: "Mean-Reversion Fade",
    tagline: "Fade overextended moves back toward fair value.",
    derivedFrom: "KalshiBot — MarketMaker fair-price deviation logic",
    riskLevel: "conservative",
    bestFor: "Range-bound or overbought / oversold conditions.",
    sizingMethod: "Conservative fractional Kelly with a tight stop.",
    howItWorks: [
      "Reference: anchor to the AI fair price, like the bot's market-making mid-price.",
      "Entry: when price stretches far from fair value, take the opposite side expecting reversion (for example, a put after an overextended rally).",
      "Tight risk: a small stop-loss respects that reversion can take time or fail outright.",
      "Exit: take profit as price snaps back toward fair value.",
    ],
    preset: {
      strategyType: "put",
      riskProfile: "conservative",
      legType: "put",
      defaultSymbol: "SPY",
      description:
        "Mean-reversion fade: take the opposite side of an overextended move and target a snap-back toward fair value, with a tight stop. Derived from KalshiBot's MarketMaker deviation logic.",
      stopLossPercent: 15,
      profitTargetPercent: 30,
      timeStopMinutes: 90,
      useTrailingStop: false,
      entryTrigger: { type: "reversion", thresholdPct: 0.8 },
    },
  },
  {
    id: "time-series-momentum",
    name: "Time-Series Momentum",
    tagline:
      "Ride established trends the way managed-futures desks do — go with the tape, not against it.",
    derivedFrom: "Managed-futures / CTA time-series momentum (Moskowitz–Ooi–Pedersen)",
    riskLevel: "moderate",
    bestFor: "Sustained, trending markets across indices and large-cap names.",
    sizingMethod: "Volatility-targeted — scale size down as realized volatility rises.",
    howItWorks: [
      "Signal: measures whether an asset's own recent return is positive (up-trend) or negative — the core of time-series momentum used by CTAs.",
      "Entry: buys strength once the underlying extends in the trend direction past a confirmation threshold (~0.6% intraday).",
      "Volatility targeting: position size aims at a constant risk budget, so calmer trends get more size and choppy ones get less.",
      "Exit: a trailing stop rides the trend and locks in gains as it matures, while a hard stop cuts a failed breakout fast.",
    ],
    preset: {
      strategyType: "call",
      riskProfile: "moderate",
      legType: "call",
      defaultSymbol: "QQQ",
      description:
        "Time-series momentum: go long an asset that is trending up, size by volatility targeting, and ride it with a trailing stop. Modeled on managed-futures / CTA trend following.",
      stopLossPercent: 20,
      profitTargetPercent: 45,
      timeStopMinutes: 120,
      useTrailingStop: true,
      entryTrigger: { type: "momentum", thresholdPct: 0.6 },
    },
  },
  {
    id: "factor-momentum",
    name: "Cross-Sectional Factor Momentum",
    tagline:
      "Buy the relative winners — the equity-momentum factor that anchors quant stock selection.",
    derivedFrom: "Cross-sectional equity momentum (Jegadeesh–Titman; AQR factor research)",
    riskLevel: "moderate",
    bestFor: "Stock selection in normal regimes where recent winners keep leading.",
    sizingMethod: "Rank-weighted, equal-risk — more weight to the strongest relative performers.",
    howItWorks: [
      "Signal: ranks a name by its trailing relative strength versus the broad market — the cross-sectional momentum factor documented by Jegadeesh–Titman.",
      "Entry: enters the leaders as they confirm continued outperformance (~0.5% drift).",
      "Edge gate: stands aside when relative strength is ambiguous to avoid whipsaw in factor-neutral tape.",
      "Exit: a profit target and stop keep reward-to-risk favorable, and a time stop closes stale rankings.",
    ],
    preset: {
      strategyType: "call",
      riskProfile: "moderate",
      legType: "call",
      defaultSymbol: "SPY",
      description:
        "Cross-sectional momentum: go long the names with the strongest relative strength, weighted by rank. Modeled on the academic equity-momentum factor used across quant desks.",
      stopLossPercent: 22,
      profitTargetPercent: 44,
      timeStopMinutes: 120,
      useTrailingStop: false,
      entryTrigger: { type: "momentum", thresholdPct: 0.5 },
    },
  },
  {
    id: "stat-arb-reversion",
    name: "Statistical Arbitrage Reversion",
    tagline:
      "Fade statistical extremes back to the mean the way stat-arb desks trade dislocations.",
    derivedFrom: "Statistical-arbitrage desks (Avellaneda–Lee OU mean-reversion / z-score)",
    riskLevel: "conservative",
    bestFor: "Liquid names that have stretched far from their short-term average.",
    sizingMethod: "Half-life scaled, conservative fractional Kelly — small size, many shots.",
    howItWorks: [
      "Signal: treats price as mean-reverting and measures how many standard deviations (a z-score) it sits from its short-term mean — the engine behind statistical arbitrage.",
      "Entry: when an oversold name stretches well below the mean, it buys expecting a snap-back toward fair value (~1.0% deviation).",
      "Honest scope: classic stat-arb is a market-neutral pair; this expresses the same reversion signal on a single liquid name so the equity runner can trade it.",
      "Risk: a tight stop respects that reversion can fail, and profit is taken as price reverts.",
    ],
    preset: {
      strategyType: "call",
      riskProfile: "conservative",
      legType: "call",
      defaultSymbol: "SPY",
      description:
        "Statistical-arbitrage reversion: buy a liquid name when its z-score shows it is statistically oversold, targeting a reversion to the mean with a tight stop. Modeled on stat-arb desk mean-reversion.",
      stopLossPercent: 15,
      profitTargetPercent: 30,
      timeStopMinutes: 90,
      useTrailingStop: false,
      entryTrigger: { type: "reversion", thresholdPct: 1.0 },
    },
  },
  {
    id: "vol-risk-premium",
    name: "Volatility Risk Premium Harvest",
    tagline:
      "Collect the premium options buyers overpay — the carry trade of institutional vol desks.",
    derivedFrom: "Volatility-risk-premium harvesting (sell-side vol desks; VRP literature)",
    riskLevel: "conservative",
    bestFor: "Range-bound markets where implied volatility is richer than realized.",
    sizingMethod: "Defined-risk premium selling — cap the loss on every structure.",
    howItWorks: [
      "Edge: implied volatility tends to trade above what actually gets realized; harvesting that gap is the volatility risk premium.",
      "Structure: pre-fills a defined-risk iron condor in the Builder so you sell premium with capped downside.",
      "Regime: best when IV is elevated versus realized — check the VIX panel in Market Analysis first.",
      "Live note: selling volatility is not a long-only equity trade, so the autonomous runner treats this template as paper/simulation; place the options structure yourself in the Builder.",
    ],
    preset: {
      strategyType: "iron_condor",
      riskProfile: "conservative",
      legType: "put",
      defaultSymbol: "SPY",
      description:
        "Volatility risk premium: sell a defined-risk iron condor to harvest the gap between implied and realized volatility. Modeled on institutional vol-desk premium selling.",
      stopLossPercent: 20,
      profitTargetPercent: 30,
      useTrailingStop: false,
      entryTrigger: { type: "immediate" },
    },
  },
  {
    id: "risk-parity-core",
    name: "Risk-Parity Core",
    tagline:
      "Build a position the all-weather way — let volatility, not gut feel, set the size.",
    derivedFrom: "Risk parity / all-weather allocation (Bridgewater-style risk budgeting)",
    riskLevel: "conservative",
    bestFor: "Core, lower-turnover exposure you want to hold through changing regimes.",
    sizingMethod: "Inverse-volatility risk budgeting — equalize risk contribution, not dollars.",
    howItWorks: [
      "Principle: risk parity sizes exposure by volatility so each holding contributes the same amount of risk — the foundation of all-weather portfolios.",
      "Entry: establishes the core position immediately rather than timing a signal; the edge is in sizing and discipline, not entry timing.",
      "Sizing: a calmer asset earns more size and a turbulent one earns less, keeping total risk steady.",
      "Exit: a wide stop and patient target — this is a core holding, not a scalp.",
    ],
    preset: {
      strategyType: "call",
      riskProfile: "conservative",
      legType: "call",
      defaultSymbol: "SPY",
      description:
        "Risk-parity core: take a long core position sized by inverse volatility so risk stays balanced, holding through regimes with a wide stop. Modeled on all-weather risk budgeting.",
      stopLossPercent: 16,
      profitTargetPercent: 32,
      useTrailingStop: false,
      entryTrigger: { type: "immediate" },
    },
  },
];

export function getStrategyTemplate(id: string): StrategyTemplate | undefined {
  return STRATEGY_TEMPLATES.find((t) => t.id === id);
}

// Defaults the live runner uses for an EQUITY auto-trade derived from a template.
export interface EquityRunDefaults {
  direction: RunDirection;
  entryTriggerType: EntryTriggerType;
  entryThresholdPct: number;
  stopLossPercent: number;
  profitTargetPercent: number;
  useTrailingStop: boolean;
  trailingStopPercent: number;
  timeStopMinutes?: number;
}

// The template stop/target percentages are calibrated for OPTION premium swings
// (15-50%), which are unrealistic for the underlying EQUITY. The live runner
// trades equity, so we scale risk to realistic intraday equity moves while
// preserving each template's structure (trigger, trailing/time stops). All keep
// a 2:1 reward-to-risk (>= the builder's 1.5 minimum).
const EQUITY_RISK_RULES: Record<RiskLevel, { stop: number; target: number; trail: number }> = {
  conservative: { stop: 1.0, target: 2.0, trail: 1.0 },
  moderate: { stop: 1.5, target: 3.0, trail: 1.5 },
  aggressive: { stop: 2.0, target: 4.0, trail: 2.0 },
};

export function getEquityRunDefaults(template: StrategyTemplate): EquityRunDefaults {
  const rules = EQUITY_RISK_RULES[template.preset.riskProfile];
  const trigger = template.preset.entryTrigger;
  return {
    direction: template.preset.legType === "put" ? "short" : "long",
    entryTriggerType: trigger.type,
    entryThresholdPct: trigger.thresholdPct ?? 0,
    stopLossPercent: rules.stop,
    profitTargetPercent: rules.target,
    useTrailingStop: template.preset.useTrailingStop,
    trailingStopPercent: rules.trail,
    timeStopMinutes: template.preset.timeStopMinutes,
  };
}
