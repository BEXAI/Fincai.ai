/**
 * Fincai Autonomous Pricing Engine - Type Definitions
 * 
 * This module defines the core types for the Generalized Black-Scholes
 * pricing engine, supporting multiple asset classes via cost-of-carry.
 * 
 * License: MIT (Original optlib by Davis Edwards / Daniel Rojas)
 */

export enum AssetClass {
  STOCK = 'STOCK',       // b = r (standard BSM)
  INDEX = 'INDEX',       // b = r - q (Merton model with dividends)
  FUTURES = 'FUTURES',   // b = 0 (Black-76)
  FX = 'FX',             // b = r_d - r_f (Garman-Kohlhagen)
}

export enum OptionStyle {
  EUROPEAN = 'EUROPEAN',
  AMERICAN = 'AMERICAN',
}

export type OptionType = 'call' | 'put';

export interface PricingInput {
  S: number;              // Underlying spot price
  K: number;              // Strike price
  T: number;              // Time to expiry in years
  r: number;              // Risk-free rate (domestic rate for FX)
  sigma: number;          // Volatility (annualized)
  optionType: OptionType;
  assetClass?: AssetClass;
  q?: number;             // Dividend yield (for STOCK/INDEX)
  rf?: number;            // Foreign risk-free rate (for FX)
  b?: number;             // Explicit cost-of-carry override
}

export interface VectorizedPricingInput {
  S: number | number[];
  K: number | number[];
  T: number | number[];
  r: number;
  sigma: number | number[];
  optionTypes: OptionType[];
  assetClass?: AssetClass;
  q?: number;
  rf?: number;
  b?: number;
}

export interface Greeks {
  delta: number;
  gamma: number;
  theta: number;  // Daily theta (annualized / 365)
  vega: number;   // Per 1% IV change
  rho: number;    // Per 1% rate change
}

export interface PricingResult {
  price: number;
  greeks: Greeks;
  intrinsicValue: number;
  timeValue: number;
  moneyness: 'ITM' | 'ATM' | 'OTM';
  isLowConfidence?: boolean;
  lowConfidenceReason?: string;
}

export interface IVSolverResult {
  iv: number;
  converged: boolean;
  iterations: number;
  method: 'newton-raphson' | 'brent' | 'bisection';
  error?: string;
}

export interface YieldCurvePoint {
  maturity: number;  // In years
  rate: number;      // As decimal
}

export interface YieldCurve {
  date: string;
  points: YieldCurvePoint[];
  source: string;
}

export interface VolatilitySurfacePoint {
  strike: number;
  expiry: number;  // T in years
  iv: number;
  moneyness: number;  // K/S or log(K/F)
}

export interface VolatilitySurface {
  symbol: string;
  spotPrice: number;
  timestamp: Date;
  points: VolatilitySurfacePoint[];
  atmIV: number;
  skew25Delta: number;  // 25d put IV - 25d call IV
}

export interface SVIParams {
  a: number;      // Overall variance level
  b: number;      // Slope of wings (b >= 0)
  rho: number;    // Asymmetry (-1 < ρ < 1)
  m: number;      // Horizontal translation (ATM shift)
  sigma: number;  // Smoothness parameter (σ > 0)
}

export interface SurfaceNodeResponse {
  strike: number;
  expiry: number;
  optionType: OptionType;
  iv: number;
  ivSmoothed?: number;
  moneyness: number;
  bid: number;
  ask: number;
  mid: number;
  spreadPercent: number;
  delta?: number;
  confidence: 'high' | 'medium' | 'low';
  lowConfidenceReasons: string[];
}

export interface ExpirySliceResponse {
  expirationDate: string;
  expiry: number;
  atmStrike: number;
  atmIV: number;
  sviParams?: SVIParams;
  sviRMSE?: number;
  nodeCount: number;
  parityDeviationCount: number;
}

export interface EnhancedSurfaceResponse {
  symbol: string;
  spotPrice: number;
  timestamp: string;
  atmIV: number;
  atmIVPercent: string;
  skew25Delta: number;
  termStructure: Array<{ expiry: number; atmIV: number }>;
  overallConfidence: 'high' | 'medium' | 'low';
  warnings: string[];
  nodeCount: number;
  validNodeCount: number;
  slices: ExpirySliceResponse[];
  nodes: SurfaceNodeResponse[];
  grid?: Array<{ strike: number; expiry: number; iv: number; smoothed: boolean }>;
}

export const MIN_TIME_TO_EXPIRY = 1e-5;  // ~5.25 minutes in years
export const MAX_IV_ITERATIONS = 100;
export const IV_TOLERANCE = 1e-8;
export const CALENDAR_DAYS_PER_YEAR = 365.25;
export const TRADING_DAYS_PER_YEAR = 252;
