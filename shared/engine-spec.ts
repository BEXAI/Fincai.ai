/**
 * Canonical, code-traceable description of Fincai's options pricing engine.
 *
 * Every claim in these strings maps to an implemented method in `server/pricing/*`:
 * Generalized Black-Scholes, the Bjerksund-Stensland (2002) approximation,
 * closed-form Greeks, a Newton-Raphson/Brent implied-volatility solver, a Treasury
 * yield-curve service, a dividend service, and an SVI volatility surface.
 *
 * This module is intentionally dependency-free (pure strings) so it is safe to
 * import into both the client bundle and the server crawler injector. Use these
 * concrete, verifiable descriptions instead of unverifiable marketing superlatives.
 */

/** Short noun phrase for inline copy and meta descriptions (no leading article). */
export const OPTIONS_ENGINE_PHRASE =
  "Black-Scholes and Bjerksund-Stensland options pricing engine";

/** 40-70 word factual summary for hero subtitles and feature blocks. */
export const OPTIONS_ENGINE_SPEC_SHORT =
  "European-style contracts are priced with Black-Scholes-Merton and American-style contracts with the Bjerksund-Stensland (2002) closed-form approximation. Greeks are computed from closed-form partial derivatives, implied volatility is solved by Newton-Raphson with a Brent fallback for low-vega wings, and each contract is priced against its own market-implied volatility.";

/** Full, itemized method list — suitable for a methodology / documentation page. */
export const OPTIONS_ENGINE_SPEC_FULL: string[] = [
  "European-style options: Generalized Black-Scholes (Black-Scholes-Merton for equities, Black-76 for futures, Garman-Kohlhagen for FX).",
  "American-style options: the Bjerksund-Stensland (2002) closed-form approximation, falling back to the European model when early exercise carries no value.",
  "Greeks: closed-form analytic partial derivatives (delta, gamma, theta, vega, rho).",
  "Implied volatility: Newton-Raphson, with a Brent's-method fallback for low-vega wings and bisection as a last resort (tolerance 1e-8).",
  "Risk-free rate: an interpolated U.S. Treasury yield curve (natural cubic spline), with a flat-curve fallback if the Treasury feed is unavailable.",
  "Dividends: modeled as a continuous dividend yield.",
  "Volatility surface: per-strike implied volatility from the option chain, with optional SVI smoothing.",
];
