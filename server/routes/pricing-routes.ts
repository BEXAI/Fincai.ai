/**
 * Fincai Autonomous Pricing Engine - API Routes
 * 
 * RESTful endpoints for option pricing, Greeks, IV, and volatility surfaces.
 * All endpoints validate inputs and return structured responses.
 * 
 * Endpoints:
 * - GET /api/pricing/quote/:symbol - Price single option
 * - POST /api/pricing/chain - Batch price option chain
 * - GET /api/pricing/greeks - Calculate Greeks
 * - POST /api/pricing/iv - Solve implied volatility
 * - GET /api/pricing/yield-curve - Get current yield curve
 * - GET /api/pricing/dividend/:symbol - Get dividend yield
 * - POST /api/pricing/surface - Build volatility surface
 * - POST /api/pricing/validate-parity - Validate put-call parity
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import {
  pricingEngine,
  AssetClass,
  OptionStyle,
  OptionType,
} from '../pricing';
import {
  getYieldCurve,
  getYieldCurveStatus,
  refreshYieldCurve,
} from '../pricing/yield-curve-service';
import {
  getDividendYield,
  getDividendInfo,
  getDividendCacheStats,
} from '../pricing/dividend-service';
import { calculateTimeToExpiry } from '../pricing/time-utils';
import {
  buildEnhancedVolatilitySurface,
  generateSurfaceGrid,
} from '../pricing/volatility-surface';

const router = Router();

const OptionTypeEnum = z.enum(['call', 'put']);
const OptionStyleEnum = z.enum(['EUROPEAN', 'AMERICAN']);
const AssetClassEnum = z.enum(['STOCK', 'INDEX', 'FUTURES', 'FX']);

const PriceQuoteSchema = z.object({
  symbol: z.string().min(1).max(10).toUpperCase(),
  spotPrice: z.number().positive().max(100000),
  strikePrice: z.number().positive().max(100000),
  expirationDate: z.string().transform(s => new Date(s)).refine(d => d > new Date(), {
    message: 'Expiration date must be in the future',
  }),
  volatility: z.number().positive().min(0.001).max(5),
  optionType: OptionTypeEnum,
  style: OptionStyleEnum.optional().default('AMERICAN'),
});

const ChainPricingSchema = z.object({
  symbol: z.string().min(1).max(10).toUpperCase(),
  spotPrice: z.number().positive().max(100000),
  expirationDate: z.string().transform(s => new Date(s)).refine(d => d > new Date(), {
    message: 'Expiration date must be in the future',
  }),
  contracts: z.array(z.object({
    strikePrice: z.number().positive().max(100000),
    volatility: z.number().positive().min(0.001).max(5),
    optionType: OptionTypeEnum,
  })).max(500),
  style: OptionStyleEnum.optional().default('AMERICAN'),
  includeSurface: z.boolean().optional().default(false),
});

const IVSolverSchema = z.object({
  symbol: z.string().min(1).max(10).toUpperCase(),
  spotPrice: z.number().positive().max(100000),
  strikePrice: z.number().positive().max(100000),
  expirationDate: z.string().transform(s => new Date(s)).refine(d => d > new Date(), {
    message: 'Expiration date must be in the future',
  }),
  marketPrice: z.number().positive().min(0.01).max(100000),
  optionType: OptionTypeEnum,
  style: OptionStyleEnum.optional().default('AMERICAN'),
});

const SurfaceSchema = z.object({
  symbol: z.string().min(1).max(10),
  spotPrice: z.number().positive(),
  chains: z.array(z.object({
    expirationDate: z.string().transform(s => new Date(s)),
    strikes: z.array(z.number().positive()),
    callBids: z.array(z.number().nonnegative()),
    callAsks: z.array(z.number().positive()),
    putBids: z.array(z.number().nonnegative()),
    putAsks: z.array(z.number().positive()),
    timestamp: z.string().transform(s => new Date(s)).optional(),
  })),
  style: OptionStyleEnum.optional().default('AMERICAN'),
  includeGrid: z.boolean().optional().default(false),
  underlyingTimestamp: z.string().transform(s => new Date(s)).optional(),
});

const LegacySurfaceSchema = z.object({
  symbol: z.string().min(1).max(10),
  spotPrice: z.number().positive(),
  chains: z.array(z.object({
    expirationDate: z.string().transform(s => new Date(s)),
    strikes: z.array(z.number().positive()),
    bids: z.array(z.number().nonnegative()),
    asks: z.array(z.number().positive()),
    optionTypes: z.array(OptionTypeEnum),
  })),
  style: OptionStyleEnum.optional().default('AMERICAN'),
});

const ParityValidationSchema = z.object({
  symbol: z.string().min(1).max(10),
  spotPrice: z.number().positive(),
  strikePrice: z.number().positive(),
  expirationDate: z.string().transform(s => new Date(s)),
  callPrice: z.number().positive(),
  putPrice: z.number().positive(),
});

/**
 * GET /api/pricing/quote/:symbol
 * Price a single option contract
 */
router.get('/quote/:symbol', async (req: Request, res: Response) => {
  try {
    const { symbol } = req.params;
    const query = req.query;
    
    const parsed = PriceQuoteSchema.parse({
      symbol,
      spotPrice: Number(query.spotPrice),
      strikePrice: Number(query.strikePrice),
      expirationDate: query.expirationDate,
      volatility: Number(query.volatility),
      optionType: query.optionType,
      style: query.style,
    });

    await pricingEngine.initialize();

    const result = await pricingEngine.priceOption(
      parsed.symbol,
      parsed.spotPrice,
      parsed.strikePrice,
      parsed.expirationDate,
      parsed.volatility,
      parsed.optionType as OptionType,
      parsed.style === 'AMERICAN' ? OptionStyle.AMERICAN : OptionStyle.EUROPEAN
    );

    res.json({
      success: true,
      data: {
        symbol: parsed.symbol,
        spotPrice: parsed.spotPrice,
        strikePrice: parsed.strikePrice,
        expiration: parsed.expirationDate.toISOString(),
        timeToExpiry: calculateTimeToExpiry(parsed.expirationDate),
        optionType: parsed.optionType,
        style: parsed.style,
        ...result,
      },
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to price option',
    });
  }
});

