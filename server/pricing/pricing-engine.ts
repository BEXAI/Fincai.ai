/**
 * Fincai Autonomous Pricing Engine - Orchestrator
 * 
 * The PricingEngine is the main entry point for all pricing operations.
 * It composes the pricing kernel, yield curve service, and dividend cache
 * to provide a unified API for option valuation.
 * 
 * Features:
 * - European & American option pricing
 * - Greeks calculation with cost-of-carry
 * - Implied volatility solving
 * - Volatility surface generation
 * - Put-call parity validation
 * 
 * License: MIT (Original optlib by Davis Edwards / Daniel Rojas)
 */

import { gbsPrice, priceEuropean, calculateCostOfCarry, getMoneyness, calculateIntrinsicValue } from './gbs';
import { priceAmerican, priceAmericanOption, calculateEarlyExercisePremium } from './american-bjerksund';
import { calculateAllGreeks, calculateGreeksFromInput, vectorizedGreeks, calculateDollarGreeks } from './greeks';
import { solveImpliedVolatility, solveChainIV, calculateMidPrice, validateQuoteForIV } from './implied-vol';
import { getInterpolatedRate, getInterpolatedRateSync, getYieldCurve, initializeYieldCurve } from './yield-curve-service';
import { getDividendYield, isIndexSymbol, initializeDividendCache } from './dividend-service';
import { calculateTimeToExpiry, clampTimeToExpiry, is0DTE } from './time-utils';
import {
  PricingInput,
  PricingResult,
  Greeks,
  AssetClass,
  OptionStyle,
  OptionType,
  IVSolverResult,
  VolatilitySurface,
  VolatilitySurfacePoint,
} from './types';

export interface PricingEngineConfig {
  defaultAssetClass: AssetClass;
  useAmericanPricing: boolean;
  defaultRiskFreeRate: number;
  validateParity: boolean;
}

const DEFAULT_CONFIG: PricingEngineConfig = {
  defaultAssetClass: AssetClass.STOCK,
  useAmericanPricing: true,
  defaultRiskFreeRate: 0.05,
  validateParity: true,
};

export class PricingEngine {
  private config: PricingEngineConfig;
  private initialized: boolean = false;

  constructor(config: Partial<PricingEngineConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    console.log('[PricingEngine] Initializing...');
    
    // Initialize services
    await initializeYieldCurve();
    initializeDividendCache();
    
    this.initialized = true;
    console.log('[PricingEngine] Ready');
  }

  /**
   * Get risk-free rate for given time to expiry
   */
  async getRiskFreeRate(T: number): Promise<number> {
    return getInterpolatedRate(T);
  }

  /**
   * Get risk-free rate synchronously (uses cached curve)
   */
  getRiskFreeRateSync(T: number): number {
    return getInterpolatedRateSync(T);
  }

  /**
   * Get dividend yield for symbol
   */
  getDividendYield(symbol: string): number {
    return getDividendYield(symbol);
  }

  /**
   * Determine asset class from symbol
   */
  getAssetClass(symbol: string): AssetClass {
    if (isIndexSymbol(symbol)) {
      return AssetClass.INDEX;
    }
    return this.config.defaultAssetClass;
  }

  /**
   * Price a single option with full result
   */
  async priceOption(
    symbol: string,
    S: number,
    K: number,
    expirationDate: Date,
    sigma: number,
    optionType: OptionType,
    style: OptionStyle = OptionStyle.AMERICAN
  ): Promise<PricingResult> {
    const T = calculateTimeToExpiry(expirationDate);
    const clampedT = clampTimeToExpiry(T);
    const r = await this.getRiskFreeRate(clampedT);
    const q = this.getDividendYield(symbol);
    const assetClass = this.getAssetClass(symbol);
    const b = calculateCostOfCarry(r, assetClass, q);

    // Calculate price
    let price: number;
    if (style === OptionStyle.AMERICAN && this.config.useAmericanPricing) {
      price = priceAmerican(S, K, clampedT, r, b, sigma, optionType);
    } else {
      price = gbsPrice(S, K, clampedT, r, b, sigma, optionType);
    }

    // Calculate Greeks
    const greeks = calculateAllGreeks(S, K, clampedT, r, b, sigma, optionType);

    // Calculate intrinsic and time value
    const intrinsicValue = calculateIntrinsicValue(S, K, optionType);
    const timeValue = Math.max(0, price - intrinsicValue);

    // Determine moneyness
    const moneyness = getMoneyness(S, K, optionType);

    // Check for low confidence scenarios
    const isLowConfidence = is0DTE(expirationDate) || T < 0.001;

    return {
      price,
      greeks,
      intrinsicValue,
      timeValue,
      moneyness,
      isLowConfidence,
      lowConfidenceReason: isLowConfidence ? '0DTE or near-expiry option' : undefined,
    };
  }

