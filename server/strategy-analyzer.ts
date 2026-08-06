import { greeksCalculator, type GreeksInput } from "./greeks-calculator";
import type { PayoffPoint, Greeks } from "@shared/schema";

export interface OptionsLegInput {
  optionType: "call" | "put";
  action: "buy" | "sell";
  strike: number;
  quantity: number;
  premium: number;
  expirationDate: string;
}

export interface StrategyAnalysisInput {
  underlyingSymbol: string;
  currentPrice: number;
  legs: OptionsLegInput[];
  riskFreeRate?: number;
  volatility?: number;
}

export interface StrategyAnalysisResult {
  currentPrice: number;
  payoffDiagram: PayoffPoint[];
  greeks: Greeks;
  maxProfit: number;
  maxLoss: number;
  breakeven: number[];
  probabilityOfProfit: number;
}

export class StrategyAnalyzer {
  private calculateLegPayoff(
    leg: OptionsLegInput,
    underlyingPrice: number
  ): number {
    const { optionType, action, strike, quantity, premium } = leg;
    const multiplier = action === "buy" ? 1 : -1;

    let intrinsicValue = 0;
    if (optionType === "call") {
      intrinsicValue = Math.max(0, underlyingPrice - strike);
    } else {
      intrinsicValue = Math.max(0, strike - underlyingPrice);
    }

    const payoff = (intrinsicValue - premium) * multiplier * quantity * 100;
    return payoff;
  }

  private calculatePayoffDiagram(
    legs: OptionsLegInput[],
    currentPrice: number
  ): PayoffPoint[] {
    const points: PayoffPoint[] = [];
    const minPrice = currentPrice * 0.7;
    const maxPrice = currentPrice * 1.3;
    const step = (maxPrice - minPrice) / 50;

    for (let price = minPrice; price <= maxPrice; price += step) {
      let totalPayoff = 0;
      for (const leg of legs) {
        totalPayoff += this.calculateLegPayoff(leg, price);
      }
      points.push({
        underlyingPrice: price,
        profitLoss: totalPayoff,
      });
    }

    return points;
  }

  private calculateMaxProfitLoss(
    payoffDiagram: PayoffPoint[]
  ): { maxProfit: number; maxLoss: number } {
    let maxProfit = -Infinity;
    let maxLoss = Infinity;

    for (const point of payoffDiagram) {
      maxProfit = Math.max(maxProfit, point.profitLoss);
      maxLoss = Math.min(maxLoss, point.profitLoss);
    }

    return { maxProfit, maxLoss };
  }

  private calculateBreakeven(
    payoffDiagram: PayoffPoint[]
  ): number[] {
    const breakevens: number[] = [];

    for (let i = 0; i < payoffDiagram.length - 1; i++) {
      const current = payoffDiagram[i];
      const next = payoffDiagram[i + 1];

      if (
        (current.profitLoss <= 0 && next.profitLoss > 0) ||
        (current.profitLoss >= 0 && next.profitLoss < 0)
      ) {
        const breakevenPrice =
          current.underlyingPrice +
          (Math.abs(current.profitLoss) /
            (Math.abs(current.profitLoss) + Math.abs(next.profitLoss))) *
            (next.underlyingPrice - current.underlyingPrice);
        breakevens.push(breakevenPrice);
      }
    }

    return breakevens;
  }

  private calculateTimeToExpiry(expirationDate: string): number {
    const expiry = new Date(expirationDate);
    const now = new Date();
    const daysToExpiry = (expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    return Math.max(daysToExpiry / 365, 0.001); // Convert to years, minimum 0.001
  }

  analyzeStrategy(input: StrategyAnalysisInput): StrategyAnalysisResult {
    const { currentPrice, legs, riskFreeRate = 0.05, volatility = 0.20 } = input;

    const payoffDiagram = this.calculatePayoffDiagram(legs, currentPrice);
    const { maxProfit, maxLoss } = this.calculateMaxProfitLoss(payoffDiagram);
    const breakeven = this.calculateBreakeven(payoffDiagram);

    // Calculate portfolio Greeks
    const greeksInputs = legs.map((leg) => {
      const timeToExpiry = this.calculateTimeToExpiry(leg.expirationDate);
      return {
        input: {
          spotPrice: currentPrice,
          strikePrice: leg.strike,
          timeToExpiry,
          riskFreeRate,
          volatility,
          optionType: leg.optionType,
        } as GreeksInput,
        quantity: leg.quantity,
        action: leg.action,
      };
    });

    const greeks = greeksCalculator.calculatePortfolioGreeks(greeksInputs);

    // Simple probability of profit calculation
    const profitablePoints = payoffDiagram.filter((p) => p.profitLoss > 0).length;
    const probabilityOfProfit = (profitablePoints / payoffDiagram.length) * 100;

    return {
      currentPrice,
      payoffDiagram,
      greeks,
      maxProfit,
      maxLoss,
      breakeven,
      probabilityOfProfit,
    };
  }
}

export const strategyAnalyzer = new StrategyAnalyzer();
