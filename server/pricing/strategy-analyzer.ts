import { OptionStyle, AssetClass } from './types';
import { pricingEngine } from './pricing-engine';

export type OptionTypeStr = 'call' | 'put';

export type StrategyType =
  | 'long_call'
  | 'long_put'
  | 'short_call'
  | 'short_put'
  | 'covered_call'
  | 'protective_put'
  | 'bull_call_spread'
  | 'bear_put_spread'
  | 'bull_put_spread'
  | 'bear_call_spread'
  | 'long_straddle'
  | 'short_straddle'
  | 'long_strangle'
  | 'short_strangle'
  | 'iron_condor'
  | 'iron_butterfly'
  | 'long_call_butterfly'
  | 'long_put_butterfly'
  | 'calendar_spread'
  | 'diagonal_spread'
  | 'custom';

export interface StrategyLeg {
  optionType: OptionTypeStr;
  strike: number;
  expiration: Date;
  quantity: number;
  premium: number;
  action: 'buy' | 'sell';
  iv?: number;
}

export interface StockLeg {
  quantity: number;
  entryPrice: number;
  action: 'buy' | 'sell';
}

export interface Strategy {
  name: string;
  type: StrategyType;
  symbol: string;
  underlyingPrice: number;
  legs: StrategyLeg[];
  stockLeg?: StockLeg;
  netPremium: number;
  maxProfit: number | 'unlimited';
  maxLoss: number | 'unlimited';
  breakEvenPoints: number[];
  riskRewardRatio?: number;
}

export interface PayoffPoint {
  price: number;
  pnl: number;
  pnlPercent?: number;
}

export interface StrategyGreeks {
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  rho: number;
}

export interface StrategyAnalysis {
  strategy: Strategy;
  payoffData: PayoffPoint[];
  greeks: StrategyGreeks;
  probabilityOfProfit?: number;
  daysToExpiration: number;
  impliedMove?: number;
}

function calculateLegPayoff(
  leg: StrategyLeg,
  underlyingPrice: number
): number {
  const multiplier = leg.action === 'buy' ? 1 : -1;
  const contracts = Math.abs(leg.quantity);
  
  let intrinsicValue: number;
  if (leg.optionType === 'call') {
    intrinsicValue = Math.max(0, underlyingPrice - leg.strike);
  } else {
    intrinsicValue = Math.max(0, leg.strike - underlyingPrice);
  }

  const legPnl = (intrinsicValue - leg.premium) * multiplier * contracts * 100;
  return legPnl;
}

function calculateStockPayoff(
  stockLeg: StockLeg,
  underlyingPrice: number
): number {
  const multiplier = stockLeg.action === 'buy' ? 1 : -1;
  return (underlyingPrice - stockLeg.entryPrice) * multiplier * stockLeg.quantity;
}

export function calculateStrategyPayoff(
  strategy: Strategy,
  priceRange: { min: number; max: number; steps?: number }
): PayoffPoint[] {
  const steps = priceRange.steps || 100;
  const increment = (priceRange.max - priceRange.min) / steps;
  const payoffData: PayoffPoint[] = [];

  for (let i = 0; i <= steps; i++) {
    const price = priceRange.min + i * increment;
    let totalPnl = 0;

    for (const leg of strategy.legs) {
      totalPnl += calculateLegPayoff(leg, price);
    }

    if (strategy.stockLeg) {
      totalPnl += calculateStockPayoff(strategy.stockLeg, price);
    }

    payoffData.push({
      price: Math.round(price * 100) / 100,
      pnl: Math.round(totalPnl * 100) / 100,
      pnlPercent: strategy.netPremium !== 0 
        ? Math.round((totalPnl / Math.abs(strategy.netPremium * 100)) * 10000) / 100
        : undefined,
    });
  }

  return payoffData;
}

