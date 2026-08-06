// Black-Scholes Greeks Calculator

function normalCDF(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp((-x * x) / 2);
  const prob =
    d *
    t *
    (0.3193815 +
      t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - prob : prob;
}

function normalPDF(x: number): number {
  return Math.exp((-x * x) / 2) / Math.sqrt(2 * Math.PI);
}

export interface GreeksInput {
  spotPrice: number;
  strikePrice: number;
  timeToExpiry: number; // in years
  riskFreeRate: number; // as decimal (e.g., 0.05 for 5%)
  volatility: number; // as decimal (e.g., 0.20 for 20%)
  optionType: "call" | "put";
}

export interface Greeks {
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  rho: number;
}

export class GreeksCalculator {
  private calculateD1(input: GreeksInput): number {
    const { spotPrice, strikePrice, timeToExpiry, riskFreeRate, volatility } = input;
    return (
      (Math.log(spotPrice / strikePrice) +
        (riskFreeRate + (volatility * volatility) / 2) * timeToExpiry) /
      (volatility * Math.sqrt(timeToExpiry))
    );
  }

  private calculateD2(input: GreeksInput): number {
    const d1 = this.calculateD1(input);
    return d1 - input.volatility * Math.sqrt(input.timeToExpiry);
  }

  calculateDelta(input: GreeksInput): number {
    const d1 = this.calculateD1(input);
    if (input.optionType === "call") {
      return normalCDF(d1);
    } else {
      return normalCDF(d1) - 1;
    }
  }

  calculateGamma(input: GreeksInput): number {
    const d1 = this.calculateD1(input);
    return (
      normalPDF(d1) /
      (input.spotPrice * input.volatility * Math.sqrt(input.timeToExpiry))
    );
  }

  calculateTheta(input: GreeksInput): number {
    const { spotPrice, strikePrice, timeToExpiry, riskFreeRate, volatility, optionType } =
      input;
    const d1 = this.calculateD1(input);
    const d2 = this.calculateD2(input);

    const term1 =
      -(spotPrice * normalPDF(d1) * volatility) / (2 * Math.sqrt(timeToExpiry));

    if (optionType === "call") {
      const term2 =
        -riskFreeRate *
        strikePrice *
        Math.exp(-riskFreeRate * timeToExpiry) *
        normalCDF(d2);
      return (term1 + term2) / 365; // Convert to daily theta
    } else {
      const term2 =
        riskFreeRate *
        strikePrice *
        Math.exp(-riskFreeRate * timeToExpiry) *
        normalCDF(-d2);
      return (term1 + term2) / 365; // Convert to daily theta
    }
  }

  calculateVega(input: GreeksInput): number {
    const d1 = this.calculateD1(input);
    return (
      (input.spotPrice * normalPDF(d1) * Math.sqrt(input.timeToExpiry)) / 100
    ); // Divide by 100 for 1% change
  }

  calculateRho(input: GreeksInput): number {
    const { strikePrice, timeToExpiry, riskFreeRate, optionType } = input;
    const d2 = this.calculateD2(input);

    if (optionType === "call") {
      return (
        (strikePrice *
          timeToExpiry *
          Math.exp(-riskFreeRate * timeToExpiry) *
          normalCDF(d2)) /
        100
      ); // Divide by 100 for 1% change
    } else {
      return (
        (-strikePrice *
          timeToExpiry *
          Math.exp(-riskFreeRate * timeToExpiry) *
          normalCDF(-d2)) /
        100
      ); // Divide by 100 for 1% change
    }
  }

  calculateAllGreeks(input: GreeksInput): Greeks {
    return {
      delta: this.calculateDelta(input),
      gamma: this.calculateGamma(input),
      theta: this.calculateTheta(input),
      vega: this.calculateVega(input),
      rho: this.calculateRho(input),
    };
  }

  calculatePortfolioGreeks(positions: Array<{ input: GreeksInput; quantity: number; action: 'buy' | 'sell' }>): Greeks {
    let totalDelta = 0;
    let totalGamma = 0;
    let totalTheta = 0;
    let totalVega = 0;
    let totalRho = 0;

    for (const position of positions) {
      const greeks = this.calculateAllGreeks(position.input);
      const multiplier = position.action === 'buy' ? 1 : -1;
      const quantity = position.quantity * multiplier;

      totalDelta += greeks.delta * quantity;
      totalGamma += greeks.gamma * quantity;
      totalTheta += greeks.theta * quantity;
      totalVega += greeks.vega * quantity;
      totalRho += greeks.rho * quantity;
    }

    return {
      delta: totalDelta,
      gamma: totalGamma,
      theta: totalTheta,
      vega: totalVega,
      rho: totalRho,
    };
  }
}

export const greeksCalculator = new GreeksCalculator();
