/**
 * Fincai Volatility Surface Module
 * 
 * Builds volatility surfaces from market quotes with:
 * - SVI (Stochastic Volatility Inspired) parameterization for smoothing
 * - Confidence scoring and low-confidence flagging
 * - Put-call parity validation per strike
 * - Timestamp drift detection
 * 
 * SVI Model: w(k) = a + b * (ρ * (k - m) + sqrt((k - m)² + σ²))
 * where k = log-moneyness, w = total variance (σ²T)
 * 
 * License: MIT
 */

import { solveImpliedVolatility, calculateMidPrice, validateQuoteForIV } from './implied-vol';
import { calculateCostOfCarry, gbsPrice } from './gbs';
import { getInterpolatedRateSync } from './yield-curve-service';
import { getDividendYield, isIndexSymbol } from './dividend-service';
import { calculateTimeToExpiry, clampTimeToExpiry, is0DTE } from './time-utils';
import { AssetClass, OptionStyle, OptionType, Greeks } from './types';
import { calculateAllGreeks } from './greeks';

export interface SVIParams {
  a: number;      // Overall variance level
  b: number;      // Slope of wings (b >= 0)
  rho: number;    // Asymmetry (-1 < ρ < 1)
  m: number;      // Horizontal translation (ATM shift)
  sigma: number;  // Smoothness parameter (σ > 0)
}

export interface SurfaceNode {
  strike: number;
  expiry: number;
  optionType: OptionType;
  iv: number;
  ivRaw: number;
  ivSmoothed?: number;
  moneyness: number;
  totalVariance: number;
  bid: number;
  ask: number;
  mid: number;
  spread: number;
  spreadPercent: number;
  delta?: number;
  vega?: number;
  confidence: 'high' | 'medium' | 'low';
  lowConfidenceReasons: string[];
}

export interface ExpirySlice {
  expirationDate: Date;
  expiry: number;
  atmStrike: number;
  atmIV: number;
  nodes: SurfaceNode[];
  sviParams?: SVIParams;
  sviRMSE?: number;
  parityDeviations: Array<{ strike: number; deviation: number }>;
}

export interface EnhancedVolatilitySurface {
  symbol: string;
  spotPrice: number;
  timestamp: Date;
  slices: ExpirySlice[];
  atmIV: number;
  skew25Delta: number;
  termStructure: Array<{ expiry: number; atmIV: number }>;
  overallConfidence: 'high' | 'medium' | 'low';
  warnings: string[];
  nodeCount: number;
  validNodeCount: number;
}

export interface SurfaceChainInput {
  expirationDate: Date;
  strikes: number[];
  callBids: number[];
  callAsks: number[];
  putBids: number[];
  putAsks: number[];
  timestamp?: Date;
}

const MAX_SPREAD_PERCENT = 0.50;  // 50% max bid-ask spread
const MIN_BID = 0.01;
const PARITY_TOLERANCE_PERCENT = 0.02;  // 2% tolerance
const TIMESTAMP_DRIFT_MS = 1000;  // 1 second

/**
 * Calculate SVI total variance
 */
export function sviTotalVariance(k: number, params: SVIParams): number {
  const { a, b, rho, m, sigma } = params;
  const kShifted = k - m;
  return a + b * (rho * kShifted + Math.sqrt(kShifted * kShifted + sigma * sigma));
}

/**
 * Calculate SVI implied volatility from total variance
 */
export function sviIV(k: number, T: number, params: SVIParams): number {
  const w = sviTotalVariance(k, params);
  if (w <= 0 || T <= 0) return NaN;
  return Math.sqrt(w / T);
}

/**
 * Fit SVI parameters to a set of IV points using Levenberg-Marquardt-like optimization
 * Simplified gradient descent approach for robustness
 */