/**
 * POST /api/pricing/chain
 * Batch price option chain
 */
router.post('/chain', async (req: Request, res: Response) => {
  try {
    const parsed = ChainPricingSchema.parse(req.body);

    await pricingEngine.initialize();

    const strikes = parsed.contracts.map(c => c.strikePrice);
    const sigmas = parsed.contracts.map(c => c.volatility);
    const optionTypes = parsed.contracts.map(c => c.optionType as OptionType);

    const results = await pricingEngine.priceChain(
      parsed.symbol,
      parsed.spotPrice,
      strikes,
      parsed.expirationDate,
      sigmas,
      optionTypes,
      parsed.style === 'AMERICAN' ? OptionStyle.AMERICAN : OptionStyle.EUROPEAN
    );

    const enrichedResults = parsed.contracts.map((contract, i) => ({
      strikePrice: contract.strikePrice,
      optionType: contract.optionType,
      inputVolatility: contract.volatility,
      ...results[i],
    }));

    res.json({
      success: true,
      data: {
        symbol: parsed.symbol,
        spotPrice: parsed.spotPrice,
        expiration: parsed.expirationDate.toISOString(),
        timeToExpiry: calculateTimeToExpiry(parsed.expirationDate),
        style: parsed.style,
        contracts: enrichedResults,
        count: enrichedResults.length,
      },
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to price chain',
    });
  }
});

/**
 * GET /api/pricing/greeks
 * Calculate Greeks for an option
 */
router.get('/greeks', async (req: Request, res: Response) => {
  try {
    const query = req.query;
    
    const parsed = PriceQuoteSchema.parse({
      symbol: query.symbol,
      spotPrice: Number(query.spotPrice),
      strikePrice: Number(query.strikePrice),
      expirationDate: query.expirationDate,
      volatility: Number(query.volatility),
      optionType: query.optionType,
      style: query.style,
    });

    await pricingEngine.initialize();

    const greeks = await pricingEngine.calculateGreeks(
      parsed.symbol,
      parsed.spotPrice,
      parsed.strikePrice,
      parsed.expirationDate,
      parsed.volatility,
      parsed.optionType as OptionType
    );

    const dollarGreeks = await pricingEngine.getDollarGreeks(
      parsed.symbol,
      parsed.spotPrice,
      parsed.strikePrice,
      parsed.expirationDate,
      parsed.volatility,
      parsed.optionType as OptionType,
      100
    );

    res.json({
      success: true,
      data: {
        symbol: parsed.symbol,
        spotPrice: parsed.spotPrice,
        strikePrice: parsed.strikePrice,
        expiration: parsed.expirationDate.toISOString(),
        optionType: parsed.optionType,
        volatility: parsed.volatility,
        greeks: {
          delta: greeks.delta,
          gamma: greeks.gamma,
          theta: greeks.theta,
          vega: greeks.vega,
          rho: greeks.rho,
        },
        dollarGreeks: {
          delta: dollarGreeks.delta,
          gamma: dollarGreeks.gamma,
          theta: dollarGreeks.theta,
          vega: dollarGreeks.vega,
          rho: dollarGreeks.rho,
        },
      },
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to calculate Greeks',
    });
  }
});

/**
 * POST /api/pricing/iv
 * Solve implied volatility from market price
 */
router.post('/iv', async (req: Request, res: Response) => {
  try {
    const parsed = IVSolverSchema.parse(req.body);

    await pricingEngine.initialize();

    const result = await pricingEngine.solveIV(
      parsed.symbol,
      parsed.spotPrice,
      parsed.strikePrice,
      parsed.expirationDate,
      parsed.marketPrice,
      parsed.optionType as OptionType,
      parsed.style === 'AMERICAN' ? OptionStyle.AMERICAN : OptionStyle.EUROPEAN
    );

    res.json({
      success: true,
      data: {
        symbol: parsed.symbol,
        spotPrice: parsed.spotPrice,
        strikePrice: parsed.strikePrice,
        marketPrice: parsed.marketPrice,
        expiration: parsed.expirationDate.toISOString(),
        optionType: parsed.optionType,
        impliedVolatility: result.iv,
        impliedVolatilityPercent: (result.iv * 100).toFixed(2) + '%',
        converged: result.converged,
        iterations: result.iterations,
        method: result.method,
        error: result.error,
      },
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to solve IV',
    });
  }
});

/**
 * GET /api/pricing/yield-curve
 * Get current Treasury yield curve
 */
