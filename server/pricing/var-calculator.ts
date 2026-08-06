/**
 * Value-at-Risk (VaR) Calculator
 * 
 * Portfolio risk analysis including:
 * - Historical VaR
 * - Parametric (variance-covariance) VaR
 * - Monte Carlo VaR
 * - Conditional VaR (Expected Shortfall)
 * - Stress testing
 */

import { pricingEngine, OptionType, OptionStyle } from './pricing-engine';
import { normalCDF, normalInverseCDF } from './math-utils';
import { getInterpolatedRateSync } from './yield-curve-service';
import { getDividendYield } from './dividend-service';
import { marketDataService } from '../market-data';

export interface PortfolioPosition {
  symbol: string;
  positionType: 'stock' | 'option';
  quantity: number;
  currentValue: number;
  optionDetails?: {
    optionType: OptionType;
    strike: number;
    expiration: Date;
    iv: number;
  };
}

export interface VaRParams {
  confidenceLevel: number;
  timeHorizonDays: number;
  method: 'historical' | 'parametric' | 'montecarlo';
  numSimulations?: number;
}

export interface VaRResult {
  method: string;
  confidenceLevel: number;
  timeHorizonDays: number;
  portfolioValue: number;
  valueAtRisk: number;
  varPercent: number;
  expectedShortfall: number;
  esPercent: number;
  worstCase: number;
  bestCase: number;
  breakdown?: Array<{
    symbol: string;
    componentVaR: number;
    marginalVaR: number;
    percentContribution: number;
  }>;
}

export interface StressTestResult {
  scenario: string;
  description: string;
  portfolioImpact: number;
  impactPercent: number;
  positionImpacts: Array<{
    symbol: string;
    impact: number;
    impactPercent: number;
  }>;
}

export interface RiskMetrics {
  var95: number;
  var99: number;
  cvar95: number;
  cvar99: number;
  maxDrawdown: number;
  sharpeRatio?: number;
  sortinoRatio?: number;
  beta?: number;
  correlation?: number;
}

async function getHistoricalReturns(
  symbol: string,
  lookbackDays: number = 252
): Promise<number[]> {
  try {
    const data = await marketDataService.getHistoricalData(symbol, '1y');
    
    if (!data || data.length < 2) {
      return [];
    }
    
    const prices = data.slice(-lookbackDays - 1).map(d => d.close);
    const returns: number[] = [];
    
    for (let i = 1; i < prices.length; i++) {
      returns.push(Math.log(prices[i] / prices[i - 1]));
    }
    
    return returns;
  } catch (error) {
    console.error(`Failed to get historical returns for ${symbol}:`, error);
    return [];
  }
}

function calculateHistoricalVaR(
  returns: number[],
  portfolioValue: number,
  confidenceLevel: number,
  timeHorizonDays: number
): { var: number; es: number } {
  if (returns.length === 0) {
    return { var: 0, es: 0 };
  }
  
  const scaledReturns = returns.map(r => r * Math.sqrt(timeHorizonDays));
  
  const sorted = [...scaledReturns].sort((a, b) => a - b);
  
  const varIndex = Math.floor((1 - confidenceLevel) * sorted.length);
  const varReturn = sorted[varIndex];
  
  const tailReturns = sorted.slice(0, varIndex + 1);
  const esReturn = tailReturns.reduce((a, b) => a + b, 0) / tailReturns.length;
  
  return {
    var: Math.abs(varReturn * portfolioValue),
    es: Math.abs(esReturn * portfolioValue),
  };
}

function calculateParametricVaR(
  returns: number[],
  portfolioValue: number,
  confidenceLevel: number,
  timeHorizonDays: number
): { var: number; es: number } {
  if (returns.length === 0) {
    return { var: 0, es: 0 };
  }
  
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((acc, r) => acc + (r - mean) ** 2, 0) / (returns.length - 1);
  const stdDev = Math.sqrt(variance);
  
  const scaledStdDev = stdDev * Math.sqrt(timeHorizonDays);
  
  const zScore = normalInverseCDF(1 - confidenceLevel);
  
  const varValue = Math.abs(zScore * scaledStdDev * portfolioValue);
  
  const pdf = Math.exp(-0.5 * zScore * zScore) / Math.sqrt(2 * Math.PI);
  const esValue = (pdf / (1 - confidenceLevel)) * scaledStdDev * portfolioValue;
  
  return {
    var: varValue,
    es: esValue,
  };
}

