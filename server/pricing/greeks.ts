/**
 * Fincai Autonomous Pricing Engine - Greeks Calculator
 * 
 * Implements sensitivity metrics (Greeks) using the Generalized Black-Scholes
 * framework with cost-of-carry adjustments for all asset classes.
 * 
 * Greeks calculated:
 * - Delta: ∂V/∂S (price sensitivity to underlying)
 * - Gamma: ∂²V/∂S² (delta sensitivity to underlying)
 * - Theta: ∂V/∂T (time decay, daily)
 * - Vega: ∂V/∂σ (sensitivity to volatility, per 1%)
 * - Rho: ∂V/∂r (sensitivity to rates, per 1%)
 * 
 * License: MIT (Original optlib by Davis Edwards / Daniel Rojas)
 */

import { normalCDF, normalPDF } from './math-utils';
import { clampTimeToExpiry } from './time-utils';
import { calculateD1, calculateD2, calculateCostOfCarry } from './gbs';
import {
  PricingInput,
  Greeks,
  AssetClass,
  OptionType,
  CALENDAR_DAYS_PER_YEAR,
} from './types';

/**
 * Calculate Delta with cost-of-carry adjustment
 * Delta measures hedge ratio: shares needed to hedge 1 option
 */
export function calculateDelta(
  S: number,
  K: number,
  T: number,
  r: number,
  b: number,
  sigma: number,
  optionType: OptionType
): number {
  if (T <= 0) {
    // At expiry, delta is 1 or 0 for calls, -1 or 0 for puts
    if (optionType === 'call') {
      return S > K ? 1 : 0;
    } else {
      return S < K ? -1 : 0;
    }
  }
  
  const clampedT = clampTimeToExpiry(T);
  const d1 = calculateD1(S, K, clampedT, b, sigma);
  
  // Adjust for cost-of-carry
  const carryFactor = Math.exp((b - r) * clampedT);
  
  if (optionType === 'call') {
    return carryFactor * normalCDF(d1);
  } else {
    return carryFactor * (normalCDF(d1) - 1);
  }
}

/**
 * Calculate Gamma (same for calls and puts)
 * Gamma measures convexity/acceleration of position
 */
export function calculateGamma(
  S: number,
  K: number,
  T: number,
  r: number,
  b: number,
  sigma: number
): number {
  if (T <= 0 || S <= 0 || sigma <= 0) {
    return 0;
  }
  
  const clampedT = clampTimeToExpiry(T);
  const d1 = calculateD1(S, K, clampedT, b, sigma);
  const sqrtT = Math.sqrt(clampedT);
  
  const carryFactor = Math.exp((b - r) * clampedT);
  
  return (carryFactor * normalPDF(d1)) / (S * sigma * sqrtT);
}

/**
 * Calculate Theta (time decay)
 * Returns DAILY theta (annualized / 365.25)
 */
export function calculateTheta(
  S: number,
  K: number,
  T: number,
  r: number,
  b: number,
  sigma: number,
  optionType: OptionType
): number {
  if (T <= 0) {
    return 0;
  }
  
  const clampedT = clampTimeToExpiry(T);
  const d1 = calculateD1(S, K, clampedT, b, sigma);
  const d2 = calculateD2(S, K, clampedT, b, sigma);
  const sqrtT = Math.sqrt(clampedT);
  
  const carryFactor = Math.exp((b - r) * clampedT);
  const discountFactor = Math.exp(-r * clampedT);
  
  // First term: time value decay
  const term1 = -(S * carryFactor * normalPDF(d1) * sigma) / (2 * sqrtT);
  
  // Second term: cost-of-carry adjustment
  const term2 = -(b - r) * S * carryFactor;
  
  let theta: number;
  
  if (optionType === 'call') {
    const term2Adj = term2 * normalCDF(d1);
    const term3 = -r * K * discountFactor * normalCDF(d2);
    theta = term1 + term2Adj + term3;
  } else {
    const term2Adj = term2 * normalCDF(-d1);
    const term3 = r * K * discountFactor * normalCDF(-d2);
    theta = term1 - term2Adj + term3;
  }
  
  // Convert to daily theta
  return theta / CALENDAR_DAYS_PER_YEAR;
}

/**
 * Calculate Vega (volatility sensitivity)
 * Returns per 1% IV change (multiply by 0.01)
 */
export function calculateVega(
  S: number,
  K: number,
  T: number,
  r: number,
  b: number,
  sigma: number
): number {
  if (T <= 0 || S <= 0) {
    return 0;
  }
  
  const clampedT = clampTimeToExpiry(T);
  const d1 = calculateD1(S, K, clampedT, b, sigma);
  const sqrtT = Math.sqrt(clampedT);
  
  const carryFactor = Math.exp((b - r) * clampedT);
  
  // Raw vega (per 100% IV change)
  const rawVega = S * carryFactor * normalPDF(d1) * sqrtT;
  
  // Return per 1% change
  return rawVega / 100;
}

/**
 * Calculate Rho (interest rate sensitivity)
 * Returns per 1% rate change
 */