router.get('/yield-curve', async (_req: Request, res: Response) => {
  try {
    const curve = await getYieldCurve();
    const status = getYieldCurveStatus();

    res.json({
      success: true,
      data: {
        date: curve.date,
        source: curve.source,
        points: curve.points.map(p => ({
          maturityYears: p.maturity,
          rate: p.rate,
          ratePercent: (p.rate * 100).toFixed(3) + '%',
        })),
        status,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get yield curve',
    });
  }
});

/**
 * POST /api/pricing/yield-curve/refresh
 * Force refresh yield curve from Treasury
 */
router.post('/yield-curve/refresh', async (_req: Request, res: Response) => {
  try {
    const success = await refreshYieldCurve();
    const curve = await getYieldCurve();

    res.json({
      success,
      data: {
        date: curve.date,
        source: curve.source,
        pointCount: curve.points.length,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to refresh yield curve',
    });
  }
});

/**
 * GET /api/pricing/dividend/:symbol
 * Get dividend yield for symbol
 */
router.get('/dividend/:symbol', async (req: Request, res: Response) => {
  try {
    const { symbol } = req.params;
    const normalizedSymbol = symbol.toUpperCase();
    
    const dividendYield = getDividendYield(normalizedSymbol);
    const info = getDividendInfo(normalizedSymbol);

    res.json({
      success: true,
      data: {
        symbol: normalizedSymbol,
        dividendYield,
        dividendYieldPercent: (dividendYield * 100).toFixed(2) + '%',
        source: info?.source || 'default',
        lastUpdated: info?.lastUpdated?.toISOString() || null,
      },
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to get dividend yield',
    });
  }
});

/**
 * GET /api/pricing/dividend/stats
 * Get dividend cache statistics
 */
router.get('/dividend-stats', async (_req: Request, res: Response) => {
  try {
    const stats = getDividendCacheStats();

    res.json({
      success: true,
      data: stats,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get dividend stats',
    });
  }
});

/**
 * POST /api/pricing/surface
 * Build enhanced volatility surface with SVI smoothing
 */
router.post('/surface', async (req: Request, res: Response) => {
  try {
    // Try enhanced schema first, fallback to legacy
    let parsed;
    let isEnhanced = true;
    try {
      parsed = SurfaceSchema.parse(req.body);
    } catch {
      parsed = LegacySurfaceSchema.parse(req.body);
      isEnhanced = false;
    }

    await pricingEngine.initialize();

    if (isEnhanced && parsed.chains.length > 0 && 'callBids' in parsed.chains[0]) {
      // Enhanced surface with SVI
      const surface = buildEnhancedVolatilitySurface(
        parsed.symbol,
        parsed.spotPrice,
        parsed.chains.map(c => ({
          expirationDate: c.expirationDate,
          strikes: c.strikes,
          callBids: (c as any).callBids,
          callAsks: (c as any).callAsks,
          putBids: (c as any).putBids,
          putAsks: (c as any).putAsks,
          timestamp: (c as any).timestamp,
        })),
        parsed.style === 'AMERICAN' ? OptionStyle.AMERICAN : OptionStyle.EUROPEAN,
        (parsed as any).underlyingTimestamp
      );

      // Generate grid if requested
      const grid = (parsed as any).includeGrid 
        ? generateSurfaceGrid(surface, 25)
        : undefined;

      res.json({
        success: true,
        data: {
          symbol: surface.symbol,
          spotPrice: surface.spotPrice,
          timestamp: surface.timestamp.toISOString(),
          atmIV: surface.atmIV,
          atmIVPercent: (surface.atmIV * 100).toFixed(2) + '%',
          skew25Delta: surface.skew25Delta,
          termStructure: surface.termStructure.map(t => ({
            expiry: t.expiry,
            expiryDays: Math.round(t.expiry * 365),
            atmIV: t.atmIV,
            atmIVPercent: (t.atmIV * 100).toFixed(2) + '%',
          })),
          overallConfidence: surface.overallConfidence,
          warnings: surface.warnings,
          nodeCount: surface.nodeCount,
          validNodeCount: surface.validNodeCount,
          slices: surface.slices.map(s => ({
            expirationDate: s.expirationDate.toISOString(),
            expiry: s.expiry,
            expiryDays: Math.round(s.expiry * 365),
            atmStrike: s.atmStrike,
            atmIV: s.atmIV,
            atmIVPercent: (s.atmIV * 100).toFixed(2) + '%',
            sviParams: s.sviParams,
            sviRMSE: s.sviRMSE,
            nodeCount: s.nodes.length,
            parityDeviationCount: s.parityDeviations.length,
          })),
          nodes: surface.slices.flatMap(s => s.nodes.map(n => ({
            strike: n.strike,
            expiry: n.expiry,
            expiryDays: Math.round(n.expiry * 365),
            optionType: n.optionType,
            iv: n.iv,
            ivPercent: (n.iv * 100).toFixed(2) + '%',
            ivSmoothed: n.ivSmoothed,
            ivSmoothedPercent: n.ivSmoothed ? (n.ivSmoothed * 100).toFixed(2) + '%' : null,
            moneyness: n.moneyness,
            bid: n.bid,
            ask: n.ask,
            mid: n.mid,
            spreadPercent: (n.spreadPercent * 100).toFixed(2) + '%',
            delta: n.delta,
            confidence: n.confidence,
            lowConfidenceReasons: n.lowConfidenceReasons,
          }))),
          grid: grid?.map(g => ({
            strike: g.strike,
            expiry: g.expiry,
            expiryDays: Math.round(g.expiry * 365),
            iv: g.iv,
            ivPercent: (g.iv * 100).toFixed(2) + '%',
            smoothed: g.smoothed,
          })),
        },
      });
    } else {
      // Legacy surface (backwards compatibility)
      const surface = await pricingEngine.buildVolatilitySurface(
        parsed.symbol,
        parsed.spotPrice,
        (parsed as any).chains.map((c: any) => ({
          expirationDate: c.expirationDate,
          strikes: c.strikes,
          bids: c.bids,
          asks: c.asks,
          optionTypes: c.optionTypes as OptionType[],
        })),
        parsed.style === 'AMERICAN' ? OptionStyle.AMERICAN : OptionStyle.EUROPEAN
      );

      res.json({
        success: true,
        data: {
          symbol: surface.symbol,
          spotPrice: surface.spotPrice,
          timestamp: surface.timestamp.toISOString(),
          atmIV: surface.atmIV,
          atmIVPercent: (surface.atmIV * 100).toFixed(2) + '%',
          skew25Delta: surface.skew25Delta,
          pointCount: surface.points.length,
          points: surface.points.map(p => ({
            strike: p.strike,
            expiry: p.expiry,
            iv: p.iv,
            ivPercent: (p.iv * 100).toFixed(2) + '%',
            moneyness: p.moneyness,
          })),
        },
      });
    }
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to build surface',
    });
  }
});