function generateCorrelatedReturns(
  means: number[],
  stdDevs: number[],
  correlationMatrix: number[][],
  numSimulations: number
): number[][] {
  const n = means.length;
  
  const L = choleskyDecomposition(correlationMatrix);
  
  const simulations: number[][] = [];
  
  for (let sim = 0; sim < numSimulations; sim++) {
    const z: number[] = [];
    for (let i = 0; i < n; i++) {
      z.push(normalInverseCDF(Math.random()));
    }
    
    const correlatedZ: number[] = [];
    for (let i = 0; i < n; i++) {
      let sum = 0;
      for (let j = 0; j <= i; j++) {
        sum += L[i][j] * z[j];
      }
      correlatedZ.push(sum);
    }
    
    const returns: number[] = [];
    for (let i = 0; i < n; i++) {
      returns.push(means[i] + stdDevs[i] * correlatedZ[i]);
    }
    
    simulations.push(returns);
  }
  
  return simulations;
}

function choleskyDecomposition(matrix: number[][]): number[][] {
  const n = matrix.length;
  const L: number[][] = Array(n).fill(null).map(() => Array(n).fill(0));
  
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = 0;
      
      if (i === j) {
        for (let k = 0; k < j; k++) {
          sum += L[j][k] * L[j][k];
        }
        L[j][j] = Math.sqrt(Math.max(0, matrix[j][j] - sum));
      } else {
        for (let k = 0; k < j; k++) {
          sum += L[i][k] * L[j][k];
        }
        L[i][j] = L[j][j] !== 0 ? (matrix[i][j] - sum) / L[j][j] : 0;
      }
    }
  }
  
  return L;
}

async function calculateMonteCarloVaR(
  positions: PortfolioPosition[],
  confidenceLevel: number,
  timeHorizonDays: number,
  numSimulations: number = 10000
): Promise<{ var: number; es: number; simulations: number[] }> {
  const portfolioReturns: number[] = [];
  const T = timeHorizonDays / 365;
  
  const positionData: Array<{
    position: PortfolioPosition;
    returns: number[];
    mean: number;
    stdDev: number;
  }> = [];
  
  for (const position of positions) {
    const returns = await getHistoricalReturns(position.symbol);
    if (returns.length > 0) {
      const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
      const variance = returns.reduce((acc, r) => acc + (r - mean) ** 2, 0) / (returns.length - 1);
      positionData.push({
        position,
        returns,
        mean: mean * timeHorizonDays,
        stdDev: Math.sqrt(variance * timeHorizonDays),
      });
    }
  }
  
  if (positionData.length === 0) {
    return { var: 0, es: 0, simulations: [] };
  }
  
  const n = positionData.length;
  const correlationMatrix: number[][] = Array(n).fill(null).map(() => Array(n).fill(1));
  
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const minLen = Math.min(positionData[i].returns.length, positionData[j].returns.length);
      const r1 = positionData[i].returns.slice(-minLen);
      const r2 = positionData[j].returns.slice(-minLen);
      
      const mean1 = r1.reduce((a, b) => a + b, 0) / r1.length;
      const mean2 = r2.reduce((a, b) => a + b, 0) / r2.length;
      
      let covariance = 0;
      let var1 = 0;
      let var2 = 0;
      
      for (let k = 0; k < minLen; k++) {
        covariance += (r1[k] - mean1) * (r2[k] - mean2);
        var1 += (r1[k] - mean1) ** 2;
        var2 += (r2[k] - mean2) ** 2;
      }
      
      const correlation = covariance / (Math.sqrt(var1) * Math.sqrt(var2)) || 0;
      correlationMatrix[i][j] = correlation;
      correlationMatrix[j][i] = correlation;
    }
  }
  
  const simulations = generateCorrelatedReturns(
    positionData.map(p => p.mean),
    positionData.map(p => p.stdDev),
    correlationMatrix,
    numSimulations
  );
  
  const totalValue = positions.reduce((sum, p) => sum + p.currentValue, 0);
  
  for (const sim of simulations) {
    let portfolioReturn = 0;
    for (let i = 0; i < positionData.length; i++) {
      const weight = positionData[i].position.currentValue / totalValue;
      portfolioReturn += weight * sim[i];
    }
    portfolioReturns.push(portfolioReturn * totalValue);
  }
  
  portfolioReturns.sort((a, b) => a - b);
  
  const varIndex = Math.floor((1 - confidenceLevel) * portfolioReturns.length);
  const varValue = Math.abs(portfolioReturns[varIndex]);
  
  const tailReturns = portfolioReturns.slice(0, varIndex + 1);
  const esValue = Math.abs(tailReturns.reduce((a, b) => a + b, 0) / tailReturns.length);
  
  return {
    var: varValue,
    es: esValue,
    simulations: portfolioReturns,
  };
}