export function fitSVI(
  nodes: Array<{ moneyness: number; iv: number; expiry: number }>
): { params: SVIParams; rmse: number } {
  if (nodes.length < 3) {
    return {
      params: { a: 0.04, b: 0.1, rho: -0.3, m: 0, sigma: 0.1 },
      rmse: Infinity,
    };
  }

  const T = nodes[0].expiry;
  
  // Convert IV to total variance
  const points = nodes.map(n => ({
    k: n.moneyness,
    w: n.iv * n.iv * T,
  }));

  // Initial guess based on data
  const avgW = points.reduce((s, p) => s + p.w, 0) / points.length;
  const minK = Math.min(...points.map(p => p.k));
  const maxK = Math.max(...points.map(p => p.k));
  
  let params: SVIParams = {
    a: avgW * 0.8,
    b: avgW * 0.2 / (maxK - minK + 0.1),
    rho: -0.3,
    m: 0,
    sigma: 0.15,
  };

  // Gradient descent optimization (simplified)
  const learningRate = 0.01;
  const iterations = 500;

  for (let iter = 0; iter < iterations; iter++) {
    let gradA = 0, gradB = 0, gradRho = 0, gradM = 0, gradSigma = 0;

    for (const point of points) {
      const { k, w } = point;
      const wPred = sviTotalVariance(k, params);
      const error = wPred - w;

      // Partial derivatives
      const kShifted = k - params.m;
      const sqrtTerm = Math.sqrt(kShifted * kShifted + params.sigma * params.sigma);

      gradA += 2 * error;
      gradB += 2 * error * (params.rho * kShifted + sqrtTerm);
      gradRho += 2 * error * params.b * kShifted;
      gradM += 2 * error * params.b * (-params.rho - kShifted / sqrtTerm);
      gradSigma += 2 * error * params.b * params.sigma / sqrtTerm;
    }

    // Update with clamping
    params.a = Math.max(0.001, params.a - learningRate * gradA / points.length);
    params.b = Math.max(0, params.b - learningRate * gradB / points.length);
    params.rho = Math.max(-0.99, Math.min(0.99, params.rho - learningRate * gradRho / points.length));
    params.m -= learningRate * gradM / points.length;
    params.sigma = Math.max(0.01, params.sigma - learningRate * gradSigma / points.length);
  }

  // Calculate RMSE
  let sumSqError = 0;
  for (const point of points) {
    const wPred = sviTotalVariance(point.k, params);
    const ivPred = Math.sqrt(Math.max(0, wPred / T));
    const ivActual = Math.sqrt(Math.max(0, point.w / T));
    sumSqError += (ivPred - ivActual) ** 2;
  }
  const rmse = Math.sqrt(sumSqError / points.length);

  return { params, rmse };
}

/**
 * Build enhanced volatility surface from market data
 */
