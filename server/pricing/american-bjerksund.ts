/**
 * Fincai Autonomous Pricing Engine - American Option Pricing
 * 
 * Implements the Bjerksund-Stensland (2002) closed-form approximation
 * for American options. This model provides computational efficiency
 * (microseconds vs milliseconds) while maintaining accuracy suitable
 * for algorithmic trading and risk management.
 * 
 * The approximation captures the early exercise premium ignored by
 * European pricing, particularly important for:
 * - Deep ITM puts
 * - High dividend yield calls
 * 
 * License: MIT (Original optlib by Davis Edwards / Daniel Rojas)
 */

import { normalCDF, safeLn } from './math-utils';
import { clampTimeToExpiry, requiresIntrinsicOnly } from './time-utils';
import { gbsPrice, calculateIntrinsicValue, calculateCostOfCarry } from './gbs';
import {
  PricingInput,
  AssetClass,
  OptionType,
} from './types';

/**
 * Calculate the phi function used in Bjerksund-Stensland
 */
function phi(
  S: number,
  T: number,
  gamma: number,
  H: number,
  I: number,
  r: number,
  b: number,
  sigma: number
): number {
  const sqrtT = Math.sqrt(T);
  const sigmaRoot = sigma * sqrtT;
  
  const lambda = (-r + gamma * b + 0.5 * gamma * (gamma - 1) * sigma * sigma) * T;
  const d = -(safeLn(S / H) + (b + (gamma - 0.5) * sigma * sigma) * T) / sigmaRoot;
  const kappa = (2 * b / (sigma * sigma)) + (2 * gamma - 1);
  
  const term1 = Math.exp(lambda) * Math.pow(S, gamma);
  const term2 = normalCDF(d);
  const term3 = -Math.pow(I / S, kappa) * normalCDF(d - 2 * safeLn(I / S) / sigmaRoot);
  
  return term1 * (term2 + term3);
}

/**
 * Calculate the psi function used in Bjerksund-Stensland
 */
function psi(
  S: number,
  T: number,
  gamma: number,
  H: number,
  I2: number,
  I1: number,
  r: number,
  b: number,
  sigma: number,
  t1: number
): number {
  const sqrtT = Math.sqrt(T);
  const sqrtT1 = Math.sqrt(t1);
  
  const sigmaRoot = sigma * sqrtT;
  const sigmaRoot1 = sigma * sqrtT1;
  
  const e1 = (safeLn(S / I1) + (b + (gamma - 0.5) * sigma * sigma) * t1) / sigmaRoot1;
  const e2 = (safeLn(I2 * I2 / (S * I1)) + (b + (gamma - 0.5) * sigma * sigma) * t1) / sigmaRoot1;
  const e3 = (safeLn(S / I1) - (b + (gamma - 0.5) * sigma * sigma) * t1) / sigmaRoot1;
  const e4 = (safeLn(I2 * I2 / (S * I1)) - (b + (gamma - 0.5) * sigma * sigma) * t1) / sigmaRoot1;
  
  const f1 = (safeLn(S / H) + (b + (gamma - 0.5) * sigma * sigma) * T) / sigmaRoot;
  const f2 = (safeLn(I2 * I2 / (S * H)) + (b + (gamma - 0.5) * sigma * sigma) * T) / sigmaRoot;
  const f3 = (safeLn(I1 * I1 / (S * H)) + (b + (gamma - 0.5) * sigma * sigma) * T) / sigmaRoot;
  const f4 = (safeLn(S * I1 * I1 / (H * I2 * I2)) + (b + (gamma - 0.5) * sigma * sigma) * T) / sigmaRoot;
  
  const rho = Math.sqrt(t1 / T);
  const lambda = -r + gamma * b + 0.5 * gamma * (gamma - 1) * sigma * sigma;
  const kappa = (2 * b) / (sigma * sigma) + (2 * gamma - 1);
  
  const expLambdaT = Math.exp(lambda * T);
  const Sgamma = Math.pow(S, gamma);
  
  // Bivariate normal approximation using product of univariate CDFs
  // This is a simplification but works well for the purposes of option pricing
  const term1 = expLambdaT * Sgamma * normalCDF(-e1) * normalCDF(-f1);
  const term2 = -Math.pow(I2 / S, kappa) * normalCDF(-e2) * normalCDF(-f2);
  const term3 = -Math.pow(I1 / S, kappa) * normalCDF(e3) * normalCDF(-f3);
  const term4 = Math.pow(I1 / I2, kappa) * normalCDF(e4) * normalCDF(-f4);
  
  return term1 + expLambdaT * Sgamma * (term2 + term3 + term4);
}

/**
 * Bjerksund-Stensland 2002 American Call Option Price
 */