export async function calculatePortfolioVaR(
  positions: PortfolioPosition[],
  params: VaRParams
): Promise<VaRResult> {
  const { confidenceLevel, timeHorizonDays, method, numSimulations = 10000 } = params;
  
  const portfolioValue = positions.reduce((sum, p) => sum + p.currentValue, 0);
  
  let varValue = 0;
  let esValue = 0;
  let worstCase = 0;
  let bestCase = 0;
  
  if (method === 'montecarlo') {
    const result = await calculateMonteCarloVaR(positions, confidenceLevel, timeHorizonDays, numSimulations);
    varValue = result.var;
    esValue = result.es;
    
    if (result.simulations.length > 0) {
      worstCase = result.simulations[0];
      bestCase = result.simulations[result.simulations.length - 1];
    }
  } else {
    const allReturns: number[][] = [];
    const weights: number[] = [];
    
    for (const position of positions) {
      const returns = await getHistoricalReturns(position.symbol);
      if (returns.length > 0) {
        allReturns.push(returns);
        weights.push(position.currentValue / portfolioValue);
      }
    }
    
    if (allReturns.length > 0) {
      const minLen = Math.min(...allReturns.map(r => r.length));
      const portfolioReturns: number[] = [];
      
      for (let i = 0; i < minLen; i++) {
        let portReturn = 0;
        for (let j = 0; j < allReturns.length; j++) {
          portReturn += weights[j] * allReturns[j][allReturns[j].length - minLen + i];
        }
        portfolioReturns.push(portReturn);
      }
      
      if (method === 'historical') {
        const result = calculateHistoricalVaR(portfolioReturns, portfolioValue, confidenceLevel, timeHorizonDays);
        varValue = result.var;
        esValue = result.es;
      } else {
        const result = calculateParametricVaR(portfolioReturns, portfolioValue, confidenceLevel, timeHorizonDays);
        varValue = result.var;
        esValue = result.es;
      }
      
      const sorted = [...portfolioReturns].sort((a, b) => a - b);
      worstCase = sorted[0] * portfolioValue * Math.sqrt(timeHorizonDays);
      bestCase = sorted[sorted.length - 1] * portfolioValue * Math.sqrt(timeHorizonDays);
    }
  }
  
  const breakdown = await calculateVaRBreakdown(positions, confidenceLevel, timeHorizonDays);
  
  return {
    method,
    confidenceLevel,
    timeHorizonDays,
    portfolioValue,
    valueAtRisk: varValue,
    varPercent: (varValue / portfolioValue) * 100,
    expectedShortfall: esValue,
    esPercent: (esValue / portfolioValue) * 100,
    worstCase,
    bestCase,
    breakdown,
  };
}

