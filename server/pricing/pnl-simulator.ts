/**
 * P/L Simulator Service
 * 
 * Advanced profit/loss analysis for options positions including:
 * - Monte Carlo simulation with GBM
 * - What-if scenario analysis
 * - Probability distributions
 * - Greeks-based sensitivity analysis
 */

import { pricingEngine, OptionType, OptionStyle } from './pricing-engine';
import { calculateAllGreeks } from './greeks';
import { normalCDF, normalInverseCDF } from './math-utils';
import { getInterpolatedRateSync } from './yield-curve-service';
import { getDividendYield } from './dividend-service';

export interface Position {
  symbol: string;
  optionType: OptionType;
  strike: number;
  expiration: Date;
  quantity: number;
  entryPrice: number;
  action: 'long' | 'short';
  currentIV?: number;
}

export interface SimulationParams {
  numSimulations: number;
  timeHorizonDays: number;
  volatilityOverride?: number;
  confidenceLevel?: number;
}

export interface MonteCarloResult {
  symbol: string;
  currentPrice: number;
  timeHorizonDays: number;
  numSimulations: number;
  statistics: {
    meanPnL: number;
    medianPnL: number;
    stdDevPnL: number;
    minPnL: number;
    maxPnL: number;
    skewness: number;
    kurtosis: number;
  };
  percentiles: {
    p1: number;
    p5: number;
    p10: number;
    p25: number;
    p50: number;
    p75: number;
    p90: number;
    p95: number;
    p99: number;
  };
  probabilities: {
    profitProbability: number;
    lossProbability: number;
    breakEvenProbability: number;
  };
  distribution: Array<{ pnl: number; frequency: number }>;
  priceDistribution: Array<{ price: number; probability: number }>;
}

export interface WhatIfScenario {
  name: string;
  priceChange: number;
  ivChange: number;
  daysElapsed: number;
}

export interface WhatIfResult {
  scenario: WhatIfScenario;
  newUnderlyingPrice: number;
  newOptionValue: number;
  pnl: number;
  pnlPercent: number;
  newGreeks: {
    delta: number;
    gamma: number;
    theta: number;
    vega: number;
  };
}

export interface SensitivityGrid {
  priceAxis: number[];
  ivAxis: number[];
  pnlGrid: number[][];
  deltaGrid: number[][];
  gammaGrid: number[][];
}

function generateGBMPaths(
  S0: number,
  r: number,
  sigma: number,
  T: number,
  numPaths: number,
  numSteps: number = 252
): number[][] {
  const dt = T / numSteps;
  const drift = (r - 0.5 * sigma * sigma) * dt;
  const diffusion = sigma * Math.sqrt(dt);
  
  const paths: number[][] = [];
  
  for (let i = 0; i < numPaths; i++) {
    const path = [S0];
    let S = S0;
    
    for (let t = 0; t < numSteps; t++) {
      const z = normalInverseCDF(Math.random());
      S = S * Math.exp(drift + diffusion * z);
      path.push(S);
    }
    
    paths.push(path);
  }
  
  return paths;
}

function generateEndPrices(
  S0: number,
  r: number,
  sigma: number,
  T: number,
  numSimulations: number
): number[] {
  const drift = (r - 0.5 * sigma * sigma) * T;
  const diffusion = sigma * Math.sqrt(T);
  
  const prices: number[] = [];
  
  for (let i = 0; i < numSimulations; i++) {
    const z = normalInverseCDF(Math.random());
    const ST = S0 * Math.exp(drift + diffusion * z);
    prices.push(ST);
  }
  
  return prices;
}

function calculateOptionIntrinsicPnL(
  position: Position,
  endPrice: number,
  entryValue: number
): number {
  let intrinsicValue: number;
  
  if (position.optionType === 'call') {
    intrinsicValue = Math.max(0, endPrice - position.strike);
  } else {
    intrinsicValue = Math.max(0, position.strike - endPrice);
  }
  
  const exitValue = intrinsicValue * 100 * Math.abs(position.quantity);
  const costBasis = entryValue;
  
  if (position.action === 'long') {
    return exitValue - costBasis;
  } else {
    return costBasis - exitValue;
  }
}

