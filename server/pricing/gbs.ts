/**
 * Fincai Autonomous Pricing Engine - Generalized Black-Scholes (GBS)
 * 
 * Implements the Generalized Black-Scholes framework with cost-of-carry
 * parameter (b) for pricing European options across multiple asset classes:
 * 
 * - Stock Options: b = r (standard Black-Scholes-Merton)
 * - Index Options: b = r - q (Merton 1973 with dividend yield)
 * - Futures Options: b = 0 (Black-76)
 * - FX Options: b = r_d - r_f (Garman-Kohlhagen)
 * 
 * License: MIT (Original optlib by Davis Edwards / Daniel Rojas)
 */

import { normalCDF, normalPDF, safeLn } from './math-utils';
import { clampTimeToExpiry, requiresIntrinsicOnly } from './time-utils';
import {
  PricingInput,
  AssetClass,
  OptionType,
  MIN_TIME_TO_EXPIRY,
} from './types';

/**
 * Calculate cost-of-carry (b) based on asset class
 */
export function calculateCostOfCarry(
  r: number,
  assetClass: AssetClass = AssetClass.STOCK,
  q: number = 0,
  rf: number = 0
): number {
  switch (assetClass) {
    case AssetClass.STOCK:
      return r; // Standard BSM (non-dividend paying)
    case AssetClass.INDEX:
      return r - q; // Merton model with continuous dividend yield
    case AssetClass.FUTURES:
      return 0; // Black-76
    case AssetClass.FX:
      return r - rf; // Garman-Kohlhagen (domestic - foreign rate)
    default:
      return r;
  }
}

/**
 * Calculate d1 parameter for Black-Scholes
 */
export function calculateD1(
  S: number,
  K: number,
  T: number,
  b: number,
  sigma: number
): number {
  const clampedT = clampTimeToExpiry(T);
  const sqrtT = Math.sqrt(clampedT);
  
  if (sqrtT === 0 || sigma === 0) {
    return S > K ? Infinity : S < K ? -Infinity : 0;
  }
  
  return (safeLn(S / K) + (b + 0.5 * sigma * sigma) * clampedT) / (sigma * sqrtT);
}

/**
 * Calculate d2 parameter for Black-Scholes
 */
export function calculateD2(
  S: number,
  K: number,
  T: number,
  b: number,
  sigma: number
): number {
  const clampedT = clampTimeToExpiry(T);
  return calculateD1(S, K, clampedT, b, sigma) - sigma * Math.sqrt(clampedT);
}

/**
 * Calculate intrinsic value of an option
 */
export function calculateIntrinsicValue(
  S: number,
  K: number,
  optionType: OptionType
): number {
  if (optionType === 'call') {
    return Math.max(0, S - K);
  } else {
    return Math.max(0, K - S);
  }
}

/**
 * Generalized Black-Scholes European option pricing
 * 
 * @param S - Spot price of underlying
 * @param K - Strike price
 * @param T - Time to expiry in years
 * @param r - Risk-free rate
 * @param b - Cost of carry
 * @param sigma - Volatility (annualized)
 * @param optionType - 'call' or 'put'
 * @returns Option price
 */
export function gbsPrice(
  S: number,
  K: number,
  T: number,
  r: number,
  b: number,
  sigma: number,
  optionType: OptionType
): number {
  // Handle edge cases
  if (S <= 0 || K <= 0 || sigma <= 0) {
    return calculateIntrinsicValue(S, K, optionType);
  }
  
  // For near-expiry options, use intrinsic value
  if (requiresIntrinsicOnly(T)) {
    return calculateIntrinsicValue(S, K, optionType);
  }
  
  const clampedT = clampTimeToExpiry(T);
  const d1 = calculateD1(S, K, clampedT, b, sigma);
  const d2 = d1 - sigma * Math.sqrt(clampedT);
  
  const discountFactor = Math.exp(-r * clampedT);
  const forwardFactor = Math.exp((b - r) * clampedT);
  
  if (optionType === 'call') {
    return S * forwardFactor * normalCDF(d1) - K * discountFactor * normalCDF(d2);
  } else {
    return K * discountFactor * normalCDF(-d2) - S * forwardFactor * normalCDF(-d1);
  }
}

/**
 * Price European option using input object
 */
export function priceEuropean(input: PricingInput): number {
  const { S, K, T, r, sigma, optionType, assetClass = AssetClass.STOCK, q = 0, rf = 0 } = input;
  
  const b = input.b !== undefined 
    ? input.b 
    : calculateCostOfCarry(r, assetClass, q, rf);
  
  return gbsPrice(S, K, T, r, b, sigma, optionType);
}

/**
 * Vectorized GBS pricing for option chains
 * Prices multiple strikes simultaneously for efficiency
 */
export function vectorizedGbsPrice(
  S: number,
  strikes: number[],
  T: number,
  r: number,
  b: number,
  sigmas: number[],
  optionTypes: OptionType[]
): number[] {
  const clampedT = clampTimeToExpiry(T);
  const results: number[] = [];
  
  for (let i = 0; i < strikes.length; i++) {
    const K = strikes[i];
    const sigma = sigmas[i] || sigmas[0];
    const optionType = optionTypes[i] || optionTypes[0];
    
    results.push(gbsPrice(S, K, clampedT, r, b, sigma, optionType));
  }
  
  return results;
}

/**
 * Batch price entire option chain
 */
export interface ChainPricingInput {
  S: number;
  strikes: number[];
  T: number;
  r: number;
  assetClass: AssetClass;
  q?: number;
  rf?: number;
  sigmas: number[];
  optionTypes: OptionType[];
}

export function priceOptionChain(input: ChainPricingInput): number[] {
  const { S, strikes, T, r, assetClass, q = 0, rf = 0, sigmas, optionTypes } = input;
  const b = calculateCostOfCarry(r, assetClass, q, rf);
  
  return vectorizedGbsPrice(S, strikes, T, r, b, sigmas, optionTypes);
}

/**
 * Calculate the forward price of the underlying
 */
export function calculateForwardPrice(
  S: number,
  T: number,
  b: number,
  r: number
): number {
  return S * Math.exp((b - r) * T) * Math.exp(r * T);
}

/**
 * Determine moneyness of an option
 */
export function getMoneyness(
  S: number,
  K: number,
  optionType: OptionType
): 'ITM' | 'ATM' | 'OTM' {
  const atmTolerance = 0.02; // 2% tolerance for ATM
  const ratio = S / K;
  
  if (Math.abs(ratio - 1) <= atmTolerance) {
    return 'ATM';
  }
  
  if (optionType === 'call') {
    return S > K ? 'ITM' : 'OTM';
  } else {
    return S < K ? 'ITM' : 'OTM';
  }
}

/**
 * Calculate log moneyness (used for volatility surfaces)
 */
export function calculateLogMoneyness(S: number, K: number): number {
  return safeLn(K / S);
}

/**
 * Calculate delta-based moneyness (normalized by sigma*sqrt(T))
 */
export function calculateDeltaMoneyness(
  S: number,
  K: number,
  T: number,
  sigma: number
): number {
  const clampedT = clampTimeToExpiry(T);
  return safeLn(K / S) / (sigma * Math.sqrt(clampedT));
}