/**
 * POST /api/pricing/validate-parity
 * Validate put-call parity
 */
router.post('/validate-parity', async (req: Request, res: Response) => {
  try {
    const parsed = ParityValidationSchema.parse(req.body);

    await pricingEngine.initialize();

    const result = await pricingEngine.validateParity(
      parsed.symbol,
      parsed.spotPrice,
      parsed.strikePrice,
      parsed.expirationDate,
      parsed.callPrice,
      parsed.putPrice
    );

    res.json({
      success: true,
      data: {
        symbol: parsed.symbol,
        spotPrice: parsed.spotPrice,
        strikePrice: parsed.strikePrice,
        callPrice: parsed.callPrice,
        putPrice: parsed.putPrice,
        parityValid: result.valid,
        deviation: result.deviation,
        expectedDiff: result.expectedDiff,
        actualDiff: result.actualDiff,
        message: result.valid 
          ? 'Put-call parity holds within tolerance'
          : `Parity violation detected: deviation of $${result.deviation.toFixed(4)}`,
      },
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to validate parity',
    });
  }
});

/**
 * GET /api/pricing/rate/:timeToExpiry
 * Get interpolated risk-free rate
 */
router.get('/rate/:timeToExpiry', async (req: Request, res: Response) => {
  try {
    const T = Number(req.params.timeToExpiry);
    
    if (isNaN(T) || T < 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid time to expiry',
      });
    }

    await pricingEngine.initialize();
    const rate = await pricingEngine.getRiskFreeRate(T);

    res.json({
      success: true,
      data: {
        timeToExpiry: T,
        rate,
        ratePercent: (rate * 100).toFixed(3) + '%',
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get rate',
    });
  }
});

/**
 * GET /api/pricing/status
 * Get pricing engine status
 */
router.get('/status', async (_req: Request, res: Response) => {
  try {
    await pricingEngine.initialize();
    const yieldStatus = getYieldCurveStatus();
    const dividendStats = getDividendCacheStats();

    res.json({
      success: true,
      data: {
        engine: 'Fincai Autonomous Pricing Engine',
        version: '1.0.0',
        status: 'operational',
        models: {
          european: 'Generalized Black-Scholes (GBS)',
          american: 'Bjerksund-Stensland 2002',
          greeks: 'GBS with cost-of-carry',
          ivSolver: 'Newton-Raphson with Brent fallback',
        },
        yieldCurve: yieldStatus,
        dividends: dividendStats,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get status',
    });
  }
});

/**
 * Historical Volatility Routes
 */
import {
  getHistoricalVolatility,
  getVolatilityStats,
  getVolatilityCone,
  getIVHVAnalysis,
} from '../pricing/historical-volatility';

import {
  buildStrategy,
  calculateStrategyPayoff,
  calculateStrategyGreeks,
  analyzeStrategy,
  createCoveredCall,
  createBullCallSpread,
  createBearPutSpread,
  createIronCondor,
  createStraddle,
  createStrangle,
  StrategyLeg,
  OptionTypeStr,
} from '../pricing/strategy-analyzer';

const HVSchema = z.object({
  symbol: z.string().min(1).max(10),
  period: z.number().int().min(5).max(252).optional().default(20),
});

const IVHVSchema = z.object({
  symbol: z.string().min(1).max(10),
  impliedVol: z.number().positive(),
  hvPeriod: z.number().int().min(5).max(252).optional().default(20),
});

const StrategyLegSchema = z.object({
  optionType: z.enum(['call', 'put']),
  strike: z.number().positive(),
  expiration: z.string(),
  quantity: z.number().int().min(1),
  premium: z.number().min(0),
  action: z.enum(['buy', 'sell']),
  iv: z.number().positive().optional(),
});

const StrategyAnalysisSchema = z.object({
  name: z.string().min(1),
  symbol: z.string().min(1).max(10),
  underlyingPrice: z.number().positive(),
  legs: z.array(StrategyLegSchema).min(1),
  stockLeg: z.object({
    quantity: z.number().int().positive(),
    entryPrice: z.number().positive(),
    action: z.enum(['buy', 'sell']),
  }).optional(),
});

/**
 * GET /api/pricing/hv/:symbol
 * Get historical volatility
 */
router.get('/hv/:symbol', async (req: Request, res: Response) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    const period = parseInt(req.query.period as string) || 20;

    const result = await getHistoricalVolatility(symbol, period);

    res.json({
      success: true,
      data: {
        symbol: result.symbol,
        period: result.period,
        annualizedHV: result.annualizedHV,
        annualizedHVPercent: (result.annualizedHV * 100).toFixed(2) + '%',
        dailyHV: result.dailyHV,
        dailyHVPercent: (result.dailyHV * 100).toFixed(4) + '%',
        dataPoints: result.dataPoints,
        startDate: result.startDate,
        endDate: result.endDate,
      },
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to calculate historical volatility',
    });
  }
});

/**
 * GET /api/pricing/hv-stats/:symbol
 * Get volatility statistics for multiple windows
 */
