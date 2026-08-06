import { marketDataService } from '../market-data';

export interface HVResult {
  symbol: string;
  period: number;
  annualizedHV: number;
  dailyHV: number;
  dataPoints: number;
  startDate: string;
  endDate: string;
}

export interface VolatilityCone {
  symbol: string;
  periods: number[];
  percentiles: {
    p10: number[];
    p25: number[];
    p50: number[];
    p75: number[];
    p90: number[];
  };
  current: number[];
}

export interface IVHVRatio {
  symbol: string;
  impliedVol: number;
  historicalVol: number;
  ratio: number;
  interpretation: 'expensive' | 'fair' | 'cheap';
}

export interface VolatilityStats {
  symbol: string;
  hv10: number;
  hv20: number;
  hv30: number;
  hv60: number;
  hv90: number;
  hvMax: number;
  hvMin: number;
  hvMean: number;
  hvStdDev: number;
}

const TRADING_DAYS_PER_YEAR = 252;

export function calculateLogReturns(prices: number[]): number[] {
  const returns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    if (prices[i] > 0 && prices[i - 1] > 0) {
      returns.push(Math.log(prices[i] / prices[i - 1]));
    }
  }
  return returns;
}

export function calculateStandardDeviation(values: number[]): number {
  if (values.length < 2) return 0;
  
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
  const variance = squaredDiffs.reduce((sum, v) => sum + v, 0) / (values.length - 1);
  
  return Math.sqrt(variance);
}

export function calculateHistoricalVolatility(
  prices: number[],
  period: number = 30
): number {
  if (prices.length < period + 1) {
    throw new Error(`Insufficient price data: need ${period + 1} points, got ${prices.length}`);
  }

  const recentPrices = prices.slice(-period - 1);
  const logReturns = calculateLogReturns(recentPrices);
  const dailyVol = calculateStandardDeviation(logReturns);
  
  return dailyVol * Math.sqrt(TRADING_DAYS_PER_YEAR);
}

export async function getHistoricalVolatility(
  symbol: string,
  period: number = 30
): Promise<HVResult> {
  const historicalData = await marketDataService.getHistoricalData(symbol, '1y');
  
  if (!historicalData || historicalData.length < period + 1) {
    throw new Error(`Insufficient historical data for ${symbol}`);
  }

  const prices = historicalData.map(d => d.close);
  const annualizedHV = calculateHistoricalVolatility(prices, period);
  
  return {
    symbol,
    period,
    annualizedHV,
    dailyHV: annualizedHV / Math.sqrt(TRADING_DAYS_PER_YEAR),
    dataPoints: historicalData.length,
    startDate: historicalData[0].timestamp,
    endDate: historicalData[historicalData.length - 1].timestamp,
  };
}

export async function getVolatilityStats(symbol: string): Promise<VolatilityStats> {
  const historicalData = await marketDataService.getHistoricalData(symbol, '1y');
  
  if (!historicalData || historicalData.length < 91) {
    throw new Error(`Insufficient historical data for ${symbol}: need 91+ days`);
  }

  const prices = historicalData.map(d => d.close);
  
  const hv10 = calculateHistoricalVolatility(prices, 10);
  const hv20 = calculateHistoricalVolatility(prices, 20);
  const hv30 = calculateHistoricalVolatility(prices, 30);
  const hv60 = calculateHistoricalVolatility(prices, 60);
  const hv90 = calculateHistoricalVolatility(prices, 90);

  const allHVs = calculateRollingHV(prices, 20);
  const hvMax = Math.max(...allHVs);
  const hvMin = Math.min(...allHVs);
  const hvMean = allHVs.reduce((sum, v) => sum + v, 0) / allHVs.length;
  const hvStdDev = calculateStandardDeviation(allHVs);

  return {
    symbol,
    hv10,
    hv20,
    hv30,
    hv60,
    hv90,
    hvMax,
    hvMin,
    hvMean,
    hvStdDev,
  };
}