export function calculateBreakEvenPoints(strategy: Strategy): number[] {
  const spotPrice = strategy.underlyingPrice;
  const searchRange = {
    min: spotPrice * 0.5,
    max: spotPrice * 1.5,
    steps: 1000,
  };

  const payoffData = calculateStrategyPayoff(strategy, searchRange);
  const breakEvens: number[] = [];

  for (let i = 1; i < payoffData.length; i++) {
    const prev = payoffData[i - 1];
    const curr = payoffData[i];

    if ((prev.pnl < 0 && curr.pnl >= 0) || (prev.pnl >= 0 && curr.pnl < 0)) {
      const crossPrice = prev.price + 
        (curr.price - prev.price) * Math.abs(prev.pnl) / (Math.abs(prev.pnl) + Math.abs(curr.pnl));
      breakEvens.push(Math.round(crossPrice * 100) / 100);
    }
  }

  const uniqueBreakEvens = breakEvens.filter((v, i, a) => a.indexOf(v) === i);
  return uniqueBreakEvens.sort((a, b) => a - b);
}

export function calculateMaxProfitLoss(strategy: Strategy): {
  maxProfit: number | 'unlimited';
  maxLoss: number | 'unlimited';
} {
  const spotPrice = strategy.underlyingPrice;
  const searchRange = {
    min: 0.01,
    max: spotPrice * 3,
    steps: 1000,
  };

  const payoffData = calculateStrategyPayoff(strategy, searchRange);
  
  let maxProfit = -Infinity;
  let maxLoss = Infinity;

  for (const point of payoffData) {
    if (point.pnl > maxProfit) maxProfit = point.pnl;
    if (point.pnl < maxLoss) maxLoss = point.pnl;
  }

  const lastPnl = payoffData[payoffData.length - 1].pnl;

  const hasLongCalls = strategy.legs.some(
    l => l.optionType === 'call' && l.action === 'buy'
  );
  const hasShortCalls = strategy.legs.some(
    l => l.optionType === 'call' && l.action === 'sell'
  );

  if (hasLongCalls && !hasShortCalls && strategy.stockLeg?.action !== 'sell') {
    return { maxProfit: 'unlimited', maxLoss: Math.round(maxLoss * 100) / 100 };
  }

  if (hasShortCalls && !hasLongCalls) {
    return { maxProfit: Math.round(maxProfit * 100) / 100, maxLoss: 'unlimited' };
  }

  return {
    maxProfit: Math.round(maxProfit * 100) / 100,
    maxLoss: Math.round(maxLoss * 100) / 100,
  };
}

export function calculateNetPremium(legs: StrategyLeg[]): number {
  return legs.reduce((total, leg) => {
    const multiplier = leg.action === 'buy' ? -1 : 1;
    return total + leg.premium * Math.abs(leg.quantity) * 100 * multiplier;
  }, 0);
}

export async function calculateStrategyGreeks(
  strategy: Strategy,
  riskFreeRate: number = 0.05
): Promise<StrategyGreeks> {
  const totalGreeks: StrategyGreeks = {
    delta: 0,
    gamma: 0,
    theta: 0,
    vega: 0,
    rho: 0,
  };

  await pricingEngine.initialize();

  for (const leg of strategy.legs) {
    const iv = leg.iv || 0.30;

    try {
      const greeks = await pricingEngine.calculateGreeks(
        strategy.symbol,
        strategy.underlyingPrice,
        leg.strike,
        leg.expiration,
        iv,
        leg.optionType
      );

      const multiplier = leg.action === 'buy' ? 1 : -1;
      const contracts = Math.abs(leg.quantity);

      totalGreeks.delta += greeks.delta * multiplier * contracts * 100;
      totalGreeks.gamma += greeks.gamma * multiplier * contracts * 100;
      totalGreeks.theta += greeks.theta * multiplier * contracts * 100;
      totalGreeks.vega += greeks.vega * multiplier * contracts * 100;
      totalGreeks.rho += greeks.rho * multiplier * contracts * 100;
    } catch (error) {
      console.warn(`Failed to calculate Greeks for leg:`, error);
    }
  }

  if (strategy.stockLeg) {
    const stockDelta = strategy.stockLeg.action === 'buy' 
      ? strategy.stockLeg.quantity 
      : -strategy.stockLeg.quantity;
    totalGreeks.delta += stockDelta;
  }

  return {
    delta: Math.round(totalGreeks.delta * 100) / 100,
    gamma: Math.round(totalGreeks.gamma * 1000) / 1000,
    theta: Math.round(totalGreeks.theta * 100) / 100,
    vega: Math.round(totalGreeks.vega * 100) / 100,
    rho: Math.round(totalGreeks.rho * 100) / 100,
  };
}