router.get('/hv-stats/:symbol', async (req: Request, res: Response) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    const stats = await getVolatilityStats(symbol);

    res.json({
      success: true,
      data: {
        symbol: stats.symbol,
        windows: {
          hv10: { value: stats.hv10, percent: (stats.hv10 * 100).toFixed(2) + '%' },
          hv20: { value: stats.hv20, percent: (stats.hv20 * 100).toFixed(2) + '%' },
          hv30: { value: stats.hv30, percent: (stats.hv30 * 100).toFixed(2) + '%' },
          hv60: { value: stats.hv60, percent: (stats.hv60 * 100).toFixed(2) + '%' },
          hv90: { value: stats.hv90, percent: (stats.hv90 * 100).toFixed(2) + '%' },
        },
        range: {
          min: stats.hvMin,
          max: stats.hvMax,
          mean: stats.hvMean,
          stdDev: stats.hvStdDev,
        },
      },
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to get volatility statistics',
    });
  }
});

/**
 * GET /api/pricing/vol-cone/:symbol
 * Get volatility cone
 */
router.get('/vol-cone/:symbol', async (req: Request, res: Response) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    const cone = await getVolatilityCone(symbol);

    res.json({
      success: true,
      data: {
        symbol: cone.symbol,
        periods: cone.periods,
        percentiles: {
          p10: cone.percentiles.p10.map(v => ({ value: v, percent: (v * 100).toFixed(2) + '%' })),
          p25: cone.percentiles.p25.map(v => ({ value: v, percent: (v * 100).toFixed(2) + '%' })),
          p50: cone.percentiles.p50.map(v => ({ value: v, percent: (v * 100).toFixed(2) + '%' })),
          p75: cone.percentiles.p75.map(v => ({ value: v, percent: (v * 100).toFixed(2) + '%' })),
          p90: cone.percentiles.p90.map(v => ({ value: v, percent: (v * 100).toFixed(2) + '%' })),
        },
        current: cone.current.map(v => ({ value: v, percent: (v * 100).toFixed(2) + '%' })),
      },
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to get volatility cone',
    });
  }
});

/**
 * POST /api/pricing/iv-hv-ratio
 * Compare IV to HV
 */
router.post('/iv-hv-ratio', async (req: Request, res: Response) => {
  try {
    const parsed = IVHVSchema.parse(req.body);
    const analysis = await getIVHVAnalysis(parsed.symbol, parsed.impliedVol, parsed.hvPeriod);

    res.json({
      success: true,
      data: {
        symbol: analysis.symbol,
        impliedVol: analysis.impliedVol,
        impliedVolPercent: (analysis.impliedVol * 100).toFixed(2) + '%',
        historicalVol: analysis.historicalVol,
        historicalVolPercent: (analysis.historicalVol * 100).toFixed(2) + '%',
        ratio: analysis.ratio,
        interpretation: analysis.interpretation,
        message: analysis.interpretation === 'expensive' 
          ? 'Options appear overpriced relative to historical volatility'
          : analysis.interpretation === 'cheap'
          ? 'Options appear underpriced relative to historical volatility'
          : 'Options appear fairly priced relative to historical volatility',
      },
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to analyze IV/HV ratio',
    });
  }
});

/**
 * POST /api/pricing/strategy/analyze
 * Analyze multi-leg options strategy
 */
router.post('/strategy/analyze', async (req: Request, res: Response) => {
  try {
    const parsed = StrategyAnalysisSchema.parse(req.body);
    
    const legs: StrategyLeg[] = parsed.legs.map(leg => ({
      optionType: leg.optionType as OptionTypeStr,
      strike: leg.strike,
      expiration: new Date(leg.expiration),
      quantity: leg.quantity,
      premium: leg.premium,
      action: leg.action,
      iv: leg.iv,
    }));

    const strategy = buildStrategy(
      parsed.name,
      'custom',
      parsed.symbol,
      parsed.underlyingPrice,
      legs,
      parsed.stockLeg
    );

    const analysis = await analyzeStrategy(strategy);

    res.json({
      success: true,
      data: {
        strategy: {
          name: analysis.strategy.name,
          type: analysis.strategy.type,
          symbol: analysis.strategy.symbol,
          underlyingPrice: analysis.strategy.underlyingPrice,
          legCount: analysis.strategy.legs.length,
          netPremium: analysis.strategy.netPremium,
          netPremiumFormatted: analysis.strategy.netPremium >= 0 
            ? `Credit: $${analysis.strategy.netPremium.toFixed(2)}`
            : `Debit: $${Math.abs(analysis.strategy.netPremium).toFixed(2)}`,
          maxProfit: analysis.strategy.maxProfit,
          maxLoss: analysis.strategy.maxLoss,
          breakEvenPoints: analysis.strategy.breakEvenPoints,
          riskRewardRatio: analysis.strategy.riskRewardRatio,
        },
        greeks: analysis.greeks,
        daysToExpiration: analysis.daysToExpiration,
        payoffData: analysis.payoffData,
      },
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to analyze strategy',
    });
  }
});

/**
 * POST /api/pricing/strategy/payoff
 * Calculate payoff diagram for a strategy
 */
router.post('/strategy/payoff', async (req: Request, res: Response) => {
  try {
    const parsed = StrategyAnalysisSchema.parse(req.body);
    const priceRange = {
      min: parsed.underlyingPrice * 0.7,
      max: parsed.underlyingPrice * 1.3,
      steps: 100,
    };
    
    const legs: StrategyLeg[] = parsed.legs.map(leg => ({
      optionType: leg.optionType as OptionTypeStr,
      strike: leg.strike,
      expiration: new Date(leg.expiration),
      quantity: leg.quantity,
      premium: leg.premium,
      action: leg.action,
      iv: leg.iv,
    }));

    const strategy = buildStrategy(
      parsed.name,
      'custom',
      parsed.symbol,
      parsed.underlyingPrice,
      legs,
      parsed.stockLeg
    );

    const payoffData = calculateStrategyPayoff(strategy, priceRange);

    res.json({
      success: true,
      data: {
        symbol: parsed.symbol,
        underlyingPrice: parsed.underlyingPrice,
        priceRange: {
          min: priceRange.min,
          max: priceRange.max,
        },
        payoffData,
      },
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to calculate payoff',
    });
  }
});