export function buildEnhancedVolatilitySurface(
  symbol: string,
  spotPrice: number,
  chains: SurfaceChainInput[],
  style: OptionStyle = OptionStyle.AMERICAN,
  underlyingTimestamp?: Date
): EnhancedVolatilitySurface {
  const now = new Date();
  const q = getDividendYield(symbol);
  const assetClass = isIndexSymbol(symbol) ? AssetClass.INDEX : AssetClass.STOCK;
  const warnings: string[] = [];
  const slices: ExpirySlice[] = [];
  let totalNodes = 0;
  let validNodes = 0;

  for (const chain of chains) {
    const T = calculateTimeToExpiry(chain.expirationDate);
    const clampedT = clampTimeToExpiry(T);
    const r = getInterpolatedRateSync(clampedT);
    const b = calculateCostOfCarry(r, assetClass, q);
    const forwardPrice = spotPrice * Math.exp(b * clampedT);

    const nodes: SurfaceNode[] = [];
    const parityDeviations: Array<{ strike: number; deviation: number }> = [];

    // Check timestamp drift
    const hasTimestampDrift = Boolean(chain.timestamp && 
      Math.abs(chain.timestamp.getTime() - (underlyingTimestamp?.getTime() || now.getTime())) > TIMESTAMP_DRIFT_MS);

    // Process each strike with both calls and puts
    for (let i = 0; i < chain.strikes.length; i++) {
      const K = chain.strikes[i];
      const moneyness = Math.log(K / forwardPrice);
      
      // Process calls
      const callBid = chain.callBids[i];
      const callAsk = chain.callAsks[i];
      if (callBid >= MIN_BID && callAsk > callBid) {
        const node = processNode(
          K, T, clampedT, r, b, spotPrice, 'call', 
          callBid, callAsk, moneyness, 
          hasTimestampDrift, assetClass, q, style
        );
        if (node) {
          nodes.push(node);
          validNodes++;
        }
        totalNodes++;
      }

      // Process puts
      const putBid = chain.putBids[i];
      const putAsk = chain.putAsks[i];
      if (putBid >= MIN_BID && putAsk > putBid) {
        const node = processNode(
          K, T, clampedT, r, b, spotPrice, 'put', 
          putBid, putAsk, moneyness, 
          hasTimestampDrift, assetClass, q, style
        );
        if (node) {
          nodes.push(node);
          validNodes++;
        }
        totalNodes++;
      }

      // Check put-call parity if both valid
      if (callBid >= MIN_BID && putBid >= MIN_BID) {
        const callMid = (callBid + callAsk) / 2;
        const putMid = (putBid + putAsk) / 2;
        const expectedDiff = spotPrice * Math.exp((b - r) * clampedT) - K * Math.exp(-r * clampedT);
        const actualDiff = callMid - putMid;
        const deviation = Math.abs(actualDiff - expectedDiff) / spotPrice;
        
        if (deviation > PARITY_TOLERANCE_PERCENT) {
          parityDeviations.push({ strike: K, deviation });
        }
      }
    }

    if (nodes.length === 0) continue;

    // Find ATM strike and IV
    const atmStrike = chain.strikes.reduce((closest, strike) => 
      Math.abs(strike - spotPrice) < Math.abs(closest - spotPrice) ? strike : closest
    );
    const atmNodes = nodes.filter(n => Math.abs(n.strike - atmStrike) < 1);
    const atmIV = atmNodes.length > 0 
      ? atmNodes.reduce((sum, n) => sum + n.iv, 0) / atmNodes.length 
      : 0;

    // Fit SVI to calls (or puts for deep OTM)
    const callNodes = nodes.filter(n => n.optionType === 'call' && n.confidence !== 'low');
    const sviResult = callNodes.length >= 3 
      ? fitSVI(callNodes.map(n => ({ moneyness: n.moneyness, iv: n.iv, expiry: T })))
      : null;

    // Apply smoothed IV from SVI
    if (sviResult && sviResult.rmse < 0.10) {
      for (const node of nodes) {
        node.ivSmoothed = sviIV(node.moneyness, T, sviResult.params);
      }
    }

    slices.push({
      expirationDate: chain.expirationDate,
      expiry: T,
      atmStrike,
      atmIV,
      nodes,
      sviParams: sviResult?.params,
      sviRMSE: sviResult?.rmse,
      parityDeviations,
    });

    if (parityDeviations.length > 0) {
      warnings.push(`Put-call parity deviation at ${parityDeviations.length} strikes for ${chain.expirationDate.toISOString().split('T')[0]}`);
    }
    if (hasTimestampDrift) {
      warnings.push(`Timestamp drift detected for ${chain.expirationDate.toISOString().split('T')[0]}`);
    }
  }

  // Calculate overall ATM IV (use first slice)
  const atmIV = slices.length > 0 ? slices[0].atmIV : 0;

  // Build term structure
  const termStructure = slices.map(s => ({
    expiry: s.expiry,
    atmIV: s.atmIV,
  })).sort((a, b) => a.expiry - b.expiry);

  // Calculate 25-delta skew
  const skew25Delta = calculate25DeltaSkew(slices, spotPrice);

  // Determine overall confidence
  const lowConfidenceRatio = slices.reduce((count, s) => 
    count + s.nodes.filter(n => n.confidence === 'low').length, 0
  ) / Math.max(1, validNodes);
  const overallConfidence = lowConfidenceRatio > 0.3 ? 'low' 
    : lowConfidenceRatio > 0.1 ? 'medium' 
    : 'high';

  return {
    symbol,
    spotPrice,
    timestamp: now,
    slices,
    atmIV,
    skew25Delta,
    termStructure,
    overallConfidence,
    warnings,
    nodeCount: totalNodes,
    validNodeCount: validNodes,
  };
}

