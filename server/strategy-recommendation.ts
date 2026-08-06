import { MarketDataService } from "./market-data";
import { storage } from "./storage";
import type { InsertAiStrategyRecommendation, AiStrategyRecommendation } from "@shared/schema";
import { getModelConfig } from "./config/claudeConfig";
import { anthropic } from "./anthropic";

interface MarketSnapshot {
  spy: { price: number; change: number; changePercent: number } | null;
  vix: { price: number; change: number } | null;
  timestamp: string;
  marketRegime: "bullish" | "bearish" | "neutral" | "high_volatility";
}

interface TechnicalSignals {
  trend: "bullish" | "bearish" | "neutral";
  momentum: "strong" | "weak" | "neutral";
  volatility: "low" | "medium" | "high";
  support?: number;
  resistance?: number;
  numericSignal: number; // -1 to 1
}

interface StrategyCandidate {
  strategyType: string;
  direction: "bullish" | "bearish" | "neutral";
  suitableFor: string[];
  description: string;
}

const STRATEGY_TYPES: StrategyCandidate[] = [
  {
    strategyType: "long_call",
    direction: "bullish",
    suitableFor: ["aggressive", "moderate"],
    description: "Buy a call option to profit from upside with limited downside risk",
  },
  {
    strategyType: "long_put",
    direction: "bearish",
    suitableFor: ["aggressive", "moderate"],
    description: "Buy a put option to profit from downside or hedge portfolio",
  },
  {
    strategyType: "covered_call",
    direction: "neutral",
    suitableFor: ["conservative", "moderate"],
    description: "Sell calls against existing stock to generate income",
  },
  {
    strategyType: "cash_secured_put",
    direction: "bullish",
    suitableFor: ["conservative", "moderate"],
    description: "Sell puts to collect premium while waiting to buy shares",
  },
  {
    strategyType: "bull_call_spread",
    direction: "bullish",
    suitableFor: ["moderate", "aggressive"],
    description: "Buy lower strike call, sell higher strike to limit cost and risk",
  },
  {
    strategyType: "bear_put_spread",
    direction: "bearish",
    suitableFor: ["moderate", "aggressive"],
    description: "Buy higher strike put, sell lower strike to limit cost and risk",
  },
  {
    strategyType: "iron_condor",
    direction: "neutral",
    suitableFor: ["conservative", "moderate"],
    description: "Profit from low volatility by selling OTM puts and calls",
  },
  {
    strategyType: "stock_purchase",
    direction: "bullish",
    suitableFor: ["conservative", "moderate", "aggressive"],
    description: "Buy shares directly for long-term ownership",
  },
];

export class StrategyRecommendationService {
  private marketData: MarketDataService;

  constructor() {
    this.marketData = new MarketDataService();
  }

  async getMarketSnapshot(): Promise<MarketSnapshot> {
    const [spyQuote, vixQuote] = await Promise.all([
      this.marketData.getQuote("SPY").catch(() => null),
      this.marketData.getQuote("VIX").catch(() => null),
    ]);

    let marketRegime: MarketSnapshot["marketRegime"] = "neutral";
    
    if (vixQuote && vixQuote.price > 25) {
      marketRegime = "high_volatility";
    } else if (spyQuote) {
      if (spyQuote.changePercent > 0.5) {
        marketRegime = "bullish";
      } else if (spyQuote.changePercent < -0.5) {
        marketRegime = "bearish";
      }
    }

    return {
      spy: spyQuote
        ? { price: spyQuote.price, change: spyQuote.change, changePercent: spyQuote.changePercent }
        : null,
      vix: vixQuote ? { price: vixQuote.price, change: vixQuote.change } : null,
      timestamp: new Date().toISOString(),
      marketRegime,
    };
  }