/**
 * POST /api/pricing/strategy/greeks
 * Calculate aggregate Greeks for a strategy
 */
router.post('/strategy/greeks', async (req: Request, res: Response) => {
  try {
    const parsed = StrategyAnalysisSchema.parse(req.body);
    
    const legs: StrategyLeg[] = parsed.legs.map(leg => ({
      optionType: leg.optionType as OptionTypeStr,
      strike: leg.strike,
      expiration: new Date(leg.expiration),
      quantity: leg.quantity,
      premium: leg.premium,
      action: leg.action,
      iv: leg.iv,
    }));

    const strategy = buildStrategy(
      parsed.name,
      'custom',
      parsed.symbol,
      parsed.underlyingPrice,
      legs,
      parsed.stockLeg
    );

    const greeks = await calculateStrategyGreeks(strategy);

    res.json({
      success: true,
      data: {
        symbol: parsed.symbol,
        greeks: {
          delta: greeks.delta,
          deltaInterpretation: greeks.delta > 0 ? 'Long exposure' : 'Short exposure',
          gamma: greeks.gamma,
          theta: greeks.theta,
          thetaDaily: `$${greeks.theta.toFixed(2)}/day`,
          vega: greeks.vega,
          rho: greeks.rho,
        },
        positionType: Math.abs(greeks.delta) < 20 ? 'Delta Neutral' 
          : greeks.delta > 0 ? 'Bullish' : 'Bearish',
      },
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to calculate strategy Greeks',
    });
  }
});

/**
 * Advanced Analytics Routes
 */
import {
  runMonteCarloSimulation,
  runWhatIfAnalysis,
  generateSensitivityGrid,
  DEFAULT_SCENARIOS,
  Position,
  SimulationParams,
  WhatIfScenario,
} from '../pricing/pnl-simulator';

import {
  calculatePortfolioVaR,
  runStressTests,
  calculateRiskMetrics,
  PortfolioPosition,
  VaRParams,
} from '../pricing/var-calculator';

import {
  getGreeksEducation,
  generateGreeksVsPrice,
  generateGreeksVsTime,
  generateGreeksVsIV,
  generateGreeksSurface,
  getGreekSnapshot,
} from '../pricing/greeks-visualizer';

const MonteCarloSchema = z.object({
  position: z.object({
    symbol: z.string().min(1).max(10),
    optionType: z.enum(['call', 'put']),
    strike: z.number().positive(),
    expiration: z.string().transform(s => new Date(s)),
    quantity: z.number().int().positive(),
    entryPrice: z.number().positive(),
    action: z.enum(['long', 'short']),
    currentIV: z.number().positive().optional(),
  }),
  currentPrice: z.number().positive(),
  params: z.object({
    numSimulations: z.number().int().min(100).max(100000).optional().default(10000),
    timeHorizonDays: z.number().int().min(1).max(365),
    volatilityOverride: z.number().positive().optional(),
    confidenceLevel: z.number().min(0.8).max(0.99).optional().default(0.95),
  }),
});

const WhatIfSchema = z.object({
  position: z.object({
    symbol: z.string().min(1).max(10),
    optionType: z.enum(['call', 'put']),
    strike: z.number().positive(),
    expiration: z.string().transform(s => new Date(s)),
    quantity: z.number().int().positive(),
    entryPrice: z.number().positive(),
    action: z.enum(['long', 'short']),
    currentIV: z.number().positive().optional(),
  }),
  currentPrice: z.number().positive(),
  scenarios: z.array(z.object({
    name: z.string(),
    priceChange: z.number(),
    ivChange: z.number(),
    daysElapsed: z.number().int().min(0),
  })).optional(),
});

const SensitivityGridSchema = z.object({
  position: z.object({
    symbol: z.string().min(1).max(10),
    optionType: z.enum(['call', 'put']),
    strike: z.number().positive(),
    expiration: z.string().transform(s => new Date(s)),
    quantity: z.number().int().positive(),
    entryPrice: z.number().positive(),
    action: z.enum(['long', 'short']),
    currentIV: z.number().positive().optional(),
  }),
  currentPrice: z.number().positive(),
  priceRange: z.object({
    min: z.number().positive(),
    max: z.number().positive(),
    steps: z.number().int().min(5).max(50).optional().default(20),
  }).optional(),
  ivRange: z.object({
    min: z.number().positive(),
    max: z.number().positive(),
    steps: z.number().int().min(5).max(50).optional().default(20),
  }).optional(),
});

const VaRSchema = z.object({
  positions: z.array(z.object({
    symbol: z.string().min(1).max(10),
    positionType: z.enum(['stock', 'option']),
    quantity: z.number().int(),
    currentValue: z.number().positive(),
    optionDetails: z.object({
      optionType: z.enum(['call', 'put']),
      strike: z.number().positive(),
      expiration: z.string().transform(s => new Date(s)),
      iv: z.number().positive(),
    }).optional(),
  })),
  params: z.object({
    confidenceLevel: z.number().min(0.9).max(0.99).optional().default(0.95),
    timeHorizonDays: z.number().int().min(1).max(30).optional().default(1),
    method: z.enum(['historical', 'parametric', 'montecarlo']).optional().default('parametric'),
    numSimulations: z.number().int().min(1000).max(100000).optional().default(10000),
  }),
});

const GreeksVizSchema = z.object({
  symbol: z.string().min(1).max(10),
  spotPrice: z.number().positive(),
  strike: z.number().positive(),
  expiration: z.string().transform(s => new Date(s)),
  optionType: z.enum(['call', 'put']),
  iv: z.number().positive(),
  xAxis: z.enum(['price', 'time', 'iv']),
  range: z.object({
    min: z.number(),
    max: z.number(),
    steps: z.number().int().min(10).max(100).optional().default(50),
  }).optional(),
});

