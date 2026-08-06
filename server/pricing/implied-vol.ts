/**
 * Fincai Autonomous Pricing Engine - Implied Volatility Solver
 * 
 * Implements numerical methods to solve the "inverse problem":
 * Given a market price, find the volatility that produces that price.
 * 
 * Methods:
 * 1. Newton-Raphson (primary) - Quadratic convergence using Vega
 * 2. Brent's Method (fallback) - Robust for edge cases
 * 3. Bisection (last resort) - Guaranteed convergence
 * 
 * License: MIT (Original optlib by Davis Edwards / Daniel Rojas)
 */

import { gbsPrice, calculateCostOfCarry, calculateIntrinsicValue } from './gbs';
import { priceAmerican } from './american-bjerksund';
import { calculateVega } from './greeks';
import { clampTimeToExpiry } from './time-utils';
import {
  IVSolverResult,
  OptionType,
  AssetClass,
  OptionStyle,
  MAX_IV_ITERATIONS,
  IV_TOLERANCE,
} from './types';

const MIN_IV = 0.001;   // 0.1%
const MAX_IV = 5.0;     // 500%
const VEGA_FLOOR = 1e-10;

interface IVSolverInput {
  S: number;           // Spot price
  K: number;           // Strike price
  T: number;           // Time to expiry
  r: number;           // Risk-free rate
  b: number;           // Cost of carry
  marketPrice: number; // Target market price
  optionType: OptionType;
  style?: OptionStyle;
}

/**
 * Newton-Raphson IV solver
 * Uses Vega as the derivative for fast quadratic convergence
 */
function newtonRaphsonIV(input: IVSolverInput): IVSolverResult {
  const { S, K, T, r, b, marketPrice, optionType, style = OptionStyle.EUROPEAN } = input;
  
  const clampedT = clampTimeToExpiry(T);
  const intrinsic = calculateIntrinsicValue(S, K, optionType);
  
  // Check if market price is below intrinsic (invalid)
  if (marketPrice < intrinsic - 0.001) {
    return {
      iv: 0,
      converged: false,
      iterations: 0,
      method: 'newton-raphson',
      error: 'Market price below intrinsic value',
    };
  }
  
  // Improved initial guess using Brenner-Subrahmanyam approximation
  // For deep ITM options, use time value instead of market price for better convergence
  const timeValue = Math.max(0.01, marketPrice - intrinsic);
  let sigma = Math.sqrt(2 * Math.PI / clampedT) * (timeValue / S);
  
  // If initial guess is too low or invalid, use fallback
  if (!Number.isFinite(sigma) || sigma < MIN_IV) {
    sigma = 0.3; // Reasonable default
  }
  sigma = Math.max(MIN_IV, Math.min(MAX_IV, sigma));
  
  for (let i = 0; i < MAX_IV_ITERATIONS; i++) {
    // Calculate model price
    let modelPrice: number;
    if (style === OptionStyle.AMERICAN) {
      modelPrice = priceAmerican(S, K, clampedT, r, b, sigma, optionType);
    } else {
      modelPrice = gbsPrice(S, K, clampedT, r, b, sigma, optionType);
    }
    
    const priceDiff = modelPrice - marketPrice;
    
    // Check convergence
    if (Math.abs(priceDiff) < IV_TOLERANCE) {
      return {
        iv: sigma,
        converged: true,
        iterations: i + 1,
        method: 'newton-raphson',
      };
    }
    
    // Calculate Vega (derivative with respect to sigma)
    const vega = calculateVega(S, K, clampedT, r, b, sigma) * 100; // Raw vega
    
    // Check for near-zero Vega (deep OTM or near expiry)
    if (Math.abs(vega) < VEGA_FLOOR) {
      // Fall back to Brent's method
      return brentIV(input);
    }
    
    // Newton-Raphson update
    const sigmaNew = sigma - priceDiff / vega;
    
    // Clamp to valid range
    sigma = Math.max(MIN_IV, Math.min(MAX_IV, sigmaNew));
    
    // Check for oscillation
    if (Math.abs(sigmaNew - sigma) < IV_TOLERANCE) {
      return {
        iv: sigma,
        converged: true,
        iterations: i + 1,
        method: 'newton-raphson',
      };
    }
  }
  
  // Failed to converge, try Brent's method
  return brentIV(input);
}