export function calculateRho(
  S: number,
  K: number,
  T: number,
  r: number,
  b: number,
  sigma: number,
  optionType: OptionType
): number {
  if (T <= 0) {
    return 0;
  }
  
  const clampedT = clampTimeToExpiry(T);
  const d2 = calculateD2(S, K, clampedT, b, sigma);
  const discountFactor = Math.exp(-r * clampedT);
  
  let rho: number;
  
  if (optionType === 'call') {
    rho = K * clampedT * discountFactor * normalCDF(d2);
  } else {
    rho = -K * clampedT * discountFactor * normalCDF(-d2);
  }
  
  // Return per 1% change
  return rho / 100;
}

/**
 * Calculate all Greeks at once (more efficient)
 */
export function calculateAllGreeks(
  S: number,
  K: number,
  T: number,
  r: number,
  b: number,
  sigma: number,
  optionType: OptionType
): Greeks {
  // Handle edge cases
  if (T <= 0) {
    return {
      delta: optionType === 'call' ? (S > K ? 1 : 0) : (S < K ? -1 : 0),
      gamma: 0,
      theta: 0,
      vega: 0,
      rho: 0,
    };
  }
  
  if (S <= 0 || sigma <= 0) {
    return { delta: 0, gamma: 0, theta: 0, vega: 0, rho: 0 };
  }
  
  const clampedT = clampTimeToExpiry(T);
  const d1 = calculateD1(S, K, clampedT, b, sigma);
  const d2 = d1 - sigma * Math.sqrt(clampedT);
  const sqrtT = Math.sqrt(clampedT);
  
  const carryFactor = Math.exp((b - r) * clampedT);
  const discountFactor = Math.exp(-r * clampedT);
  const nd1 = normalCDF(d1);
  const nd2 = normalCDF(d2);
  const pdfD1 = normalPDF(d1);
  
  // Delta
  let delta: number;
  if (optionType === 'call') {
    delta = carryFactor * nd1;
  } else {
    delta = carryFactor * (nd1 - 1);
  }
  
  // Gamma (same for calls and puts)
  const gamma = (carryFactor * pdfD1) / (S * sigma * sqrtT);
  
  // Vega (same for calls and puts, per 1%)
  const vega = (S * carryFactor * pdfD1 * sqrtT) / 100;
  
  // Theta (daily)
  const term1 = -(S * carryFactor * pdfD1 * sigma) / (2 * sqrtT);
  const term2 = -(b - r) * S * carryFactor;
  let theta: number;
  
  if (optionType === 'call') {
    const term2Adj = term2 * nd1;
    const term3 = -r * K * discountFactor * nd2;
    theta = (term1 + term2Adj + term3) / CALENDAR_DAYS_PER_YEAR;
  } else {
    const term2Adj = term2 * normalCDF(-d1);
    const term3 = r * K * discountFactor * normalCDF(-d2);
    theta = (term1 - term2Adj + term3) / CALENDAR_DAYS_PER_YEAR;
  }
  
  // Rho (per 1%)
  let rho: number;
  if (optionType === 'call') {
    rho = (K * clampedT * discountFactor * nd2) / 100;
  } else {
    rho = (-K * clampedT * discountFactor * normalCDF(-d2)) / 100;
  }
  
  return { delta, gamma, theta, vega, rho };
}

/**
 * Calculate Greeks using input object
 */
export function calculateGreeksFromInput(input: PricingInput): Greeks {
  const { S, K, T, r, sigma, optionType, assetClass = AssetClass.STOCK, q = 0, rf = 0 } = input;
  
  const b = input.b !== undefined 
    ? input.b 
    : calculateCostOfCarry(r, assetClass, q, rf);
  
  return calculateAllGreeks(S, K, T, r, b, sigma, optionType);
}

/**
 * Vectorized Greeks calculation for option chains
 */
export function vectorizedGreeks(
  S: number,
  strikes: number[],
  T: number,
  r: number,
  b: number,
  sigmas: number[],
  optionTypes: OptionType[]
): Greeks[] {
  return strikes.map((K, i) => {
    const sigma = sigmas[i] || sigmas[0];
    const optionType = optionTypes[i] || optionTypes[0];
    return calculateAllGreeks(S, K, T, r, b, sigma, optionType);
  });
}

/**
 * Calculate portfolio-level Greeks
 */
export interface PositionGreeks {
  greeks: Greeks;
  quantity: number;  // Positive for long, negative for short
  multiplier: number;  // Contract multiplier (typically 100 for equity options)
}

export function calculatePortfolioGreeks(positions: PositionGreeks[]): Greeks {
  const portfolio: Greeks = {
    delta: 0,
    gamma: 0,
    theta: 0,
    vega: 0,
    rho: 0,
  };
  
  for (const position of positions) {
    const scale = position.quantity * position.multiplier;
    portfolio.delta += position.greeks.delta * scale;
    portfolio.gamma += position.greeks.gamma * scale;
    portfolio.theta += position.greeks.theta * scale;
    portfolio.vega += position.greeks.vega * scale;
    portfolio.rho += position.greeks.rho * scale;
  }
  
  return portfolio;
}

/**
 * Calculate dollar Greeks (Greeks * spot price for notional exposure)
 */
export function calculateDollarGreeks(greeks: Greeks, spotPrice: number, multiplier: number = 100): Greeks {
  return {
    delta: greeks.delta * spotPrice * multiplier,
    gamma: greeks.gamma * spotPrice * spotPrice * multiplier / 100,  // Per 1% move
    theta: greeks.theta * multiplier,
    vega: greeks.vega * multiplier,
    rho: greeks.rho * multiplier,
  };
}