async function calculateVaRBreakdown(
  positions: PortfolioPosition[],
  confidenceLevel: number,
  timeHorizonDays: number
): Promise<Array<{
  symbol: string;
  componentVaR: number;
  marginalVaR: number;
  percentContribution: number;
}>> {
  const breakdown: Array<{
    symbol: string;
    componentVaR: number;
    marginalVaR: number;
    percentContribution: number;
  }> = [];
  
  const portfolioValue = positions.reduce((sum, p) => sum + p.currentValue, 0);
  
  for (const position of positions) {
    const returns = await getHistoricalReturns(position.symbol);
    if (returns.length > 0) {
      const result = calculateParametricVaR(returns, position.currentValue, confidenceLevel, timeHorizonDays);
      breakdown.push({
        symbol: position.symbol,
        componentVaR: result.var,
        marginalVaR: result.var / position.currentValue,
        percentContribution: (result.var / portfolioValue) * 100,
      });
    }
  }
  
  return breakdown;
}

export async function runStressTests(
  positions: PortfolioPosition[]
): Promise<StressTestResult[]> {
  const scenarios = [
    { name: '2008 Financial Crisis', priceChange: -0.50, ivChange: 0.80 },
    { name: 'COVID Crash (March 2020)', priceChange: -0.34, ivChange: 0.60 },
    { name: 'Black Monday (1987)', priceChange: -0.22, ivChange: 1.00 },
    { name: 'Flash Crash (2010)', priceChange: -0.10, ivChange: 0.40 },
    { name: 'Moderate Correction', priceChange: -0.10, ivChange: 0.20 },
    { name: 'Sharp Rally', priceChange: 0.15, ivChange: -0.30 },
    { name: 'Interest Rate Shock (+200bp)', priceChange: -0.08, ivChange: 0.15 },
    { name: 'Stagflation', priceChange: -0.20, ivChange: 0.35 },
  ];
  
  const results: StressTestResult[] = [];
  
  for (const scenario of scenarios) {
    let totalImpact = 0;
    const positionImpacts: Array<{ symbol: string; impact: number; impactPercent: number }> = [];
    
    for (const position of positions) {
      let impact = 0;
      
      if (position.positionType === 'stock') {
        impact = position.currentValue * scenario.priceChange;
      } else if (position.positionType === 'option' && position.optionDetails) {
        const newPrice = position.currentValue * (1 + scenario.priceChange);
        const newIV = position.optionDetails.iv * (1 + scenario.ivChange);
        
        try {
          await pricingEngine.initialize();
          
          const result = await pricingEngine.priceOption(
            position.symbol,
            newPrice,
            position.optionDetails.strike,
            position.optionDetails.expiration,
            newIV,
            position.optionDetails.optionType,
            OptionStyle.AMERICAN
          );
          
          const newValue = result.price * 100 * Math.abs(position.quantity);
          impact = newValue - position.currentValue;
        } catch (error) {
          impact = position.currentValue * scenario.priceChange;
        }
      }
      
      totalImpact += impact;
      positionImpacts.push({
        symbol: position.symbol,
        impact,
        impactPercent: (impact / position.currentValue) * 100,
      });
    }
    
    const portfolioValue = positions.reduce((sum, p) => sum + p.currentValue, 0);
    
    results.push({
      scenario: scenario.name,
      description: `${scenario.priceChange >= 0 ? '+' : ''}${(scenario.priceChange * 100).toFixed(0)}% price, ${scenario.ivChange >= 0 ? '+' : ''}${(scenario.ivChange * 100).toFixed(0)}% IV`,
      portfolioImpact: totalImpact,
      impactPercent: (totalImpact / portfolioValue) * 100,
      positionImpacts,
    });
  }
  
  return results;
}