/**
 * Brent's Method IV solver
 * More robust for edge cases where Newton-Raphson struggles
 */
function brentIV(input: IVSolverInput): IVSolverResult {
  const { S, K, T, r, b, marketPrice, optionType, style = OptionStyle.EUROPEAN } = input;
  
  const clampedT = clampTimeToExpiry(T);
  
  const priceFn = (sigma: number): number => {
    if (style === OptionStyle.AMERICAN) {
      return priceAmerican(S, K, clampedT, r, b, sigma, optionType) - marketPrice;
    }
    return gbsPrice(S, K, clampedT, r, b, sigma, optionType) - marketPrice;
  };
  
  let a = MIN_IV;
  let b_bound = MAX_IV;
  let fa = priceFn(a);
  let fb = priceFn(b_bound);
  
  // Check if root is bracketed
  if (fa * fb > 0) {
    // Try bisection as last resort
    return bisectionIV(input);
  }
  
  // Ensure |f(a)| <= |f(b)|
  if (Math.abs(fa) < Math.abs(fb)) {
    [a, b_bound] = [b_bound, a];
    [fa, fb] = [fb, fa];
  }
  
  let c = a;
  let fc = fa;
  let d = b_bound - a;
  let e = d;
  
  for (let i = 0; i < MAX_IV_ITERATIONS; i++) {
    if (Math.abs(fa) < Math.abs(fb)) {
      [a, b_bound, c] = [b_bound, a, b_bound];
      [fa, fb, fc] = [fb, fa, fb];
    }
    
    const tol = 2 * IV_TOLERANCE * Math.abs(b_bound) + 0.5 * IV_TOLERANCE;
    const m = 0.5 * (c - b_bound);
    
    if (Math.abs(m) <= tol || fb === 0) {
      return {
        iv: b_bound,
        converged: true,
        iterations: i + 1,
        method: 'brent',
      };
    }
    
    let p: number, q: number, r_val: number, s: number;
    
    if (Math.abs(e) >= tol && Math.abs(fa) > Math.abs(fb)) {
      s = fb / fa;
      
      if (a === c) {
        p = 2 * m * s;
        q = 1 - s;
      } else {
        q = fa / fc;
        r_val = fb / fc;
        p = s * (2 * m * q * (q - r_val) - (b_bound - a) * (r_val - 1));
        q = (q - 1) * (r_val - 1) * (s - 1);
      }
      
      if (p > 0) {
        q = -q;
      } else {
        p = -p;
      }
      
      if (2 * p < Math.min(3 * m * q - Math.abs(tol * q), Math.abs(e * q))) {
        e = d;
        d = p / q;
      } else {
        d = m;
        e = d;
      }
    } else {
      d = m;
      e = d;
    }
    
    a = b_bound;
    fa = fb;
    
    if (Math.abs(d) > tol) {
      b_bound += d;
    } else {
      b_bound += m > 0 ? tol : -tol;
    }
    
    fb = priceFn(b_bound);
    
    if ((fb > 0 && fc > 0) || (fb < 0 && fc < 0)) {
      c = a;
      fc = fa;
      e = d = b_bound - a;
    }
  }
  
  return {
    iv: b_bound,
    converged: false,
    iterations: MAX_IV_ITERATIONS,
    method: 'brent',
    error: 'Maximum iterations reached',
  };
}

/**
 * Bisection Method IV solver
 * Guaranteed convergence but slower
 */
function bisectionIV(input: IVSolverInput): IVSolverResult {
  const { S, K, T, r, b, marketPrice, optionType, style = OptionStyle.EUROPEAN } = input;
  
  const clampedT = clampTimeToExpiry(T);
  
  const priceFn = (sigma: number): number => {
    if (style === OptionStyle.AMERICAN) {
      return priceAmerican(S, K, clampedT, r, b, sigma, optionType) - marketPrice;
    }
    return gbsPrice(S, K, clampedT, r, b, sigma, optionType) - marketPrice;
  };
  
  let low = MIN_IV;
  let high = MAX_IV;
  
  // Find valid bracket
  let fLow = priceFn(low);
  let fHigh = priceFn(high);
  
  // If same sign, no root in interval
  if (fLow * fHigh > 0) {
    // Return best guess
    return {
      iv: Math.abs(fLow) < Math.abs(fHigh) ? low : high,
      converged: false,
      iterations: 0,
      method: 'bisection',
      error: 'No root in valid IV range',
    };
  }
  
  for (let i = 0; i < MAX_IV_ITERATIONS; i++) {
    const mid = (low + high) / 2;
    const fMid = priceFn(mid);
    
    if (Math.abs(fMid) < IV_TOLERANCE || (high - low) / 2 < IV_TOLERANCE) {
      return {
        iv: mid,
        converged: true,
        iterations: i + 1,
        method: 'bisection',
      };
    }
    
    if (fMid * fLow < 0) {
      high = mid;
      fHigh = fMid;
    } else {
      low = mid;
      fLow = fMid;
    }
  }
  
  return {
    iv: (low + high) / 2,
    converged: false,
    iterations: MAX_IV_ITERATIONS,
    method: 'bisection',
    error: 'Maximum iterations reached',
  };
}