  /**
   * Price option synchronously (uses cached data)
   */
  priceOptionSync(
    symbol: string,
    S: number,
    K: number,
    T: number,
    sigma: number,
    optionType: OptionType,
    style: OptionStyle = OptionStyle.AMERICAN
  ): PricingResult {
    const clampedT = clampTimeToExpiry(T);
    const r = this.getRiskFreeRateSync(clampedT);
    const q = this.getDividendYield(symbol);
    const assetClass = this.getAssetClass(symbol);
    const b = calculateCostOfCarry(r, assetClass, q);

    let price: number;
    if (style === OptionStyle.AMERICAN && this.config.useAmericanPricing) {
      price = priceAmerican(S, K, clampedT, r, b, sigma, optionType);
    } else {
      price = gbsPrice(S, K, clampedT, r, b, sigma, optionType);
    }

    const greeks = calculateAllGreeks(S, K, clampedT, r, b, sigma, optionType);
    const intrinsicValue = calculateIntrinsicValue(S, K, optionType);
    const timeValue = Math.max(0, price - intrinsicValue);
    const moneyness = getMoneyness(S, K, optionType);

    return {
      price,
      greeks,
      intrinsicValue,
      timeValue,
      moneyness,
    };
  }

  /**
   * Calculate Greeks for an option
   */
  async calculateGreeks(
    symbol: string,
    S: number,
    K: number,
    expirationDate: Date,
    sigma: number,
    optionType: OptionType
  ): Promise<Greeks> {
    const T = calculateTimeToExpiry(expirationDate);
    const clampedT = clampTimeToExpiry(T);
    const r = await this.getRiskFreeRate(clampedT);
    const q = this.getDividendYield(symbol);
    const assetClass = this.getAssetClass(symbol);
    const b = calculateCostOfCarry(r, assetClass, q);

    return calculateAllGreeks(S, K, clampedT, r, b, sigma, optionType);
  }

  /**
   * Solve for implied volatility
   */
  async solveIV(
    symbol: string,
    S: number,
    K: number,
    expirationDate: Date,
    marketPrice: number,
    optionType: OptionType,
    style: OptionStyle = OptionStyle.AMERICAN
  ): Promise<IVSolverResult> {
    const T = calculateTimeToExpiry(expirationDate);
    const r = await this.getRiskFreeRate(T);
    const q = this.getDividendYield(symbol);
    const assetClass = this.getAssetClass(symbol);

    return solveImpliedVolatility(S, K, T, r, marketPrice, optionType, assetClass, q, 0, style);
  }

  /**
   * Price entire option chain
   */
  async priceChain(
    symbol: string,
    S: number,
    strikes: number[],
    expirationDate: Date,
    sigmas: number[],
    optionTypes: OptionType[],
    style: OptionStyle = OptionStyle.AMERICAN
  ): Promise<PricingResult[]> {
    const T = calculateTimeToExpiry(expirationDate);
    const clampedT = clampTimeToExpiry(T);
    const r = await this.getRiskFreeRate(clampedT);
    const q = this.getDividendYield(symbol);
    const assetClass = this.getAssetClass(symbol);
    const b = calculateCostOfCarry(r, assetClass, q);

    const results: PricingResult[] = [];

    for (let i = 0; i < strikes.length; i++) {
      const K = strikes[i];
      const sigma = sigmas[i] || sigmas[0];
      const optionType = optionTypes[i] || optionTypes[0];

      let price: number;
      if (style === OptionStyle.AMERICAN && this.config.useAmericanPricing) {
        price = priceAmerican(S, K, clampedT, r, b, sigma, optionType);
      } else {
        price = gbsPrice(S, K, clampedT, r, b, sigma, optionType);
      }

      const greeks = calculateAllGreeks(S, K, clampedT, r, b, sigma, optionType);
      const intrinsicValue = calculateIntrinsicValue(S, K, optionType);
      const timeValue = Math.max(0, price - intrinsicValue);
      const moneyness = getMoneyness(S, K, optionType);

      results.push({
        price,
        greeks,
        intrinsicValue,
        timeValue,
        moneyness,
      });
    }

    return results;
  }

