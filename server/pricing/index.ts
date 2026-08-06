/**
 * Fincai Autonomous Pricing Engine
 * 
 * A comprehensive options pricing engine implementing:
 * - Generalized Black-Scholes (GBS) for European options
 * - Bjerksund-Stensland (2002) for American options
 * - Greeks with cost-of-carry adjustments
 * - Implied volatility solver with fallbacks
 * - Treasury yield curve interpolation
 * - Dividend yield caching
 * 
 * Asset classes supported via cost-of-carry parameter (b):
 * - Stock Options: b = r (standard BSM)
 * - Index Options: b = r - q (Merton model)
 * - Futures Options: b = 0 (Black-76)
 * - FX Options: b = r_d - r_f (Garman-Kohlhagen)
 * 
 * License: MIT (Original optlib by Davis Edwards / Daniel Rojas)
 */

// Main engine
export { PricingEngine, pricingEngine } from './pricing-engine';

// Types
export * from './types';

// Core pricing functions
export {
  gbsPrice,
  priceEuropean,
  calculateCostOfCarry,
  calculateIntrinsicValue,
  getMoneyness,
  calculateLogMoneyness,
  vectorizedGbsPrice,
  priceOptionChain,
} from './gbs';

// American options
export {
  priceAmerican,
  priceAmericanOption,
  calculateEarlyExercisePremium,
  vectorizedAmericanPrice,
} from './american-bjerksund';

// Greeks
export {
  calculateDelta,
  calculateGamma,
  calculateTheta,
  calculateVega,
  calculateRho,
  calculateAllGreeks,
  calculateGreeksFromInput,
  vectorizedGreeks,
  calculatePortfolioGreeks,
  calculateDollarGreeks,
} from './greeks';

// Implied volatility
export {
  solveImpliedVolatility,
  solveChainIV,
  calculateMidPrice,
  validateQuoteForIV,
} from './implied-vol';

// Time utilities
export {
  calculateTimeToExpiry,
  calculateTimeToExpiryWithMarketClose,
  clampTimeToExpiry,
  is0DTE,
  requiresIntrinsicOnly,
  annualizedToDailyTheta,
  tradingDaysToYears,
  calendarDaysToYears,
  parseExpirationFromOCC,
} from './time-utils';

// Math utilities
export {
  normalCDF,
  normalPDF,
  normalInverseCDF,
  vectorizedNormalCDF,
  vectorizedNormalPDF,
} from './math-utils';

// Yield curve service
export {
  getYieldCurve,
  getInterpolatedRate,
  getInterpolatedRateSync,
  getYieldCurveStatus,
  refreshYieldCurve,
  initializeYieldCurve,
} from './yield-curve-service';

// Dividend service
export {
  getDividendYield,
  setDividendYield,
  batchUpdateDividends,
  getDividendInfo,
  isDividendStale,
  getCachedSymbols,
  getDividendCacheStats,
  isIndexSymbol,
  refreshDividend,
  refreshStaleDividends,
  initializeDividendCache,
} from './dividend-service';

// Historical Volatility service
export {
  getHistoricalVolatility,
  getVolatilityStats,
  getVolatilityCone,
  calculateIVHVRatio,
  getIVHVAnalysis,
  calculateHistoricalVolatility,
  calculateLogReturns,
  historicalVolatilityService,
} from './historical-volatility';

// Strategy Analyzer service
export {
  buildStrategy,
  calculateStrategyPayoff,
  calculateBreakEvenPoints,
  calculateMaxProfitLoss,
  calculateNetPremium,
  calculateStrategyGreeks,
  analyzeStrategy,
  createCoveredCall,
  createProtectivePut,
  createBullCallSpread,
  createBearPutSpread,
  createIronCondor,
  createStraddle,
  createStrangle,
  createButterfly,
  strategyAnalyzer,
} from './strategy-analyzer';

// Enhanced Volatility Surface with SVI
export {
  buildEnhancedVolatilitySurface,
  generateSurfaceGrid,
  fitSVI,
  sviIV,
} from './volatility-surface';

// P/L Simulator service
export {
  runMonteCarloSimulation,
  runWhatIfAnalysis,
  generateSensitivityGrid,
  DEFAULT_SCENARIOS,
  pnlSimulator,
} from './pnl-simulator';

// VaR Calculator service
export {
  calculatePortfolioVaR,
  runStressTests,
  calculateRiskMetrics,
  varCalculator,
} from './var-calculator';

// Greeks Visualizer service
export {
  getGreeksEducation,
  generateGreeksVsPrice,
  generateGreeksVsTime,
  generateGreeksVsIV,
  generateGreeksSurface,
  getGreekSnapshot,
  greeksVisualizer,
} from './greeks-visualizer';