  private async analyzeTechnicals(symbol: string): Promise<TechnicalSignals> {
    try {
      const quote = await this.marketData.getQuote(symbol);
      if (!quote) {
        return { trend: "neutral", momentum: "neutral", volatility: "medium", numericSignal: 0 };
      }

      let trend: TechnicalSignals["trend"] = "neutral";
      let numericSignal = 0;
      if (quote.changePercent > 1) {
        trend = "bullish";
        numericSignal = Math.min(1, quote.changePercent / 5);
      } else if (quote.changePercent < -1) {
        trend = "bearish";
        numericSignal = Math.max(-1, quote.changePercent / 5);
      }

      let momentum: TechnicalSignals["momentum"] = "neutral";
      if (Math.abs(quote.changePercent) > 2) momentum = "strong";
      else if (Math.abs(quote.changePercent) < 0.5) momentum = "weak";

      const volatility: TechnicalSignals["volatility"] =
        Math.abs(quote.high - quote.low) / quote.price > 0.02 ? "high" : 
        Math.abs(quote.high - quote.low) / quote.price > 0.01 ? "medium" : "low";

      return {
        trend,
        momentum,
        volatility,
        support: quote.low,
        resistance: quote.high,
        numericSignal,
      };
    } catch {
      return { trend: "neutral", momentum: "neutral", volatility: "medium", numericSignal: 0 };
    }
  }

  private selectStrategiesForConditions(
    marketRegime: MarketSnapshot["marketRegime"],
    technicals: TechnicalSignals,
    riskProfile: string
  ): StrategyCandidate[] {
    let preferredDirection: StrategyCandidate["direction"][];

    if (marketRegime === "high_volatility") {
      preferredDirection = ["neutral"];
    } else if (marketRegime === "bullish" || technicals.trend === "bullish") {
      preferredDirection = ["bullish", "neutral"];
    } else if (marketRegime === "bearish" || technicals.trend === "bearish") {
      preferredDirection = ["bearish", "neutral"];
    } else {
      preferredDirection = ["neutral", "bullish"];
    }

    return STRATEGY_TYPES.filter(
      (s) =>
        s.suitableFor.includes(riskProfile) &&
        preferredDirection.includes(s.direction)
    );
  }

  async generateRecommendation(
    symbol: string,
    riskProfile: "conservative" | "moderate" | "aggressive",
    userId: string | null
  ): Promise<AiStrategyRecommendation> {
    const [marketSnapshot, technicals, quote] = await Promise.all([
      this.getMarketSnapshot(),
      this.analyzeTechnicals(symbol),
      this.marketData.getQuote(symbol),
    ]);

    const candidateStrategies = this.selectStrategiesForConditions(
      marketSnapshot.marketRegime,
      technicals,
      riskProfile
    );

    const selectedStrategy = candidateStrategies[0] || STRATEGY_TYPES[7]; // Default to stock purchase

    const prompt = `You are a trading analyst. Based on the following market data, generate a specific trading recommendation.

SYMBOL: ${symbol}
CURRENT PRICE: $${quote?.price?.toFixed(2) || "Unknown"}
TODAY'S CHANGE: ${quote?.changePercent?.toFixed(2) || 0}%

MARKET CONDITIONS:
- SPY: $${marketSnapshot.spy?.price?.toFixed(2) || "N/A"} (${marketSnapshot.spy?.changePercent?.toFixed(2) || 0}%)
- VIX: ${marketSnapshot.vix?.price?.toFixed(1) || "N/A"}
- Market Regime: ${marketSnapshot.marketRegime}

TECHNICAL SIGNALS:
- Trend: ${technicals.trend}
- Momentum: ${technicals.momentum}
- Volatility: ${technicals.volatility}

SELECTED STRATEGY: ${selectedStrategy.strategyType}
RISK PROFILE: ${riskProfile}

Provide a JSON response with the following structure:
{
  "title": "Short compelling title for this recommendation",
  "thesis": "One sentence thesis explaining why this trade makes sense",
  "reasoning": "2-3 sentence detailed reasoning",
  "keyFactors": ["factor1", "factor2", "factor3"],
  "confidenceScore": 0.7, // 0.0 to 1.0
  "technicalSignal": "bullish|bearish|neutral",
  "sentimentSignal": "bullish|bearish|neutral",
  "suggestedEntryPrice": ${quote?.price || 0},
  "stopLossPercent": 5.0,
  "profitTargetPercent": 10.0,
  "timeHorizon": "intraday|swing|position"
}

Only respond with valid JSON.`;

    let aiAnalysis: {
      title: string;
      thesis: string;
      reasoning: string;
      keyFactors: string[];
      confidenceScore: number;
      technicalSignal: string;
      sentimentSignal: string;
      suggestedEntryPrice: number;
      stopLossPercent: number;
      profitTargetPercent: number;
      timeHorizon: string;
    };

    try {
      const config = getModelConfig();
      const message = await anthropic.messages.create({
        model: config.model,
        max_tokens: 1024,
        temperature: config.temperature,
        messages: [{ role: "user", content: prompt }],
      });

      const responseText =
        message.content[0].type === "text" ? message.content[0].text : "";
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        aiAnalysis = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("No JSON in response");
      }
    } catch {
      aiAnalysis = {
        title: `${selectedStrategy.strategyType.replace(/_/g, " ")} on ${symbol}`,
        thesis: selectedStrategy.description,
        reasoning: `Based on current ${marketSnapshot.marketRegime} market conditions and ${technicals.trend} technical signals.`,
        keyFactors: ["Market conditions favor this strategy", "Technical signals aligned"],
        confidenceScore: 0.6,
        technicalSignal: technicals.trend,
        sentimentSignal: "neutral",
        suggestedEntryPrice: quote?.price || 0,
        stopLossPercent: 5.0,
        profitTargetPercent: 10.0,
        timeHorizon: "swing",
      };
    }

    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    const sentimentNumeric = aiAnalysis.sentimentSignal === "bullish" ? 0.5 : 
      aiAnalysis.sentimentSignal === "bearish" ? -0.5 : 0;