async function calculateOptionPnLWithTimeValue(
  position: Position,
  simulatedPrice: number,
  remainingTimeYears: number,
  iv: number,
  entryValue: number
): Promise<number> {
  if (remainingTimeYears <= 0.001) {
    return calculateOptionIntrinsicPnL(position, simulatedPrice, entryValue);
  }
  
  try {
    const futureExpiration = new Date(Date.now() + remainingTimeYears * 365 * 24 * 60 * 60 * 1000);
    
    const result = await pricingEngine.priceOption(
      position.symbol,
      simulatedPrice,
      position.strike,
      futureExpiration,
      iv,
      position.optionType,
      OptionStyle.AMERICAN
    );
    
    const exitValue = result.price * 100 * Math.abs(position.quantity);
    
    if (position.action === 'long') {
      return exitValue - entryValue;
    } else {
      return entryValue - exitValue;
    }
  } catch (error) {
    return calculateOptionIntrinsicPnL(position, simulatedPrice, entryValue);
  }
}

function calculatePercentile(sortedArr: number[], p: number): number {
  const index = (p / 100) * (sortedArr.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;
  
  if (lower === upper) {
    return sortedArr[lower];
  }
  
  return sortedArr[lower] * (1 - weight) + sortedArr[upper] * weight;
}

function calculateSkewness(values: number[], mean: number, stdDev: number): number {
  if (stdDev === 0) return 0;
  
  const n = values.length;
  const sum = values.reduce((acc, v) => acc + Math.pow((v - mean) / stdDev, 3), 0);
  
  return (n / ((n - 1) * (n - 2))) * sum;
}

function calculateKurtosis(values: number[], mean: number, stdDev: number): number {
  if (stdDev === 0) return 0;
  
  const n = values.length;
  const sum = values.reduce((acc, v) => acc + Math.pow((v - mean) / stdDev, 4), 0);
  
  return ((n * (n + 1)) / ((n - 1) * (n - 2) * (n - 3))) * sum - 
         (3 * (n - 1) * (n - 1)) / ((n - 2) * (n - 3));
}

function createHistogram(
  values: number[], 
  numBins: number = 50
): Array<{ pnl: number; frequency: number }> {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const binWidth = (max - min) / numBins;
  
  const bins: number[] = new Array(numBins).fill(0);
  
  for (const value of values) {
    const binIndex = Math.min(Math.floor((value - min) / binWidth), numBins - 1);
    bins[binIndex]++;
  }
  
  return bins.map((count, i) => ({
    pnl: min + (i + 0.5) * binWidth,
    frequency: count / values.length,
  }));
}

export async function runMonteCarloSimulation(
  position: Position,
  currentPrice: number,
  params: SimulationParams
): Promise<MonteCarloResult> {
  const {
    numSimulations = 10000,
    timeHorizonDays,
    volatilityOverride,
    confidenceLevel = 0.95,
  } = params;
  
  await pricingEngine.initialize();
  
  const T = timeHorizonDays / 365;
  const r = getInterpolatedRateSync(T) || 0.05;
  const q = await getDividendYield(position.symbol);
  const sigma = volatilityOverride || position.currentIV || 0.30;
  
  const currentTimeToExpiry = (position.expiration.getTime() - Date.now()) / (365 * 24 * 60 * 60 * 1000);
  const remainingTimeAfterHorizon = Math.max(0, currentTimeToExpiry - T);
  
  const endPrices = generateEndPrices(currentPrice, r - q, sigma, T, numSimulations);
  
  const entryValue = position.entryPrice * 100 * Math.abs(position.quantity);
  
  const pnls: number[] = [];
  for (const price of endPrices) {
    const pnl = await calculateOptionPnLWithTimeValue(
      position,
      price,
      remainingTimeAfterHorizon,
      sigma,
      entryValue
    );
    pnls.push(pnl);
  }
  
  pnls.sort((a, b) => a - b);
  
  const mean = pnls.reduce((a, b) => a + b, 0) / pnls.length;
  const variance = pnls.reduce((acc, v) => acc + (v - mean) ** 2, 0) / (pnls.length - 1);
  const stdDev = Math.sqrt(variance);
  
  const profitable = pnls.filter(p => p > 0).length;
  const lossMaking = pnls.filter(p => p < 0).length;
  const breakEven = pnls.filter(p => Math.abs(p) < 1).length;
  
  const priceDistribution = createPriceDistribution(endPrices, 20);
  
  return {
    symbol: position.symbol,
    currentPrice,
    timeHorizonDays,
    numSimulations,
    statistics: {
      meanPnL: mean,
      medianPnL: calculatePercentile(pnls, 50),
      stdDevPnL: stdDev,
      minPnL: pnls[0],
      maxPnL: pnls[pnls.length - 1],
      skewness: calculateSkewness(pnls, mean, stdDev),
      kurtosis: calculateKurtosis(pnls, mean, stdDev),
    },
    percentiles: {
      p1: calculatePercentile(pnls, 1),
      p5: calculatePercentile(pnls, 5),
      p10: calculatePercentile(pnls, 10),
      p25: calculatePercentile(pnls, 25),
      p50: calculatePercentile(pnls, 50),
      p75: calculatePercentile(pnls, 75),
      p90: calculatePercentile(pnls, 90),
      p95: calculatePercentile(pnls, 95),
      p99: calculatePercentile(pnls, 99),
    },
    probabilities: {
      profitProbability: profitable / numSimulations,
      lossProbability: lossMaking / numSimulations,
      breakEvenProbability: breakEven / numSimulations,
    },
    distribution: createHistogram(pnls),
    priceDistribution,
  };
}

function createPriceDistribution(
  prices: number[],
  numBins: number
): Array<{ price: number; probability: number }> {
  const sorted = [...prices].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const binWidth = (max - min) / numBins;
  
  const bins: number[] = new Array(numBins).fill(0);
  
  for (const price of sorted) {
    const binIndex = Math.min(Math.floor((price - min) / binWidth), numBins - 1);
    bins[binIndex]++;
  }
  
  return bins.map((count, i) => ({
    price: min + (i + 0.5) * binWidth,
    probability: count / prices.length,
  }));
}

export async function runWhatIfAnalysis(
  position: Position,
  currentPrice: number,
  scenarios: WhatIfScenario[]
): Promise<WhatIfResult[]> {
  const results: WhatIfResult[] = [];
  
  await pricingEngine.initialize();
  
  const currentTimeToExpiry = (position.expiration.getTime() - Date.now()) / (365 * 24 * 60 * 60 * 1000);
  const currentIV = position.currentIV || 0.30;
  
  const entryValue = position.entryPrice * 100 * Math.abs(position.quantity);
  
  for (const scenario of scenarios) {
    const newPrice = currentPrice * (1 + scenario.priceChange / 100);
    const newIV = currentIV * (1 + scenario.ivChange / 100);
    const newTimeToExpiry = Math.max(0, currentTimeToExpiry - scenario.daysElapsed / 365);
    
    if (newTimeToExpiry <= 0) {
      let intrinsicValue: number;
      if (position.optionType === 'call') {
        intrinsicValue = Math.max(0, newPrice - position.strike);
      } else {
        intrinsicValue = Math.max(0, position.strike - newPrice);
      }
      
      const exitValue = intrinsicValue * 100 * Math.abs(position.quantity);
      const pnl = position.action === 'long' ? exitValue - entryValue : entryValue - exitValue;
      
      results.push({
        scenario,
        newUnderlyingPrice: newPrice,
        newOptionValue: intrinsicValue,
        pnl,
        pnlPercent: (pnl / entryValue) * 100,
        newGreeks: { delta: 0, gamma: 0, theta: 0, vega: 0 },
      });
      continue;
    }
    
    const newExpiration = new Date(Date.now() + newTimeToExpiry * 365 * 24 * 60 * 60 * 1000);
    
    try {
      const result = await pricingEngine.priceOption(
        position.symbol,
        newPrice,
        position.strike,
        newExpiration,
        newIV,
        position.optionType,
        OptionStyle.AMERICAN
      );
      
      const greeks = await pricingEngine.calculateGreeks(
        position.symbol,
        newPrice,
        position.strike,
        newExpiration,
        newIV,
        position.optionType
      );
      
      const newOptionValue = result.price;
      const exitValue = newOptionValue * 100 * Math.abs(position.quantity);
      const pnl = position.action === 'long' ? exitValue - entryValue : entryValue - exitValue;
      
      results.push({
        scenario,
        newUnderlyingPrice: newPrice,
        newOptionValue,
        pnl,
        pnlPercent: (pnl / entryValue) * 100,
        newGreeks: {
          delta: greeks.delta * Math.abs(position.quantity) * (position.action === 'long' ? 1 : -1),
          gamma: greeks.gamma * Math.abs(position.quantity),
          theta: greeks.theta * Math.abs(position.quantity) * (position.action === 'long' ? 1 : -1),
          vega: greeks.vega * Math.abs(position.quantity) * (position.action === 'long' ? 1 : -1),
        },
      });
    } catch (error) {
      console.error(`What-if analysis failed for scenario ${scenario.name}:`, error);
    }
  }
  
  return results;
}

export async function generateSensitivityGrid(
  position: Position,
  currentPrice: number,
  priceRange: { min: number; max: number; steps: number },
  ivRange: { min: number; max: number; steps: number }
): Promise<SensitivityGrid> {
  await pricingEngine.initialize();
  
  const priceAxis: number[] = [];
  const ivAxis: number[] = [];
  const pnlGrid: number[][] = [];
  const deltaGrid: number[][] = [];
  const gammaGrid: number[][] = [];
  
  const priceStep = (priceRange.max - priceRange.min) / (priceRange.steps - 1);
  const ivStep = (ivRange.max - ivRange.min) / (ivRange.steps - 1);
  
  for (let i = 0; i < priceRange.steps; i++) {
    priceAxis.push(priceRange.min + i * priceStep);
  }
  
  for (let j = 0; j < ivRange.steps; j++) {
    ivAxis.push(ivRange.min + j * ivStep);
  }
  
  const entryValue = position.entryPrice * 100 * Math.abs(position.quantity);
  
  for (let i = 0; i < priceRange.steps; i++) {
    const pnlRow: number[] = [];
    const deltaRow: number[] = [];
    const gammaRow: number[] = [];
    
    for (let j = 0; j < ivRange.steps; j++) {
      const price = priceAxis[i];
      const iv = ivAxis[j];
      
      try {
        const result = await pricingEngine.priceOption(
          position.symbol,
          price,
          position.strike,
          position.expiration,
          iv,
          position.optionType,
          OptionStyle.AMERICAN
        );
        
        const greeks = await pricingEngine.calculateGreeks(
          position.symbol,
          price,
          position.strike,
          position.expiration,
          iv,
          position.optionType
        );
        
        const exitValue = result.price * 100 * Math.abs(position.quantity);
        const pnl = position.action === 'long' ? exitValue - entryValue : entryValue - exitValue;
        
        pnlRow.push(pnl);
        deltaRow.push(greeks.delta * Math.abs(position.quantity) * (position.action === 'long' ? 1 : -1));
        gammaRow.push(greeks.gamma * Math.abs(position.quantity));
      } catch (error) {
        pnlRow.push(0);
        deltaRow.push(0);
        gammaRow.push(0);
      }
    }
    
    pnlGrid.push(pnlRow);
    deltaGrid.push(deltaRow);
    gammaGrid.push(gammaRow);
  }
  
  return {
    priceAxis,
    ivAxis,
    pnlGrid,
    deltaGrid,
    gammaGrid,
  };
}

export const DEFAULT_SCENARIOS: WhatIfScenario[] = [
  { name: 'Base Case', priceChange: 0, ivChange: 0, daysElapsed: 0 },
  { name: '+5% Price', priceChange: 5, ivChange: 0, daysElapsed: 0 },
  { name: '-5% Price', priceChange: -5, ivChange: 0, daysElapsed: 0 },
  { name: '+10% Price', priceChange: 10, ivChange: 0, daysElapsed: 0 },
  { name: '-10% Price', priceChange: -10, ivChange: 0, daysElapsed: 0 },
  { name: '+20% IV', priceChange: 0, ivChange: 20, daysElapsed: 0 },
  { name: '-20% IV', priceChange: 0, ivChange: -20, daysElapsed: 0 },
  { name: '7 Days Later', priceChange: 0, ivChange: 0, daysElapsed: 7 },
  { name: '14 Days Later', priceChange: 0, ivChange: 0, daysElapsed: 14 },
  { name: '30 Days Later', priceChange: 0, ivChange: 0, daysElapsed: 30 },
  { name: 'Bull Case (+10%, -10% IV)', priceChange: 10, ivChange: -10, daysElapsed: 7 },
  { name: 'Bear Case (-10%, +20% IV)', priceChange: -10, ivChange: 20, daysElapsed: 7 },
  { name: 'Vol Crush', priceChange: 0, ivChange: -30, daysElapsed: 1 },
  { name: 'Earnings Pop', priceChange: 8, ivChange: -40, daysElapsed: 1 },
];

export const pnlSimulator = {
  runMonteCarloSimulation,
  runWhatIfAnalysis,
  generateSensitivityGrid,
  DEFAULT_SCENARIOS,
};