export function buildStrategy(
  name: string,
  type: StrategyType,
  symbol: string,
  underlyingPrice: number,
  legs: StrategyLeg[],
  stockLeg?: StockLeg
): Strategy {
  const netPremium = calculateNetPremium(legs);
  
  const strategy: Strategy = {
    name,
    type,
    symbol,
    underlyingPrice,
    legs,
    stockLeg,
    netPremium,
    maxProfit: 0,
    maxLoss: 0,
    breakEvenPoints: [],
  };

  const { maxProfit, maxLoss } = calculateMaxProfitLoss(strategy);
  strategy.maxProfit = maxProfit;
  strategy.maxLoss = maxLoss;
  strategy.breakEvenPoints = calculateBreakEvenPoints(strategy);

  if (typeof maxProfit === 'number' && typeof maxLoss === 'number' && maxLoss !== 0) {
    strategy.riskRewardRatio = Math.abs(maxProfit / maxLoss);
  }

  return strategy;
}

export function createCoveredCall(
  symbol: string,
  stockPrice: number,
  shares: number,
  callStrike: number,
  callPremium: number,
  expiration: Date
): Strategy {
  return buildStrategy(
    'Covered Call',
    'covered_call',
    symbol,
    stockPrice,
    [
      {
        optionType: 'call',
        strike: callStrike,
        expiration,
        quantity: Math.floor(shares / 100),
        premium: callPremium,
        action: 'sell',
      },
    ],
    {
      quantity: shares,
      entryPrice: stockPrice,
      action: 'buy',
    }
  );
}

export function createProtectivePut(
  symbol: string,
  stockPrice: number,
  shares: number,
  putStrike: number,
  putPremium: number,
  expiration: Date
): Strategy {
  return buildStrategy(
    'Protective Put',
    'protective_put',
    symbol,
    stockPrice,
    [
      {
        optionType: 'put',
        strike: putStrike,
        expiration,
        quantity: Math.floor(shares / 100),
        premium: putPremium,
        action: 'buy',
      },
    ],
    {
      quantity: shares,
      entryPrice: stockPrice,
      action: 'buy',
    }
  );
}

export function createBullCallSpread(
  symbol: string,
  underlyingPrice: number,
  lowerStrike: number,
  upperStrike: number,
  lowerPremium: number,
  upperPremium: number,
  expiration: Date,
  contracts: number = 1
): Strategy {
  return buildStrategy(
    'Bull Call Spread',
    'bull_call_spread',
    symbol,
    underlyingPrice,
    [
      {
        optionType: 'call',
        strike: lowerStrike,
        expiration,
        quantity: contracts,
        premium: lowerPremium,
        action: 'buy',
      },
      {
        optionType: 'call',
        strike: upperStrike,
        expiration,
        quantity: contracts,
        premium: upperPremium,
        action: 'sell',
      },
    ]
  );
}

export function createBearPutSpread(
  symbol: string,
  underlyingPrice: number,
  lowerStrike: number,
  upperStrike: number,
  lowerPremium: number,
  upperPremium: number,
  expiration: Date,
  contracts: number = 1
): Strategy {
  return buildStrategy(
    'Bear Put Spread',
    'bear_put_spread',
    symbol,
    underlyingPrice,
    [
      {
        optionType: 'put',
        strike: upperStrike,
        expiration,
        quantity: contracts,
        premium: upperPremium,
        action: 'buy',
      },
      {
        optionType: 'put',
        strike: lowerStrike,
        expiration,
        quantity: contracts,
        premium: lowerPremium,
        action: 'sell',
      },
    ]
  );
}