  /**
   * Build volatility surface from market quotes
   */
  async buildVolatilitySurface(
    symbol: string,
    S: number,
    chains: Array<{
      expirationDate: Date;
      strikes: number[];
      bids: number[];
      asks: number[];
      optionTypes: OptionType[];
    }>,
    style: OptionStyle = OptionStyle.AMERICAN
  ): Promise<VolatilitySurface> {
    const points: VolatilitySurfacePoint[] = [];
    let atmIV = 0;
    const q = this.getDividendYield(symbol);
    const assetClass = this.getAssetClass(symbol);

    for (const chain of chains) {
      const T = calculateTimeToExpiry(chain.expirationDate);
      const r = await this.getRiskFreeRate(T);

      for (let i = 0; i < chain.strikes.length; i++) {
        const K = chain.strikes[i];
        const bid = chain.bids[i];
        const ask = chain.asks[i];
        const optionType = chain.optionTypes[i];

        // Validate quote
        const validation = validateQuoteForIV(bid, ask, S, K, optionType);
        if (!validation.valid) continue;

        const mid = calculateMidPrice(bid, ask);
        const ivResult = solveImpliedVolatility(S, K, T, r, mid, optionType, assetClass, q, 0, style);

        if (ivResult.converged && ivResult.iv > 0 && ivResult.iv < 3) {
          const moneyness = Math.log(K / S);
          
          points.push({
            strike: K,
            expiry: T,
            iv: ivResult.iv,
            moneyness,
          });

          // Track ATM IV
          if (Math.abs(K - S) / S < 0.02) {
            atmIV = ivResult.iv;
          }
        }
      }
    }

    // Calculate 25-delta skew (simplified)
    const skew25Delta = this.calculate25DeltaSkew(points, S);

    return {
      symbol,
      spotPrice: S,
      timestamp: new Date(),
      points,
      atmIV,
      skew25Delta,
    };
  }

  private calculate25DeltaSkew(points: VolatilitySurfacePoint[], S: number): number {
    // Simplified: find puts and calls around 25-delta equivalent strikes
    const otmPuts = points.filter(p => p.strike < S * 0.95);
    const otmCalls = points.filter(p => p.strike > S * 1.05);

    if (otmPuts.length === 0 || otmCalls.length === 0) return 0;

    const avgPutIV = otmPuts.reduce((sum, p) => sum + p.iv, 0) / otmPuts.length;
    const avgCallIV = otmCalls.reduce((sum, p) => sum + p.iv, 0) / otmCalls.length;

    return avgPutIV - avgCallIV;
  }

  /**
   * Validate put-call parity
   * C - P = S*e^{(b-r)T} - K*e^{-rT}
   */
  async validateParity(
    symbol: string,
    S: number,
    K: number,
    expirationDate: Date,
    callPrice: number,
    putPrice: number
  ): Promise<{ valid: boolean; deviation: number; expectedDiff: number; actualDiff: number }> {
    const T = calculateTimeToExpiry(expirationDate);
    const r = await this.getRiskFreeRate(T);
    const q = this.getDividendYield(symbol);
    const assetClass = this.getAssetClass(symbol);
    const b = calculateCostOfCarry(r, assetClass, q);

    const forwardFactor = S * Math.exp((b - r) * T);
    const discountFactor = K * Math.exp(-r * T);
    const expectedDiff = forwardFactor - discountFactor;
    const actualDiff = callPrice - putPrice;
    const deviation = Math.abs(actualDiff - expectedDiff);

    // Allow 1% tolerance
    const tolerance = Math.max(0.01 * S, 0.05);
    const valid = deviation < tolerance;

    return { valid, deviation, expectedDiff, actualDiff };
  }

  /**
   * Get early exercise premium for American option
   */
  async getEarlyExercisePremium(
    symbol: string,
    S: number,
    K: number,
    expirationDate: Date,
    sigma: number,
    optionType: OptionType
  ): Promise<number> {
    const T = calculateTimeToExpiry(expirationDate);
    const r = await this.getRiskFreeRate(T);
    const q = this.getDividendYield(symbol);
    const assetClass = this.getAssetClass(symbol);
    const b = calculateCostOfCarry(r, assetClass, q);

    return calculateEarlyExercisePremium(S, K, T, r, b, sigma, optionType);
  }

  /**
   * Get dollar-value Greeks
   */
  async getDollarGreeks(
    symbol: string,
    S: number,
    K: number,
    expirationDate: Date,
    sigma: number,
    optionType: OptionType,
    multiplier: number = 100
  ): Promise<Greeks> {
    const greeks = await this.calculateGreeks(symbol, S, K, expirationDate, sigma, optionType);
    return calculateDollarGreeks(greeks, S, multiplier);
  }
}

// Export singleton instance
export const pricingEngine = new PricingEngine();

// Re-export types and utilities
export * from './types';
export { calculateCostOfCarry, getMoneyness } from './gbs';
export { calculateTimeToExpiry, is0DTE } from './time-utils';