export async function calculateRiskMetrics(
  positions: PortfolioPosition[],
  benchmarkSymbol: string = 'SPY'
): Promise<RiskMetrics> {
  const var95 = await calculatePortfolioVaR(positions, {
    confidenceLevel: 0.95,
    timeHorizonDays: 1,
    method: 'parametric',
  });
  
  const var99 = await calculatePortfolioVaR(positions, {
    confidenceLevel: 0.99,
    timeHorizonDays: 1,
    method: 'parametric',
  });
  
  const portfolioValue = positions.reduce((sum, p) => sum + p.currentValue, 0);
  const weights: number[] = [];
  const allReturns: number[][] = [];
  
  for (const position of positions) {
    const returns = await getHistoricalReturns(position.symbol);
    if (returns.length > 0) {
      allReturns.push(returns);
      weights.push(position.currentValue / portfolioValue);
    }
  }
  
  const benchmarkReturns = await getHistoricalReturns(benchmarkSymbol);
  
  let beta: number | undefined;
  let correlation: number | undefined;
  let sharpeRatio: number | undefined;
  let sortinoRatio: number | undefined;
  let maxDrawdown = 0;
  
  if (allReturns.length > 0) {
    const minLen = Math.min(...allReturns.map(r => r.length));
    const portfolioReturns: number[] = [];
    
    for (let i = 0; i < minLen; i++) {
      let portReturn = 0;
      for (let j = 0; j < allReturns.length; j++) {
        portReturn += weights[j] * allReturns[j][allReturns[j].length - minLen + i];
      }
      portfolioReturns.push(portReturn);
    }
    
    const meanReturn = portfolioReturns.reduce((a, b) => a + b, 0) / portfolioReturns.length;
    const variance = portfolioReturns.reduce((acc, r) => acc + (r - meanReturn) ** 2, 0) / (portfolioReturns.length - 1);
    const stdDev = Math.sqrt(variance);
    
    const riskFreeRate = getInterpolatedRateSync(1) || 0.05;
    const dailyRf = riskFreeRate / 252;
    
    sharpeRatio = stdDev > 0 ? ((meanReturn - dailyRf) / stdDev) * Math.sqrt(252) : undefined;
    
    const negativeReturns = portfolioReturns.filter(r => r < 0);
    if (negativeReturns.length > 0) {
      const downsideVariance = negativeReturns.reduce((acc, r) => acc + r ** 2, 0) / negativeReturns.length;
      const downsideStdDev = Math.sqrt(downsideVariance);
      sortinoRatio = downsideStdDev > 0 ? ((meanReturn - dailyRf) / downsideStdDev) * Math.sqrt(252) : undefined;
    }
    
    let peak = 1;
    let value = 1;
    for (const ret of portfolioReturns) {
      value *= (1 + ret);
      if (value > peak) peak = value;
      const drawdown = (peak - value) / peak;
      if (drawdown > maxDrawdown) maxDrawdown = drawdown;
    }
    
    if (benchmarkReturns.length > 0) {
      const benchMinLen = Math.min(portfolioReturns.length, benchmarkReturns.length);
      const portSlice = portfolioReturns.slice(-benchMinLen);
      const benchSlice = benchmarkReturns.slice(-benchMinLen);
      
      const portMean = portSlice.reduce((a, b) => a + b, 0) / portSlice.length;
      const benchMean = benchSlice.reduce((a, b) => a + b, 0) / benchSlice.length;
      
      let covariance = 0;
      let portVar = 0;
      let benchVar = 0;
      
      for (let i = 0; i < benchMinLen; i++) {
        covariance += (portSlice[i] - portMean) * (benchSlice[i] - benchMean);
        portVar += (portSlice[i] - portMean) ** 2;
        benchVar += (benchSlice[i] - benchMean) ** 2;
      }
      
      if (benchVar > 0) {
        beta = covariance / benchVar;
        correlation = covariance / (Math.sqrt(portVar) * Math.sqrt(benchVar));
      }
    }
  }
  
  return {
    var95: var95.valueAtRisk,
    var99: var99.valueAtRisk,
    cvar95: var95.expectedShortfall,
    cvar99: var99.expectedShortfall,
    maxDrawdown,
    sharpeRatio,
    sortinoRatio,
    beta,
    correlation,
  };
}

export const varCalculator = {
  calculatePortfolioVaR,
  runStressTests,
  calculateRiskMetrics,
};