export function createIronCondor(
  symbol: string,
  underlyingPrice: number,
  putLowerStrike: number,
  putUpperStrike: number,
  callLowerStrike: number,
  callUpperStrike: number,
  putLowerPremium: number,
  putUpperPremium: number,
  callLowerPremium: number,
  callUpperPremium: number,
  expiration: Date,
  contracts: number = 1
): Strategy {
  return buildStrategy(
    'Iron Condor',
    'iron_condor',
    symbol,
    underlyingPrice,
    [
      {
        optionType: 'put',
        strike: putLowerStrike,
        expiration,
        quantity: contracts,
        premium: putLowerPremium,
        action: 'buy',
      },
      {
        optionType: 'put',
        strike: putUpperStrike,
        expiration,
        quantity: contracts,
        premium: putUpperPremium,
        action: 'sell',
      },
      {
        optionType: 'call',
        strike: callLowerStrike,
        expiration,
        quantity: contracts,
        premium: callLowerPremium,
        action: 'sell',
      },
      {
        optionType: 'call',
        strike: callUpperStrike,
        expiration,
        quantity: contracts,
        premium: callUpperPremium,
        action: 'buy',
      },
    ]
  );
}

export function createStraddle(
  symbol: string,
  underlyingPrice: number,
  strike: number,
  callPremium: number,
  putPremium: number,
  expiration: Date,
  contracts: number = 1,
  isLong: boolean = true
): Strategy {
  const action: 'buy' | 'sell' = isLong ? 'buy' : 'sell';
  
  return buildStrategy(
    isLong ? 'Long Straddle' : 'Short Straddle',
    isLong ? 'long_straddle' : 'short_straddle',
    symbol,
    underlyingPrice,
    [
      {
        optionType: 'call',
        strike,
        expiration,
        quantity: contracts,
        premium: callPremium,
        action,
      },
      {
        optionType: 'put',
        strike,
        expiration,
        quantity: contracts,
        premium: putPremium,
        action,
      },
    ]
  );
}

export function createStrangle(
  symbol: string,
  underlyingPrice: number,
  putStrike: number,
  callStrike: number,
  putPremium: number,
  callPremium: number,
  expiration: Date,
  contracts: number = 1,
  isLong: boolean = true
): Strategy {
  const action: 'buy' | 'sell' = isLong ? 'buy' : 'sell';
  
  return buildStrategy(
    isLong ? 'Long Strangle' : 'Short Strangle',
    isLong ? 'long_strangle' : 'short_strangle',
    symbol,
    underlyingPrice,
    [
      {
        optionType: 'put',
        strike: putStrike,
        expiration,
        quantity: contracts,
        premium: putPremium,
        action,
      },
      {
        optionType: 'call',
        strike: callStrike,
        expiration,
        quantity: contracts,
        premium: callPremium,
        action,
      },
    ]
  );
}

export function createButterfly(
  symbol: string,
  underlyingPrice: number,
  lowerStrike: number,
  middleStrike: number,
  upperStrike: number,
  lowerPremium: number,
  middlePremium: number,
  upperPremium: number,
  expiration: Date,
  optionType: OptionTypeStr = 'call',
  contracts: number = 1
): Strategy {
  return buildStrategy(
    optionType === 'call' ? 'Long Call Butterfly' : 'Long Put Butterfly',
    optionType === 'call' ? 'long_call_butterfly' : 'long_put_butterfly',
    symbol,
    underlyingPrice,
    [
      {
        optionType,
        strike: lowerStrike,
        expiration,
        quantity: contracts,
        premium: lowerPremium,
        action: 'buy',
      },
      {
        optionType,
        strike: middleStrike,
        expiration,
        quantity: contracts * 2,
        premium: middlePremium,
        action: 'sell',
      },
      {
        optionType,
        strike: upperStrike,
        expiration,
        quantity: contracts,
        premium: upperPremium,
        action: 'buy',
      },
    ]
  );
}

export async function analyzeStrategy(
  strategy: Strategy,
  riskFreeRate: number = 0.05
): Promise<StrategyAnalysis> {
  const priceRange = {
    min: strategy.underlyingPrice * 0.7,
    max: strategy.underlyingPrice * 1.3,
    steps: 100,
  };

  const payoffData = calculateStrategyPayoff(strategy, priceRange);
  const greeks = await calculateStrategyGreeks(strategy, riskFreeRate);

  const firstExpiration = strategy.legs.reduce(
    (min, leg) => (leg.expiration < min ? leg.expiration : min),
    strategy.legs[0].expiration
  );
  const daysToExpiration = Math.max(0,
    Math.ceil((firstExpiration.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
  );

  return {
    strategy,
    payoffData,
    greeks,
    daysToExpiration,
  };
}

export const strategyAnalyzer = {
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
};

export default strategyAnalyzer;