    const recommendation: InsertAiStrategyRecommendation = {
      userId,
      title: aiAnalysis.title,
      thesis: aiAnalysis.thesis,
      strategyType: selectedStrategy.strategyType,
      riskProfile,
      primarySymbol: symbol.toUpperCase(),
      action: selectedStrategy.direction === "bearish" ? "sell" : "buy",
      direction: selectedStrategy.direction,
      timeHorizon: aiAnalysis.timeHorizon as "intraday" | "swing" | "position",
      suggestedEntryPrice: aiAnalysis.suggestedEntryPrice,
      stopLossPercent: aiAnalysis.stopLossPercent,
      profitTargetPercent: aiAnalysis.profitTargetPercent,
      confidenceScore: aiAnalysis.confidenceScore,
      technicalSignal: technicals.numericSignal,
      sentimentSignal: sentimentNumeric,
      reasoning: aiAnalysis.reasoning,
      keyFactors: aiAnalysis.keyFactors,
      marketSnapshot: {
        spyPrice: marketSnapshot.spy?.price ?? 0,
        spyChange: marketSnapshot.spy?.change ?? 0,
        spyChangePercent: marketSnapshot.spy?.changePercent ?? 0,
        vix: marketSnapshot.vix?.price ?? null,
        marketRegime: marketSnapshot.marketRegime,
        timestamp: marketSnapshot.timestamp,
      },
      status: "active",
      expiresAt,
    };

    return await storage.createAiStrategyRecommendation(recommendation);
  }

  async getActiveRecommendations(userId: string | null): Promise<AiStrategyRecommendation[]> {
    await storage.expireOldAiStrategyRecommendations();
    return storage.getActiveAiStrategyRecommendations(userId);
  }

  async getRecommendationHistory(userId: string | null, limit = 50): Promise<AiStrategyRecommendation[]> {
    return storage.getAiStrategyRecommendationsForUser(userId, limit);
  }

  async updateRecommendationStatus(
    id: string,
    userAction: "accepted" | "rejected" | "ignored",
    executedTradeId?: string
  ): Promise<AiStrategyRecommendation | undefined> {
    const status = userAction === "accepted" ? "executed" : userAction;
    return storage.updateAiStrategyRecommendationStatus(id, status, userAction, executedTradeId);
  }
}

export const strategyRecommendationService = new StrategyRecommendationService();
