/**
 * Greeks Visualizer Service
 * 
 * Interactive visualization data for options Greeks education including:
 * - Greeks behavior across price/time/volatility
 * - Educational explanations
 * - Sensitivity charts
 * - Greeks surface plots
 */

import { pricingEngine, OptionType, OptionStyle } from './pricing-engine';
import { calculateAllGreeks } from './greeks';
import { getInterpolatedRateSync } from './yield-curve-service';

export interface GreekPoint {
  x: number;
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  rho: number;
}

export interface GreeksVisualization {
  xAxis: string;
  xLabel: string;
  yLabel: string;
  data: GreekPoint[];
  explanation: {
    delta: string;
    gamma: string;
    theta: string;
    vega: string;
    rho: string;
  };
}

export interface GreeksSurfaceData {
  xAxis: number[];
  yAxis: number[];
  deltaGrid: number[][];
  gammaGrid: number[][];
  thetaGrid: number[][];
  vegaGrid: number[][];
}

export interface GreeksEducation {
  name: string;
  symbol: string;
  definition: string;
  range: string;
  interpretation: string;
  formula: string;
  tradingImplications: string[];
  examples: Array<{
    scenario: string;
    effect: string;
  }>;
}

const GREEKS_EDUCATION: Record<string, GreeksEducation> = {
  delta: {
    name: 'Delta',
    symbol: 'Δ',
    definition: 'Measures the rate of change of option price with respect to changes in the underlying price.',
    range: 'Calls: 0 to 1, Puts: -1 to 0',
    interpretation: 'Represents the probability that the option will expire in-the-money (approximately) and the equivalent stock position.',
    formula: '∂V/∂S where V = option value, S = spot price',
    tradingImplications: [
      'A delta of 0.50 means the option moves $0.50 for every $1 move in the stock',
      'Delta can be used for hedging: 100 shares = 100 delta',
      'ATM options have delta near 0.50 (calls) or -0.50 (puts)',
      'Deep ITM options approach delta of 1 (calls) or -1 (puts)',
      'Deep OTM options approach delta of 0',
    ],
    examples: [
      { scenario: 'Stock rises $1, call delta = 0.60', effect: 'Option value increases ~$0.60' },
      { scenario: 'Stock drops $2, put delta = -0.45', effect: 'Put value increases ~$0.90' },
    ],
  },
  gamma: {
    name: 'Gamma',
    symbol: 'Γ',
    definition: 'Measures the rate of change of delta with respect to changes in the underlying price.',
    range: 'Always positive for long options (0 to ~0.10 typically)',
    interpretation: 'Shows how quickly delta changes. Higher gamma = more sensitive position to price moves.',
    formula: '∂²V/∂S² = ∂Δ/∂S',
    tradingImplications: [
      'Gamma is highest for ATM options near expiration',
      'Long gamma benefits from large price moves',
      'Short gamma suffers from large price moves (gamma risk)',
      'Gamma scalping: dynamically hedge delta to capture volatility',
      'Near expiration, gamma can spike dramatically for ATM options',
    ],
    examples: [
      { scenario: 'Gamma = 0.05, stock moves $1', effect: 'Delta changes by 0.05' },
      { scenario: 'Long straddle with high gamma', effect: 'Profits from big moves either direction' },
    ],
  },
  theta: {
    name: 'Theta',
    symbol: 'Θ',
    definition: 'Measures the rate of change of option price with respect to time (time decay).',
    range: 'Usually negative for long options (time works against buyers)',
    interpretation: 'Shows how much value the option loses per day if nothing else changes.',
    formula: '∂V/∂t where t = time to expiration',
    tradingImplications: [
      'Theta accelerates as expiration approaches (especially last 30 days)',
      'Option sellers collect theta (time decay works in their favor)',
      'ATM options have highest theta',
      'Weekends count as calendar days but markets are closed',
      'Theta is often quoted as daily decay amount',
    ],
    examples: [
      { scenario: 'Theta = -0.05 on a $2 option', effect: 'Option loses $0.05/day (~$5 per contract/day)' },
      { scenario: 'Selling weekly options', effect: 'Maximum theta capture in final week' },
    ],
  },
  vega: {
    name: 'Vega',
    symbol: 'ν (or κ)',
    definition: 'Measures the rate of change of option price with respect to changes in implied volatility.',
    range: 'Always positive for long options (higher IV = higher option value)',
    interpretation: 'Shows how much option value changes for a 1% change in IV.',
    formula: '∂V/∂σ where σ = implied volatility',
    tradingImplications: [
      'Vega is highest for ATM options with longer time to expiration',
      'Long vega benefits from increasing volatility',
      'IV crush after earnings hurts long vega positions',
      'Vega is expressed as change per 1% IV move (not 1 point)',
      'Calendar spreads are typically long vega on back month',
    ],
    examples: [
      { scenario: 'Vega = 0.15, IV rises 5%', effect: 'Option value increases ~$0.75' },
      { scenario: 'Buying options before earnings', effect: 'Paying for high IV with vega exposure' },
    ],
  },
  rho: {
    name: 'Rho',
    symbol: 'ρ',
    definition: 'Measures the rate of change of option price with respect to changes in interest rates.',
    range: 'Positive for calls, negative for puts',
    interpretation: 'Shows option sensitivity to interest rate changes. Usually minor impact.',
    formula: '∂V/∂r where r = risk-free rate',
    tradingImplications: [
      'Rho is more significant for LEAPS (long-dated options)',
      'Rising rates benefit call holders, hurt put holders',
      'Generally the least important Greek for short-term trading',
      'More relevant during periods of rapid rate changes',
      'Deep ITM calls have higher rho',
    ],
    examples: [
      { scenario: 'Rho = 0.25, rates rise 1%', effect: 'Call value increases ~$0.25' },
      { scenario: 'Fed raises rates', effect: 'LEAP calls slightly benefit' },
    ],
  },
};