function calculateRollingHV(prices: number[], window: number): number[] {
  const hvs: number[] = [];
  
  for (let i = window; i < prices.length; i++) {
    const windowPrices = prices.slice(i - window, i + 1);
    const logReturns = calculateLogReturns(windowPrices);
    const dailyVol = calculateStandardDeviation(logReturns);
    hvs.push(dailyVol * Math.sqrt(TRADING_DAYS_PER_YEAR));
  }
  
  return hvs;
}

function percentile(arr: number[], p: number): number {
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  
  if (lower === upper) return sorted[lower];
  
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (idx - lower);
}

export async function getVolatilityCone(symbol: string): Promise<VolatilityCone> {
  const historicalData = await marketDataService.getHistoricalData(symbol, '5y');
  
  if (!historicalData || historicalData.length < 252) {
    throw new Error(`Insufficient historical data for volatility cone: need 1+ year`);
  }

  const prices = historicalData.map(d => d.close);
  const periods = [10, 20, 30, 60, 90];
  
  const cone: VolatilityCone = {
    symbol,
    periods,
    percentiles: {
      p10: [],
      p25: [],
      p50: [],
      p75: [],
      p90: [],
    },
    current: [],
  };

  for (const period of periods) {
    const rollingHVs = calculateRollingHV(prices, period);
    
    if (rollingHVs.length > 0) {
      cone.percentiles.p10.push(percentile(rollingHVs, 10));
      cone.percentiles.p25.push(percentile(rollingHVs, 25));
      cone.percentiles.p50.push(percentile(rollingHVs, 50));
      cone.percentiles.p75.push(percentile(rollingHVs, 75));
      cone.percentiles.p90.push(percentile(rollingHVs, 90));
      cone.current.push(rollingHVs[rollingHVs.length - 1]);
    } else {
      cone.percentiles.p10.push(0);
      cone.percentiles.p25.push(0);
      cone.percentiles.p50.push(0);
      cone.percentiles.p75.push(0);
      cone.percentiles.p90.push(0);
      cone.current.push(0);
    }
  }

  return cone;
}

export function calculateIVHVRatio(
  impliedVol: number,
  historicalVol: number
): IVHVRatio {
  const ratio = impliedVol / historicalVol;
  
  let interpretation: 'expensive' | 'fair' | 'cheap';
  if (ratio > 1.2) {
    interpretation = 'expensive';
  } else if (ratio < 0.8) {
    interpretation = 'cheap';
  } else {
    interpretation = 'fair';
  }

  return {
    symbol: '',
    impliedVol,
    historicalVol,
    ratio,
    interpretation,
  };
}

export async function getIVHVAnalysis(
  symbol: string,
  impliedVol: number,
  hvPeriod: number = 20
): Promise<IVHVRatio> {
  const hvResult = await getHistoricalVolatility(symbol, hvPeriod);
  const analysis = calculateIVHVRatio(impliedVol, hvResult.annualizedHV);
  
  return {
    ...analysis,
    symbol,
  };
}

export interface VolatilityTermStructure {
  symbol: string;
  termStructure: Array<{
    daysToExpiry: number;
    iv: number;
    hv: number;
    ivhvRatio: number;
  }>;
}

export function analyzeVolatilityTerm(
  ivByExpiry: Array<{ daysToExpiry: number; iv: number }>,
  historicalVol: number
): VolatilityTermStructure['termStructure'] {
  return ivByExpiry.map(({ daysToExpiry, iv }) => ({
    daysToExpiry,
    iv,
    hv: historicalVol,
    ivhvRatio: iv / historicalVol,
  }));
}

export const historicalVolatilityService = {
  getHistoricalVolatility,
  getVolatilityStats,
  getVolatilityCone,
  calculateIVHVRatio,
  getIVHVAnalysis,
  calculateHistoricalVolatility,
  calculateLogReturns,
};

export default historicalVolatilityService;