/**
 * POST /api/pricing/simulation/montecarlo
 * Run Monte Carlo simulation for an option position
 */
router.post('/simulation/montecarlo', async (req: Request, res: Response) => {
  try {
    const parsed = MonteCarloSchema.parse(req.body);
    
    const position: Position = {
      symbol: parsed.position.symbol,
      optionType: parsed.position.optionType as OptionType,
      strike: parsed.position.strike,
      expiration: parsed.position.expiration,
      quantity: parsed.position.quantity,
      entryPrice: parsed.position.entryPrice,
      action: parsed.position.action,
      currentIV: parsed.position.currentIV,
    };
    
    const result = await runMonteCarloSimulation(position, parsed.currentPrice, parsed.params);
    
    res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to run Monte Carlo simulation',
    });
  }
});

/**
 * POST /api/pricing/simulation/whatif
 * Run what-if scenario analysis
 */
router.post('/simulation/whatif', async (req: Request, res: Response) => {
  try {
    const parsed = WhatIfSchema.parse(req.body);
    
    const position: Position = {
      symbol: parsed.position.symbol,
      optionType: parsed.position.optionType as OptionType,
      strike: parsed.position.strike,
      expiration: parsed.position.expiration,
      quantity: parsed.position.quantity,
      entryPrice: parsed.position.entryPrice,
      action: parsed.position.action,
      currentIV: parsed.position.currentIV,
    };
    
    const scenarios = parsed.scenarios || DEFAULT_SCENARIOS;
    const results = await runWhatIfAnalysis(position, parsed.currentPrice, scenarios);
    
    res.json({
      success: true,
      data: {
        position: {
          symbol: position.symbol,
          optionType: position.optionType,
          strike: position.strike,
          expiration: position.expiration.toISOString(),
          action: position.action,
        },
        currentPrice: parsed.currentPrice,
        scenarios: results,
      },
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to run what-if analysis',
    });
  }
});

/**
 * POST /api/pricing/simulation/sensitivity
 * Generate P/L sensitivity grid
 */
router.post('/simulation/sensitivity', async (req: Request, res: Response) => {
  try {
    const parsed = SensitivityGridSchema.parse(req.body);
    
    const position: Position = {
      symbol: parsed.position.symbol,
      optionType: parsed.position.optionType as OptionType,
      strike: parsed.position.strike,
      expiration: parsed.position.expiration,
      quantity: parsed.position.quantity,
      entryPrice: parsed.position.entryPrice,
      action: parsed.position.action,
      currentIV: parsed.position.currentIV,
    };
    
    const priceRange = parsed.priceRange || {
      min: parsed.currentPrice * 0.8,
      max: parsed.currentPrice * 1.2,
      steps: 20,
    };
    
    const ivRange = parsed.ivRange || {
      min: (parsed.position.currentIV || 0.30) * 0.5,
      max: (parsed.position.currentIV || 0.30) * 1.5,
      steps: 20,
    };
    
    const grid = await generateSensitivityGrid(position, parsed.currentPrice, priceRange, ivRange);
    
    res.json({
      success: true,
      data: grid,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to generate sensitivity grid',
    });
  }
});

/**
 * POST /api/pricing/risk/var
 * Calculate Value-at-Risk for a portfolio
 */
router.post('/risk/var', async (req: Request, res: Response) => {
  try {
    const parsed = VaRSchema.parse(req.body);
    
    const positions: PortfolioPosition[] = parsed.positions.map(p => ({
      symbol: p.symbol,
      positionType: p.positionType,
      quantity: p.quantity,
      currentValue: p.currentValue,
      optionDetails: p.optionDetails ? {
        optionType: p.optionDetails.optionType as OptionType,
        strike: p.optionDetails.strike,
        expiration: p.optionDetails.expiration,
        iv: p.optionDetails.iv,
      } : undefined,
    }));
    
    const result = await calculatePortfolioVaR(positions, parsed.params as VaRParams);
    
    res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to calculate VaR',
    });
  }
});

/**
 * POST /api/pricing/risk/stress-test
 * Run stress tests on a portfolio
 */
router.post('/risk/stress-test', async (req: Request, res: Response) => {
  try {
    const parsed = VaRSchema.parse(req.body);
    
    const positions: PortfolioPosition[] = parsed.positions.map(p => ({
      symbol: p.symbol,
      positionType: p.positionType,
      quantity: p.quantity,
      currentValue: p.currentValue,
      optionDetails: p.optionDetails ? {
        optionType: p.optionDetails.optionType as OptionType,
        strike: p.optionDetails.strike,
        expiration: p.optionDetails.expiration,
        iv: p.optionDetails.iv,
      } : undefined,
    }));
    
    const results = await runStressTests(positions);
    
    res.json({
      success: true,
      data: {
        portfolioValue: positions.reduce((sum, p) => sum + p.currentValue, 0),
        stressTests: results,
      },
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to run stress tests',
    });
  }
});

/**
 * POST /api/pricing/risk/metrics
 * Calculate comprehensive risk metrics for a portfolio
 */