export function getGreeksEducation(greek?: string): GreeksEducation | Record<string, GreeksEducation> {
  if (greek) {
    const key = greek.toLowerCase();
    if (key in GREEKS_EDUCATION) {
      return GREEKS_EDUCATION[key];
    }
    throw new Error(`Unknown Greek: ${greek}`);
  }
  return GREEKS_EDUCATION;
}

export async function generateGreeksVsPrice(
  symbol: string,
  strike: number,
  expiration: Date,
  optionType: OptionType,
  iv: number,
  priceRange: { min: number; max: number; steps: number }
): Promise<GreeksVisualization> {
  await pricingEngine.initialize();
  
  const data: GreekPoint[] = [];
  const priceStep = (priceRange.max - priceRange.min) / (priceRange.steps - 1);
  
  for (let i = 0; i < priceRange.steps; i++) {
    const spotPrice = priceRange.min + i * priceStep;
    
    try {
      const greeks = await pricingEngine.calculateGreeks(
        symbol,
        spotPrice,
        strike,
        expiration,
        iv,
        optionType
      );
      
      data.push({
        x: spotPrice,
        delta: greeks.delta,
        gamma: greeks.gamma,
        theta: greeks.theta,
        vega: greeks.vega,
        rho: greeks.rho,
      });
    } catch (error) {
      data.push({
        x: spotPrice,
        delta: 0,
        gamma: 0,
        theta: 0,
        vega: 0,
        rho: 0,
      });
    }
  }
  
  const moneyness = data.length > 0 ? data[Math.floor(data.length / 2)].delta : 0;
  const isCall = optionType === 'call';
  
  return {
    xAxis: 'price',
    xLabel: 'Underlying Price ($)',
    yLabel: 'Greek Value',
    data,
    explanation: {
      delta: isCall 
        ? 'Delta increases from 0 (far OTM) to 1 (deep ITM) as price rises above strike'
        : 'Delta decreases from 0 (far OTM) to -1 (deep ITM) as price falls below strike',
      gamma: 'Gamma peaks at the strike price (ATM) and decreases as the option moves ITM or OTM',
      theta: 'Theta is most negative at the strike (ATM) where time value is highest',
      vega: 'Vega is highest at the strike (ATM) where the option is most sensitive to IV changes',
      rho: isCall
        ? 'Rho is positive and increases as the option moves ITM'
        : 'Rho is negative and becomes more negative as the option moves ITM',
    },
  };
}