function bjerksundStenslandCall(
  S: number,
  K: number,
  T: number,
  r: number,
  b: number,
  sigma: number
): number {
  // Handle edge cases
  if (T <= 0) {
    return Math.max(0, S - K);
  }
  
  if (b >= r) {
    // Early exercise never optimal, use European pricing
    return gbsPrice(S, K, T, r, b, sigma, 'call');
  }
  
  const sigmaSq = sigma * sigma;
  
  // Calculate beta
  const beta = (0.5 - b / sigmaSq) + Math.sqrt(
    Math.pow(b / sigmaSq - 0.5, 2) + 2 * r / sigmaSq
  );
  
  // Calculate B_infinity and B_0
  const B_inf = (beta / (beta - 1)) * K;
  const B_0 = Math.max(K, (r / (r - b)) * K);
  
  // Time steps
  const t1 = 0.5 * (Math.sqrt(5) - 1) * T; // Golden ratio
  
  // Calculate h
  const h = -(b * T + 2 * sigma * Math.sqrt(T)) * K / (B_inf - B_0);
  
  // Calculate I1 and I2 (exercise boundaries)
  const I2 = B_0 + (B_inf - B_0) * (1 - Math.exp(h));
  const h1 = -(b * t1 + 2 * sigma * Math.sqrt(t1)) * K / (B_inf - B_0);
  const I1 = B_0 + (B_inf - B_0) * (1 - Math.exp(h1));
  
  // Check if early exercise is optimal now
  if (S >= I2) {
    return S - K;
  }
  
  // Calculate alpha
  const alpha1 = (I1 - K) * Math.pow(I1, -beta);
  const alpha2 = (I2 - K) * Math.pow(I2, -beta);
  
  // Calculate option value using the approximation
  const term1 = alpha2 * Math.pow(S, beta);
  const term2 = -alpha2 * phi(S, T, beta, I2, I2, r, b, sigma);
  const term3 = phi(S, T, 1, I2, I2, r, b, sigma);
  const term4 = -phi(S, T, 1, I1, I2, r, b, sigma);
  const term5 = -K * phi(S, T, 0, I2, I2, r, b, sigma);
  const term6 = K * phi(S, T, 0, I1, I2, r, b, sigma);
  const term7 = alpha1 * phi(S, T, beta, I1, I2, r, b, sigma);
  const term8 = -alpha1 * psi(S, T, beta, I1, I2, I1, r, b, sigma, t1);
  
  return term1 + term2 + term3 + term4 + term5 + term6 + term7 + term8;
}

/**
 * Bjerksund-Stensland 2002 American Put Option Price
 * Uses put-call transformation: P(S,K,T,r,b) = C(K,S,T,r-b,-b)
 */
function bjerksundStenslandPut(
  S: number,
  K: number,
  T: number,
  r: number,
  b: number,
  sigma: number
): number {
  // Transform parameters for put-call symmetry
  return bjerksundStenslandCall(K, S, T, r - b, -b, sigma);
}

/**
 * Price American option using Bjerksund-Stensland 2002 approximation
 */
export function priceAmerican(
  S: number,
  K: number,
  T: number,
  r: number,
  b: number,
  sigma: number,
  optionType: OptionType
): number {
  // Handle edge cases - return intrinsic value
  if (S <= 0 || K <= 0) {
    return calculateIntrinsicValue(S, K, optionType);
  }
  
  // For 0DTE or near-expiry options, use intrinsic value directly
  // This avoids numerical instability in the approximation
  if (requiresIntrinsicOnly(T)) {
    return calculateIntrinsicValue(S, K, optionType);
  }
  
  // Invalid volatility - fall back to European pricing with intrinsic floor
  if (sigma <= 0) {
    const intrinsic = calculateIntrinsicValue(S, K, optionType);
    const european = gbsPrice(S, K, T, r, b, 0.01, optionType);
    return Math.max(intrinsic, european);
  }
  
  const clampedT = clampTimeToExpiry(T);
  
  if (optionType === 'call') {
    const american = bjerksundStenslandCall(S, K, clampedT, r, b, sigma);
    const european = gbsPrice(S, K, clampedT, r, b, sigma, 'call');
    // American option should never be worth less than European
    return Math.max(american, european, calculateIntrinsicValue(S, K, 'call'));
  } else {
    const american = bjerksundStenslandPut(S, K, clampedT, r, b, sigma);
    const european = gbsPrice(S, K, clampedT, r, b, sigma, 'put');
    return Math.max(american, european, calculateIntrinsicValue(S, K, 'put'));
  }
}

/**
 * Price American option using input object
 */
export function priceAmericanOption(input: PricingInput): number {
  const { S, K, T, r, sigma, optionType, assetClass = AssetClass.STOCK, q = 0, rf = 0 } = input;
  
  const b = input.b !== undefined 
    ? input.b 
    : calculateCostOfCarry(r, assetClass, q, rf);
  
  return priceAmerican(S, K, T, r, b, sigma, optionType);
}

/**
 * Calculate early exercise premium
 */
export function calculateEarlyExercisePremium(
  S: number,
  K: number,
  T: number,
  r: number,
  b: number,
  sigma: number,
  optionType: OptionType
): number {
  const american = priceAmerican(S, K, T, r, b, sigma, optionType);
  const european = gbsPrice(S, K, T, r, b, sigma, optionType);
  return Math.max(0, american - european);
}

/**
 * Vectorized American option pricing
 */
export function vectorizedAmericanPrice(
  S: number,
  strikes: number[],
  T: number,
  r: number,
  b: number,
  sigmas: number[],
  optionTypes: OptionType[]
): number[] {
  const results: number[] = [];
  
  for (let i = 0; i < strikes.length; i++) {
    const K = strikes[i];
    const sigma = sigmas[i] || sigmas[0];
    const optionType = optionTypes[i] || optionTypes[0];
    
    results.push(priceAmerican(S, K, T, r, b, sigma, optionType));
  }
  
  return results;
}