router.post('/risk/metrics', async (req: Request, res: Response) => {
  try {
    const parsed = VaRSchema.parse(req.body);
    
    const positions: PortfolioPosition[] = parsed.positions.map(p => ({
      symbol: p.symbol,
      positionType: p.positionType,
      quantity: p.quantity,
      currentValue: p.currentValue,
      optionDetails: p.optionDetails ? {
        optionType: p.optionDetails.optionType as OptionType,
        strike: p.optionDetails.strike,
        expiration: p.optionDetails.expiration,
        iv: p.optionDetails.iv,
      } : undefined,
    }));
    
    const metrics = await calculateRiskMetrics(positions);
    
    res.json({
      success: true,
      data: {
        portfolioValue: positions.reduce((sum, p) => sum + p.currentValue, 0),
        metrics: {
          var95: { value: metrics.var95, percent: (metrics.var95 / positions.reduce((sum, p) => sum + p.currentValue, 0)) * 100 },
          var99: { value: metrics.var99, percent: (metrics.var99 / positions.reduce((sum, p) => sum + p.currentValue, 0)) * 100 },
          cvar95: { value: metrics.cvar95, percent: (metrics.cvar95 / positions.reduce((sum, p) => sum + p.currentValue, 0)) * 100 },
          cvar99: { value: metrics.cvar99, percent: (metrics.cvar99 / positions.reduce((sum, p) => sum + p.currentValue, 0)) * 100 },
          maxDrawdown: { value: metrics.maxDrawdown, percent: metrics.maxDrawdown * 100 },
          sharpeRatio: metrics.sharpeRatio,
          sortinoRatio: metrics.sortinoRatio,
          beta: metrics.beta,
          correlation: metrics.correlation,
        },
      },
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to calculate risk metrics',
    });
  }
});

/**
 * GET /api/pricing/greeks/education
 * Get Greeks educational content
 */
router.get('/greeks/education', (_req: Request, res: Response) => {
  try {
    const education = getGreeksEducation();
    
    res.json({
      success: true,
      data: education,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to get Greeks education',
    });
  }
});

/**
 * GET /api/pricing/greeks/education/:greek
 * Get education for a specific Greek
 */
router.get('/greeks/education/:greek', (req: Request, res: Response) => {
  try {
    const { greek } = req.params;
    const education = getGreeksEducation(greek);
    
    res.json({
      success: true,
      data: education,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to get Greek education',
    });
  }
});

/**
 * POST /api/pricing/greeks/visualize
 * Generate Greeks visualization data
 */
router.post('/greeks/visualize', async (req: Request, res: Response) => {
  try {
    const parsed = GreeksVizSchema.parse(req.body);
    
    let result;
    
    if (parsed.xAxis === 'price') {
      const priceRange = parsed.range || {
        min: parsed.spotPrice * 0.8,
        max: parsed.spotPrice * 1.2,
        steps: 50,
      };
      result = await generateGreeksVsPrice(
        parsed.symbol,
        parsed.strike,
        parsed.expiration,
        parsed.optionType as OptionType,
        parsed.iv,
        priceRange
      );
    } else if (parsed.xAxis === 'time') {
      const daysToExpiry = (parsed.expiration.getTime() - Date.now()) / (24 * 60 * 60 * 1000);
      const daysArray: number[] = [];
      const steps = parsed.range?.steps || 50;
      for (let i = 0; i < steps; i++) {
        daysArray.push(Math.max(1, Math.floor(daysToExpiry * (i / (steps - 1)))));
      }
      result = await generateGreeksVsTime(
        parsed.symbol,
        parsed.spotPrice,
        parsed.strike,
        parsed.optionType as OptionType,
        parsed.iv,
        daysArray.reverse()
      );
    } else {
      const ivRange = parsed.range || {
        min: parsed.iv * 0.5,
        max: parsed.iv * 1.5,
        steps: 50,
      };
      result = await generateGreeksVsIV(
        parsed.symbol,
        parsed.spotPrice,
        parsed.strike,
        parsed.expiration,
        parsed.optionType as OptionType,
        ivRange
      );
    }
    
    res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to generate Greeks visualization',
    });
  }
});

/**
 * POST /api/pricing/greeks/snapshot
 * Get Greek snapshot with interpretation
 */
router.post('/greeks/snapshot', async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      symbol: z.string().min(1).max(10),
      spotPrice: z.number().positive(),
      strike: z.number().positive(),
      expiration: z.string().transform(s => new Date(s)),
      optionType: z.enum(['call', 'put']),
      iv: z.number().positive(),
      quantity: z.number().int().positive().optional().default(1),
    });
    
    const parsed = schema.parse(req.body);
    
    const snapshot = await getGreekSnapshot(
      parsed.symbol,
      parsed.spotPrice,
      parsed.strike,
      parsed.expiration,
      parsed.optionType as OptionType,
      parsed.iv,
      parsed.quantity
    );
    
    res.json({
      success: true,
      data: snapshot,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to get Greek snapshot',
    });
  }
});

/**
 * POST /api/pricing/greeks/surface
 * Generate Greeks surface data for 3D visualization
 */
router.post('/greeks/surface', async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      symbol: z.string().min(1).max(10),
      strike: z.number().positive(),
      optionType: z.enum(['call', 'put']),
      iv: z.number().positive(),
      spotPrice: z.number().positive(),
      priceRange: z.object({
        min: z.number().positive(),
        max: z.number().positive(),
        steps: z.number().int().min(5).max(30).optional().default(15),
      }).optional(),
      timeRange: z.object({
        minDays: z.number().int().min(1),
        maxDays: z.number().int().max(365),
        steps: z.number().int().min(5).max(30).optional().default(15),
      }).optional(),
    });
    
    const parsed = schema.parse(req.body);
    
    const priceRange = parsed.priceRange || {
      min: parsed.spotPrice * 0.8,
      max: parsed.spotPrice * 1.2,
      steps: 15,
    };
    
    const timeRange = parsed.timeRange || {
      minDays: 1,
      maxDays: 60,
      steps: 15,
    };
    
    const surface = await generateGreeksSurface(
      parsed.symbol,
      parsed.strike,
      parsed.optionType as OptionType,
      parsed.iv,
      priceRange,
      timeRange
    );
    
    res.json({
      success: true,
      data: surface,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to generate Greeks surface',
    });
  }
});

export default router;