export async function generateGreeksVsTime(
  symbol: string,
  spotPrice: number,
  strike: number,
  optionType: OptionType,
  iv: number,
  daysToExpiration: number[],
): Promise<GreeksVisualization> {
  await pricingEngine.initialize();
  
  const data: GreekPoint[] = [];
  
  for (const days of daysToExpiration) {
    const expiration = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    
    try {
      const greeks = await pricingEngine.calculateGreeks(
        symbol,
        spotPrice,
        strike,
        expiration,
        iv,
        optionType
      );
      
      data.push({
        x: days,
        delta: greeks.delta,
        gamma: greeks.gamma,
        theta: greeks.theta,
        vega: greeks.vega,
        rho: greeks.rho,
      });
    } catch (error) {
      data.push({
        x: days,
        delta: 0,
        gamma: 0,
        theta: 0,
        vega: 0,
        rho: 0,
      });
    }
  }
  
  return {
    xAxis: 'time',
    xLabel: 'Days to Expiration',
    yLabel: 'Greek Value',
    data,
    explanation: {
      delta: 'Delta approaches 1 (ITM calls) or 0 (OTM calls) as expiration nears',
      gamma: 'Gamma increases dramatically near expiration for ATM options (gamma risk)',
      theta: 'Theta accelerates (more negative) as expiration approaches - time decay curve is exponential',
      vega: 'Vega decreases as expiration approaches - less time for volatility to impact price',
      rho: 'Rho decreases as expiration approaches - less time for rates to matter',
    },
  };
}

export async function generateGreeksVsIV(
  symbol: string,
  spotPrice: number,
  strike: number,
  expiration: Date,
  optionType: OptionType,
  ivRange: { min: number; max: number; steps: number }
): Promise<GreeksVisualization> {
  await pricingEngine.initialize();
  
  const data: GreekPoint[] = [];
  const ivStep = (ivRange.max - ivRange.min) / (ivRange.steps - 1);
  
  for (let i = 0; i < ivRange.steps; i++) {
    const iv = ivRange.min + i * ivStep;
    
    try {
      const greeks = await pricingEngine.calculateGreeks(
        symbol,
        spotPrice,
        strike,
        expiration,
        iv,
        optionType
      );
      
      data.push({
        x: iv * 100,
        delta: greeks.delta,
        gamma: greeks.gamma,
        theta: greeks.theta,
        vega: greeks.vega,
        rho: greeks.rho,
      });
    } catch (error) {
      data.push({
        x: iv * 100,
        delta: 0,
        gamma: 0,
        theta: 0,
        vega: 0,
        rho: 0,
      });
    }
  }
  
  return {
    xAxis: 'iv',
    xLabel: 'Implied Volatility (%)',
    yLabel: 'Greek Value',
    data,
    explanation: {
      delta: 'Higher IV pushes delta toward 0.5 for both calls and puts (more uncertainty)',
      gamma: 'Gamma decreases as IV increases (delta changes more gradually)',
      theta: 'Theta becomes more negative as IV increases (more time value to decay)',
      vega: 'Vega is relatively stable across IV levels but increases with higher IV',
      rho: 'Rho is minimally affected by IV changes',
    },
  };
}

export async function generateGreeksSurface(
  symbol: string,
  strike: number,
  optionType: OptionType,
  iv: number,
  priceRange: { min: number; max: number; steps: number },
  timeRange: { minDays: number; maxDays: number; steps: number }
): Promise<GreeksSurfaceData> {
  await pricingEngine.initialize();
  
  const xAxis: number[] = [];
  const yAxis: number[] = [];
  const deltaGrid: number[][] = [];
  const gammaGrid: number[][] = [];
  const thetaGrid: number[][] = [];
  const vegaGrid: number[][] = [];
  
  const priceStep = (priceRange.max - priceRange.min) / (priceRange.steps - 1);
  const timeStep = (timeRange.maxDays - timeRange.minDays) / (timeRange.steps - 1);
  
  for (let i = 0; i < priceRange.steps; i++) {
    xAxis.push(priceRange.min + i * priceStep);
  }
  
  for (let j = 0; j < timeRange.steps; j++) {
    yAxis.push(timeRange.minDays + j * timeStep);
  }
  
  for (let j = 0; j < timeRange.steps; j++) {
    const days = yAxis[j];
    const expiration = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    
    const deltaRow: number[] = [];
    const gammaRow: number[] = [];
    const thetaRow: number[] = [];
    const vegaRow: number[] = [];
    
    for (let i = 0; i < priceRange.steps; i++) {
      const spotPrice = xAxis[i];
      
      try {
        const greeks = await pricingEngine.calculateGreeks(
          symbol,
          spotPrice,
          strike,
          expiration,
          iv,
          optionType
        );
        
        deltaRow.push(greeks.delta);
        gammaRow.push(greeks.gamma);
        thetaRow.push(greeks.theta);
        vegaRow.push(greeks.vega);
      } catch (error) {
        deltaRow.push(0);
        gammaRow.push(0);
        thetaRow.push(0);
        vegaRow.push(0);
      }
    }
    
    deltaGrid.push(deltaRow);
    gammaGrid.push(gammaRow);
    thetaGrid.push(thetaRow);
    vegaGrid.push(vegaRow);
  }
  
  return {
    xAxis,
    yAxis,
    deltaGrid,
    gammaGrid,
    thetaGrid,
    vegaGrid,
  };
}