/**
 * Main IV solver function
 * Uses Newton-Raphson with automatic fallback
 */
export function solveImpliedVolatility(
  S: number,
  K: number,
  T: number,
  r: number,
  marketPrice: number,
  optionType: OptionType,
  assetClass: AssetClass = AssetClass.STOCK,
  q: number = 0,
  rf: number = 0,
  style: OptionStyle = OptionStyle.EUROPEAN
): IVSolverResult {
  // Validate inputs
  if (S <= 0 || K <= 0 || marketPrice <= 0) {
    return {
      iv: 0,
      converged: false,
      iterations: 0,
      method: 'newton-raphson',
      error: 'Invalid input: prices must be positive',
    };
  }
  
  const b = calculateCostOfCarry(r, assetClass, q, rf);
  
  const input: IVSolverInput = {
    S,
    K,
    T,
    r,
    b,
    marketPrice,
    optionType,
    style,
  };
  
  return newtonRaphsonIV(input);
}

/**
 * Calculate mid-price from bid/ask
 */
export function calculateMidPrice(bid: number, ask: number): number {
  if (bid <= 0 || ask <= 0) {
    return 0;
  }
  return (bid + ask) / 2;
}

/**
 * Validate quote for IV calculation
 */
export interface QuoteValidation {
  valid: boolean;
  reason?: string;
}

export function validateQuoteForIV(
  bid: number,
  ask: number,
  S: number,
  K: number,
  optionType: OptionType,
  maxSpreadPct: number = 0.5  // 50% max spread
): QuoteValidation {
  if (bid <= 0) {
    return { valid: false, reason: 'Bid must be positive' };
  }
  
  if (ask <= bid) {
    return { valid: false, reason: 'Ask must be greater than bid' };
  }
  
  const spread = (ask - bid) / bid;
  if (spread > maxSpreadPct) {
    return { valid: false, reason: `Spread too wide: ${(spread * 100).toFixed(1)}%` };
  }
  
  const mid = calculateMidPrice(bid, ask);
  const intrinsic = calculateIntrinsicValue(S, K, optionType);
  
  if (mid < intrinsic * 0.99) {  // Allow 1% tolerance
    return { valid: false, reason: 'Mid price below intrinsic value' };
  }
  
  return { valid: true };
}

/**
 * Batch solve IV for option chain
 */
export interface ChainIVInput {
  S: number;
  strikes: number[];
  T: number;
  r: number;
  assetClass: AssetClass;
  q?: number;
  bids: number[];
  asks: number[];
  optionTypes: OptionType[];
  style?: OptionStyle;
}

export function solveChainIV(input: ChainIVInput): IVSolverResult[] {
  const { S, strikes, T, r, assetClass, q = 0, bids, asks, optionTypes, style = OptionStyle.EUROPEAN } = input;
  
  const results: IVSolverResult[] = [];
  
  for (let i = 0; i < strikes.length; i++) {
    const K = strikes[i];
    const bid = bids[i];
    const ask = asks[i];
    const optionType = optionTypes[i];
    
    // Validate quote
    const validation = validateQuoteForIV(bid, ask, S, K, optionType);
    if (!validation.valid) {
      results.push({
        iv: 0,
        converged: false,
        iterations: 0,
        method: 'newton-raphson',
        error: validation.reason,
      });
      continue;
    }
    
    const mid = calculateMidPrice(bid, ask);
    results.push(solveImpliedVolatility(S, K, T, r, mid, optionType, assetClass, q, 0, style));
  }
  
  return results;
}