function processNode(
  K: number,
  T: number,
  clampedT: number,
  r: number,
  b: number,
  S: number,
  optionType: OptionType,
  bid: number,
  ask: number,
  moneyness: number,
  hasTimestampDrift: boolean,
  assetClass: AssetClass,
  q: number,
  style: OptionStyle
): SurfaceNode | null {
  const mid = calculateMidPrice(bid, ask);
  const spread = ask - bid;
  const spreadPercent = spread / mid;
  const lowConfidenceReasons: string[] = [];

  // Validate spread
  if (spreadPercent > MAX_SPREAD_PERCENT) {
    lowConfidenceReasons.push('Wide spread');
  }

  // Check for 0DTE
  if (T < 1 / 365) {
    lowConfidenceReasons.push('0DTE');
  }

  // Check timestamp drift
  if (hasTimestampDrift) {
    lowConfidenceReasons.push('Timestamp drift');
  }

  // Solve IV
  const ivResult = solveImpliedVolatility(S, K, clampedT, r, mid, optionType, assetClass, q, 0, style);
  
  if (!ivResult.converged || ivResult.iv <= 0 || ivResult.iv > 3) {
    return null;
  }

  // Calculate Greeks for confidence assessment
  const greeks = calculateAllGreeks(S, K, clampedT, r, b, ivResult.iv, optionType);
  
  // Low vega = low confidence
  if (Math.abs(greeks.vega) < 0.01) {
    lowConfidenceReasons.push('Low vega');
  }

  // Deep OTM check
  if (optionType === 'call' && S < K * 0.85) {
    lowConfidenceReasons.push('Deep OTM');
  }
  if (optionType === 'put' && S > K * 1.15) {
    lowConfidenceReasons.push('Deep OTM');
  }

  const confidence: 'high' | 'medium' | 'low' = 
    lowConfidenceReasons.length >= 2 ? 'low' 
    : lowConfidenceReasons.length === 1 ? 'medium' 
    : 'high';

  return {
    strike: K,
    expiry: T,
    optionType,
    iv: ivResult.iv,
    ivRaw: ivResult.iv,
    moneyness,
    totalVariance: ivResult.iv * ivResult.iv * T,
    bid,
    ask,
    mid,
    spread,
    spreadPercent,
    delta: greeks.delta,
    vega: greeks.vega,
    confidence,
    lowConfidenceReasons,
  };
}

function calculate25DeltaSkew(slices: ExpirySlice[], S: number): number {
  if (slices.length === 0) return 0;

  const firstSlice = slices[0];
  if (!firstSlice || firstSlice.nodes.length === 0) return 0;

  // Find 25-delta put and call
  const puts = firstSlice.nodes.filter(n => n.optionType === 'put' && n.delta);
  const calls = firstSlice.nodes.filter(n => n.optionType === 'call' && n.delta);

  const put25 = puts.reduce((closest, n) => 
    Math.abs((n.delta || 0) + 0.25) < Math.abs((closest.delta || 0) + 0.25) ? n : closest,
    puts[0]
  );
  const call25 = calls.reduce((closest, n) =>
    Math.abs((n.delta || 0) - 0.25) < Math.abs((closest.delta || 0) - 0.25) ? n : closest,
    calls[0]
  );

  if (!put25 || !call25) return 0;
  
  return put25.iv - call25.iv;
}

/**
 * Generate a grid for 3D/heatmap visualization
 */
export function generateSurfaceGrid(
  surface: EnhancedVolatilitySurface,
  strikeCount: number = 20,
  expiryCount?: number
): Array<{ strike: number; expiry: number; iv: number; smoothed: boolean }> {
  const grid: Array<{ strike: number; expiry: number; iv: number; smoothed: boolean }> = [];

  if (surface.slices.length === 0) return grid;

  // Get strike range
  const allStrikes = surface.slices.flatMap(s => s.nodes.map(n => n.strike));
  const minStrike = Math.min(...allStrikes);
  const maxStrike = Math.max(...allStrikes);
  const strikeStep = (maxStrike - minStrike) / (strikeCount - 1);

  for (const slice of surface.slices) {
    if (!slice.sviParams) {
      // Use raw points if no SVI fit
      for (const node of slice.nodes) {
        grid.push({
          strike: node.strike,
          expiry: slice.expiry,
          iv: node.iv,
          smoothed: false,
        });
      }
    } else {
      // Use SVI for smooth grid
      for (let i = 0; i < strikeCount; i++) {
        const strike = minStrike + i * strikeStep;
        const forwardPrice = surface.spotPrice * Math.exp(0.02 * slice.expiry); // Approximate forward
        const moneyness = Math.log(strike / forwardPrice);
        const iv = sviIV(moneyness, slice.expiry, slice.sviParams);
        
        if (!isNaN(iv) && iv > 0 && iv < 3) {
          grid.push({
            strike,
            expiry: slice.expiry,
            iv,
            smoothed: true,
          });
        }
      }
    }
  }

  return grid;
}

export { calculateMidPrice, validateQuoteForIV };