export interface GreekSnapshot {
  symbol: string;
  spotPrice: number;
  strike: number;
  expiration: Date;
  daysToExpiration: number;
  optionType: OptionType;
  iv: number;
  greeks: {
    delta: number;
    gamma: number;
    theta: number;
    vega: number;
    rho: number;
  };
  dollarGreeks: {
    delta: number;
    gamma: number;
    theta: number;
    vega: number;
  };
  interpretation: {
    moneyness: 'ITM' | 'ATM' | 'OTM';
    directionalBias: string;
    timeDecay: string;
    volatilitySensitivity: string;
    hedgeRatio: string;
  };
}

export async function getGreekSnapshot(
  symbol: string,
  spotPrice: number,
  strike: number,
  expiration: Date,
  optionType: OptionType,
  iv: number,
  quantity: number = 1
): Promise<GreekSnapshot> {
  await pricingEngine.initialize();
  
  const greeks = await pricingEngine.calculateGreeks(
    symbol,
    spotPrice,
    strike,
    expiration,
    iv,
    optionType
  );
  
  const daysToExpiration = Math.max(0, (expiration.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
  
  const contractMultiplier = 100 * quantity;
  
  let moneyness: 'ITM' | 'ATM' | 'OTM';
  const moneynessRatio = spotPrice / strike;
  if (optionType === 'call') {
    moneyness = moneynessRatio > 1.02 ? 'ITM' : moneynessRatio < 0.98 ? 'OTM' : 'ATM';
  } else {
    moneyness = moneynessRatio < 0.98 ? 'ITM' : moneynessRatio > 1.02 ? 'OTM' : 'ATM';
  }
  
  const directionalBias = Math.abs(greeks.delta) < 0.20 
    ? 'Neutral - minimal directional exposure'
    : greeks.delta > 0.50 
    ? 'Strongly bullish'
    : greeks.delta > 0.20 
    ? 'Moderately bullish'
    : greeks.delta < -0.50
    ? 'Strongly bearish'
    : greeks.delta < -0.20
    ? 'Moderately bearish'
    : 'Slightly bullish';
  
  const timeDecay = greeks.theta < -0.10
    ? 'Significant daily decay - time is working against you'
    : greeks.theta < -0.03
    ? 'Moderate time decay'
    : greeks.theta < 0
    ? 'Minimal time decay'
    : 'Positive theta - time decay working in your favor';
  
  const volatilitySensitivity = greeks.vega > 0.15
    ? 'High sensitivity to IV changes - major vega exposure'
    : greeks.vega > 0.05
    ? 'Moderate IV sensitivity'
    : 'Low IV sensitivity';
  
  const sharesNeeded = Math.abs(Math.round(greeks.delta * contractMultiplier));
  const hedgeRatio = `${sharesNeeded} shares ${greeks.delta > 0 ? 'short' : 'long'} to hedge`;
  
  return {
    symbol,
    spotPrice,
    strike,
    expiration,
    daysToExpiration,
    optionType,
    iv,
    greeks,
    dollarGreeks: {
      delta: greeks.delta * contractMultiplier,
      gamma: greeks.gamma * contractMultiplier,
      theta: greeks.theta * contractMultiplier,
      vega: greeks.vega * contractMultiplier,
    },
    interpretation: {
      moneyness,
      directionalBias,
      timeDecay,
      volatilitySensitivity,
      hedgeRatio,
    },
  };
}

export const greeksVisualizer = {
  getGreeksEducation,
  generateGreeksVsPrice,
  generateGreeksVsTime,
  generateGreeksVsIV,
  generateGreeksSurface,
  getGreekSnapshot,
};
