import Anthropic from "@anthropic-ai/sdk";
import pLimit from "p-limit";
import pRetry from "p-retry";
import { z } from "zod";
import { 
  getModelConfig, 
  buildSystemPromptFromConfig,
  type ModelConfig 
} from "./config/claudeConfig";
import {
  extractJsonObject,
  type CompletionFn,
  type AnalysisProviderMeta,
} from "./llm-completions";

// This is using Replit's AI Integrations service, which provides Anthropic-compatible API access
// without requiring your own Anthropic API key. Charges are billed to your Replit credits.
const anthropic = new Anthropic({
  apiKey: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL,
});

// Export the shared Anthropic client for use in other modules
export { anthropic };

// Get model configuration from claude-config.json
const modelConfig = getModelConfig();

// Context types for enhanced AI responses
export interface PortfolioContext {
  cashBalance: number;
  totalValue: number;
  holdings: Array<{
    symbol: string;
    quantity: number;
    averageCost: number;
    currentPrice: number;
    profitLoss: number;
    profitLossPercent: number;
  }>;
  recentTrades: Array<{
    symbol: string;
    orderType: string;
    quantity: number;
    price: number;
    createdAt: string;
  }>;
}

export interface MarketContext {
  spyPrice: number;
  spyChange: number;
  spyChangePercent: number;
  vix?: number;
  marketSentiment?: string;
}

// ============================================================================
// CLAUDE API FUNCTION TOOLS FOR TRADING OPERATIONS
// ============================================================================

// Tool Execution Context - Services injected from routes
export interface ToolExecutionContext {
  userId: string;
  portfolioContext?: PortfolioContext;
  marketDataService?: any;
  storage?: any;
}

// Tool response types
export interface QuoteResponse {
  symbol: string;
  price: number;
  bid: number;
  ask: number;
  volume: number;
  change: number;
  changePercent: number;
  timestamp: string;
}

export interface PositionResponse {
  symbol: string;
  quantity: number;
  avg_cost: number;
  market_value: number;
  unrealized_pnl: number;
}

export interface BuyingPowerResponse {
  cash: number;
  buying_power: number;
  portfolio_value: number;
}

export interface OrderValidationResponse {
  valid: boolean;
  checks: Array<{ name: string; passed: boolean; message: string }>;
  syntax_errors: string[];
  warnings: string[];
}

export interface OptionsChainResponse {
  underlying: string;
  underlying_price: number;
  expirations: string[];
  calls: Array<{
    strike: number;
    expiration: string;
    bid: number;
    ask: number;
    volume: number;
    open_interest: number;
    implied_volatility: number;
  }>;
  puts: Array<{
    strike: number;
    expiration: string;
    bid: number;
    ask: number;
    volume: number;
    open_interest: number;
    implied_volatility: number;
  }>;
}

export interface SetAlertResponse {
  success: boolean;
  alertId?: string;
  message: string;
  currentPrice?: number;
}

// Claude API Tool Definitions following tool_use format
export const TRADING_TOOLS: Anthropic.Messages.Tool[] = [
  {
    name: "get_quote",
    description: "Get real-time market quote for a stock or ETF symbol. Returns current price, bid/ask spread, volume, and daily change information.",
    input_schema: {
      type: "object" as const,
      properties: {
        symbol: {
          type: "string",
          description: "The stock or ETF ticker symbol (e.g., AAPL, TSLA, SPY)"
        }
      },
      required: ["symbol"]
    }
  },
  {
    name: "get_positions",
    description: "Get the user's current portfolio positions including all holdings with quantities, average costs, current market values, and unrealized profit/loss.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: []
    }
  },
  {
    name: "get_buying_power",
    description: "Get the user's available cash balance, buying power, and total portfolio value for determining if they can afford a trade.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: []
    }
  },
  {
    name: "validate_order",
    description: "Pre-flight validation check for order parameters before execution. Validates symbol, quantity, order type, and checks against buying power and risk limits.",
    input_schema: {
      type: "object" as const,
      properties: {
        symbol: {
          type: "string",
          description: "The stock or ETF ticker symbol"
        },
        side: {
          type: "string",
          enum: ["buy", "sell"],
          description: "Order side - buy or sell"
        },
        quantity: {
          type: "number",
          description: "Number of shares to trade"
        },
        order_type: {
          type: "string",
          enum: ["market", "limit", "stop", "stop_limit"],
          description: "Type of order"
        },
        limit_price: {
          type: "number",
          description: "Limit price for limit or stop_limit orders (optional)"
        },
        stop_price: {
          type: "number",
          description: "Stop price for stop or stop_limit orders (optional)"
        },
        time_in_force: {
          type: "string",
          enum: ["day", "gtc", "ioc", "fok"],
          description: "Time in force for the order (default: day)"
        }
      },
      required: ["symbol", "side", "quantity", "order_type"]
    }
  },
  {
    name: "get_options_chain",
    description: "Get the options chain for a symbol including available expiration dates, and call/put contracts with strikes, bids, asks, and Greeks.",
    input_schema: {
      type: "object" as const,
      properties: {
        symbol: {
          type: "string",
          description: "The underlying stock or ETF ticker symbol"
        },
        expiration_date: {
          type: "string",
          description: "Specific expiration date in YYYY-MM-DD format (optional, returns nearest expiration if not specified)"
        }
      },
      required: ["symbol"]
    }
  },
  {
    name: "set_alert",
    description: "Set a price alert for a stock or ETF. Creates an alert that triggers when the specified price condition is met.",
    input_schema: {
      type: "object" as const,
      properties: {
        symbol: {
          type: "string",
          description: "The stock or ETF ticker symbol (e.g., AAPL, TSLA, SPY)"
        },
        target_price: {
          type: "number",
          description: "The price at which to trigger the alert"
        },
        condition: {
          type: "string",
          enum: ["above", "below", "crosses"],
          description: "Alert condition: 'above' triggers when price rises above target, 'below' when it falls below, 'crosses' for any cross of the target price"
        },
        note: {
          type: "string",
          description: "Optional note to include with the alert"
        }
      },
      required: ["symbol", "target_price", "condition"]
    }
  }
];

// Tool execution handler
export async function executeToolCall(
  toolName: string,
  toolInput: any,
  context: ToolExecutionContext
): Promise<any> {
  switch (toolName) {
    case "get_quote":
      return await executeGetQuote(toolInput.symbol, context);

    case "get_positions":
      return await executeGetPositions(context);

    case "get_buying_power":
      return await executeGetBuyingPower(context);

    case "validate_order":
      return await executeValidateOrder(toolInput, context);

    case "get_options_chain":
      return await executeGetOptionsChain(toolInput.symbol, toolInput.expiration_date, context);

    case "set_alert":
      return await executeSetAlert(
        toolInput.symbol,
        toolInput.target_price,
        toolInput.condition,
        toolInput.note,
        context
      );

    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}

// Tool implementation: get_quote
async function executeGetQuote(
  symbol: string,
  context: ToolExecutionContext
): Promise<QuoteResponse | { symbol: string; error: string }> {
  const normalizedSymbol = symbol.toUpperCase();

  if (context.marketDataService) {
    try {
      const quote = await context.marketDataService.getQuote(normalizedSymbol);
      if (quote) {
        return {
          symbol: normalizedSymbol,
          price: quote.price,
          bid: quote.price - 0.01,
          ask: quote.price + 0.01,
          volume: quote.volume || 0,
          change: quote.change || 0,
          changePercent: quote.changePercent || 0,
          timestamp: quote.timestamp || new Date().toISOString()
        };
      }
    } catch (error) {
      console.error(`Error fetching quote for ${symbol}:`, error);
    }
  }

  return {
    symbol: normalizedSymbol,
    error: `Quote unavailable for ${normalizedSymbol}. The market data provider returned no data.`,
  };
}

// Tool implementation: get_positions
async function executeGetPositions(
  context: ToolExecutionContext
): Promise<PositionResponse[]> {
  if (context.portfolioContext?.holdings) {
    return context.portfolioContext.holdings.map(h => ({
      symbol: h.symbol,
      quantity: h.quantity,
      avg_cost: h.averageCost,
      market_value: h.quantity * h.currentPrice,
      unrealized_pnl: h.profitLoss
    }));
  }

  return [];
}

// Tool implementation: get_buying_power
async function executeGetBuyingPower(
  context: ToolExecutionContext
): Promise<BuyingPowerResponse> {
  if (context.portfolioContext) {
    return {
      cash: context.portfolioContext.cashBalance,
      buying_power: context.portfolioContext.cashBalance,
      portfolio_value: context.portfolioContext.totalValue
    };
  }

  return {
    cash: 0,
    buying_power: 0,
    portfolio_value: 0
  };
}

// Tool implementation: validate_order
async function executeValidateOrder(
  input: {
    symbol: string;
    side: "buy" | "sell";
    quantity: number;
    order_type: "market" | "limit" | "stop" | "stop_limit";
    limit_price?: number;
    stop_price?: number;
    time_in_force?: "day" | "gtc" | "ioc" | "fok";
  },
  context: ToolExecutionContext
): Promise<OrderValidationResponse> {
  const checks: Array<{ name: string; passed: boolean; message: string }> = [];
  const syntaxErrors: string[] = [];
  const warnings: string[] = [];

  const symbol = input.symbol.toUpperCase();

  // Check 1: Valid symbol format
  const symbolValid = /^[A-Z]{1,5}$/.test(symbol);
  checks.push({
    name: "symbol_format",
    passed: symbolValid,
    message: symbolValid ? `Symbol ${symbol} has valid format` : `Invalid symbol format: ${symbol}`
  });
  if (!symbolValid) {
    syntaxErrors.push(`Invalid symbol format: ${symbol}. Expected 1-5 uppercase letters.`);
  }

  // Check 2: Quantity validation
  const quantityValid = input.quantity > 0 && Number.isInteger(input.quantity);
  checks.push({
    name: "quantity_valid",
    passed: quantityValid,
    message: quantityValid ? `Quantity ${input.quantity} is valid` : `Invalid quantity: ${input.quantity}`
  });
  if (!quantityValid) {
    syntaxErrors.push(`Quantity must be a positive integer. Got: ${input.quantity}`);
  }

  // Check 3: Limit price required for limit orders
  if ((input.order_type === "limit" || input.order_type === "stop_limit") && !input.limit_price) {
    checks.push({
      name: "limit_price_required",
      passed: false,
      message: "Limit price is required for limit/stop_limit orders"
    });
    syntaxErrors.push("Limit price is required for limit and stop_limit order types.");
  } else if (input.limit_price && input.limit_price <= 0) {
    checks.push({
      name: "limit_price_valid",
      passed: false,
      message: "Limit price must be positive"
    });
    syntaxErrors.push(`Limit price must be positive. Got: ${input.limit_price}`);
  } else if (input.limit_price) {
    checks.push({
      name: "limit_price_valid",
      passed: true,
      message: `Limit price $${input.limit_price.toFixed(2)} is valid`
    });
  }

  // Check 4: Stop price required for stop orders
  if ((input.order_type === "stop" || input.order_type === "stop_limit") && !input.stop_price) {
    checks.push({
      name: "stop_price_required",
      passed: false,
      message: "Stop price is required for stop/stop_limit orders"
    });
    syntaxErrors.push("Stop price is required for stop and stop_limit order types.");
  } else if (input.stop_price && input.stop_price <= 0) {
    checks.push({
      name: "stop_price_valid",
      passed: false,
      message: "Stop price must be positive"
    });
    syntaxErrors.push(`Stop price must be positive. Got: ${input.stop_price}`);
  } else if (input.stop_price) {
    checks.push({
      name: "stop_price_valid",
      passed: true,
      message: `Stop price $${input.stop_price.toFixed(2)} is valid`
    });
  }

  // Check 5: Buying power for buy orders
  if (input.side === "buy" && symbolValid) {
    const buyingPower = await executeGetBuyingPower(context);
    let estimatedCost = 0;

    if (context.marketDataService) {
      try {
        const quote = await context.marketDataService.getQuote(symbol);
        if (quote) {
          const price = input.limit_price || quote.price;
          estimatedCost = price * input.quantity;
        }
      } catch (e) {}
    }

    if (estimatedCost > 0) {
      const hasFunds = buyingPower.buying_power >= estimatedCost;
      checks.push({
        name: "buying_power",
        passed: hasFunds,
        message: hasFunds
          ? `Sufficient buying power: $${buyingPower.buying_power.toFixed(2)} available, $${estimatedCost.toFixed(2)} required`
          : `Insufficient buying power: $${buyingPower.buying_power.toFixed(2)} available, $${estimatedCost.toFixed(2)} required`
      });
      if (!hasFunds) {
        warnings.push(`Insufficient buying power for this order. Available: $${buyingPower.buying_power.toFixed(2)}, Required: $${estimatedCost.toFixed(2)}`);
      }
    }
  }

  // Check 6: Position exists for sell orders
  if (input.side === "sell") {
    const positions = await executeGetPositions(context);
    const position = positions.find(p => p.symbol === symbol);

    if (!position) {
      checks.push({
        name: "position_exists",
        passed: false,
        message: `No position found for ${symbol}`
      });
      warnings.push(`No existing position in ${symbol}. This would be a short sale.`);
    } else if (position.quantity < input.quantity) {
      checks.push({
        name: "position_quantity",
        passed: false,
        message: `Insufficient shares: holding ${position.quantity}, attempting to sell ${input.quantity}`
      });
      warnings.push(`Attempting to sell ${input.quantity} shares but only holding ${position.quantity} shares of ${symbol}.`);
    } else {
      checks.push({
        name: "position_exists",
        passed: true,
        message: `Position verified: ${position.quantity} shares of ${symbol} available`
      });
    }
  }

  // Check 7: Large position warning
  if (input.side === "buy" && symbolValid) {
    const buyingPower = await executeGetBuyingPower(context);
    if (context.marketDataService && buyingPower.portfolio_value > 0) {
      try {
        const quote = await context.marketDataService.getQuote(symbol);
        if (quote) {
          const orderValue = (input.limit_price || quote.price) * input.quantity;
          const portfolioPercent = (orderValue / buyingPower.portfolio_value) * 100;

          if (portfolioPercent > 50) {
            warnings.push(`This order represents ${portfolioPercent.toFixed(1)}% of your portfolio value.`);
          } else if (portfolioPercent > 25) {
            warnings.push(`This order represents ${portfolioPercent.toFixed(1)}% of your portfolio value. Consider position sizing.`);
          }
        }
      } catch (e) {}
    }
  }

  const isValid = syntaxErrors.length === 0;

  return {
    valid: isValid,
    checks,
    syntax_errors: syntaxErrors,
    warnings
  };
}

// Tool implementation: get_options_chain
async function executeGetOptionsChain(
  symbol: string,
  expirationDate: string | undefined,
  context: ToolExecutionContext
): Promise<OptionsChainResponse> {
  const normalizedSymbol = symbol.toUpperCase();

  if (context.marketDataService) {
    try {
      const optionsData = await context.marketDataService.getOptionsChain(normalizedSymbol, expirationDate);
      if (optionsData) {
        return {
          underlying: normalizedSymbol,
          underlying_price: optionsData.underlyingPrice || 0,
          expirations: optionsData.expirationDates || [],
          calls: (optionsData.calls || []).slice(0, 20).map((c: any) => ({
            strike: c.strike,
            expiration: c.expiration,
            bid: c.bid || 0,
            ask: c.ask || 0,
            volume: c.volume || 0,
            open_interest: c.openInterest || 0,
            implied_volatility: c.impliedVolatility || 0
          })),
          puts: (optionsData.puts || []).slice(0, 20).map((p: any) => ({
            strike: p.strike,
            expiration: p.expiration,
            bid: p.bid || 0,
            ask: p.ask || 0,
            volume: p.volume || 0,
            open_interest: p.openInterest || 0,
            implied_volatility: p.impliedVolatility || 0
          }))
        };
      }
    } catch (error) {
      console.error(`Error fetching options chain for ${symbol}:`, error);
    }
  }

  return {
    underlying: normalizedSymbol,
    underlying_price: 0,
    expirations: [],
    calls: [],
    puts: []
  };
}

// Tool implementation: set_alert
async function executeSetAlert(
  symbol: string,
  targetPrice: number,
  condition: "above" | "below" | "crosses",
  note: string | undefined,
  context: ToolExecutionContext
): Promise<SetAlertResponse> {
  const normalizedSymbol = symbol.toUpperCase();

  // Validate inputs
  if (!normalizedSymbol || !/^[A-Z]{1,7}$/.test(normalizedSymbol)) {
    return {
      success: false,
      message: `Invalid symbol format: ${symbol}. Expected 1-7 uppercase letters.`
    };
  }

  if (targetPrice <= 0) {
    return {
      success: false,
      message: `Invalid target price: ${targetPrice}. Price must be positive.`
    };
  }

  // Get current price for context
  let currentPrice: number | undefined;
  if (context.marketDataService) {
    try {
      const quote = await context.marketDataService.getQuote(normalizedSymbol);
      if (quote) {
        currentPrice = quote.price;
      }
    } catch (error) {
      console.error(`Error fetching quote for ${normalizedSymbol}:`, error);
    }
  }

  // Create the alert via storage
  if (context.storage && context.userId) {
    try {
      const alert = await context.storage.createPriceAlert({
        userId: context.userId,
        symbol: normalizedSymbol,
        targetPrice,
        condition,
        status: "active",
        currentPriceAtCreation: currentPrice,
        note: note || undefined
      });

      const conditionText = condition === "above" 
        ? "rises above" 
        : condition === "below" 
          ? "falls below" 
          : "crosses";

      const currentPriceText = currentPrice 
        ? ` (currently $${currentPrice.toFixed(2)})`
        : "";

      return {
        success: true,
        alertId: alert.id,
        message: `Alert created: You'll be notified when ${normalizedSymbol} ${conditionText} $${targetPrice.toFixed(2)}${currentPriceText}.${note ? ` Note: ${note}` : ""}`,
        currentPrice
      };
    } catch (error: any) {
      console.error(`Error creating price alert:`, error);
      return {
        success: false,
        message: `Failed to create alert: ${error.message || "Unknown error"}`
      };
    }
  }

  return {
    success: false,
    message: "Unable to create alert: Storage service unavailable"
  };
}

// Silent Compiler AI Framework v1.0
// Strict, syntax-focused AI behavior for trading operations

// Build dynamic context section for portfolio and market data
function buildContextSection(portfolio?: PortfolioContext, market?: MarketContext): string {
  let contextSection = "";
  
  if (portfolio) {
    const holdingsSummary = portfolio.holdings.length > 0
      ? portfolio.holdings.map(h => 
          `- ${h.symbol}: ${h.quantity} shares @ $${h.averageCost.toFixed(2)} (current: $${h.currentPrice.toFixed(2)}, P&L: ${h.profitLoss >= 0 ? '+' : ''}$${h.profitLoss.toFixed(2)})`
        ).join('\n')
      : "No current holdings";
    
    const recentTradesSummary = portfolio.recentTrades.length > 0
      ? portfolio.recentTrades.slice(0, 5).map(t => 
          `- ${t.orderType.toUpperCase()} ${t.quantity} ${t.symbol} @ $${t.price.toFixed(2)}`
        ).join('\n')
      : "No recent trades";
    
    contextSection += `
## CURRENT PORTFOLIO STATE
Cash Balance: $${portfolio.cashBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
Total Portfolio Value: $${portfolio.totalValue.toLocaleString('en-US', { minimumFractionDigits: 2 })}

Holdings:
${holdingsSummary}

Recent Trades:
${recentTradesSummary}
`;
  }
  
  if (market) {
    contextSection += `
## CURRENT MARKET CONDITIONS
SPY: $${market.spyPrice.toFixed(2)} (${market.spyChange >= 0 ? '+' : ''}${market.spyChange.toFixed(2)}, ${market.spyChangePercent >= 0 ? '+' : ''}${market.spyChangePercent.toFixed(2)}%)
${market.vix ? `VIX: ${market.vix.toFixed(2)} (${market.marketSentiment || 'Normal'})` : ''}
`;
  }
  
  return contextSection;
}

// Silent Compiler methodology sections - detailed operational constraints
const SILENT_COMPILER_SECTIONS = `
## CAPABILITIES
- Answering questions about stocks, options, and market analysis
- Setting price alerts (when user says "alert me when SYMBOL hits $X")
- Providing market insights and trading education
- Analyzing price movements and technical indicators
- Portfolio optimization (Mean-Variance, Black-Litterman)
- Risk modeling (Value at Risk, Sharpe Ratios, Maximum Drawdown)

This chat does NOT execute trades. When a user wants to buy or sell, help them plan and size the trade, then direct them to the Robinhood Agent terminal (/agent) — the only place live orders are placed. Never claim to execute, submit, or confirm an order here.

When users want to trade, extract:
- Action: "buy", "sell", or "info"
- Symbol: The stock ticker (e.g., AAPL, TSLA, SPY)
- Quantity: Number of shares (default to 1 if not specified)

When users want price alerts, extract:
- Symbol: The stock ticker
- Target Price: The price threshold
- Condition: "above", "below", or "crosses"

=== PRESERVATION GUARDS ===

You MUST preserve the user's exact specifications without modification:

**ORDER PRESERVATION:**
- Preserve the EXACT symbol as specified (never substitute similar tickers)
- Preserve the EXACT quantity requested (do not round or adjust)
- Preserve the EXACT order type (market, limit, stop) as specified
- Preserve the EXACT time-in-force preference (DAY, GTC, IOC, etc.)
- Preserve the EXACT limit/stop prices when specified

**STYLE PRESERVATION:**
- Preserve user's preferred trading timeframe (day trading vs swing vs long-term)
- Preserve user's risk tolerance level as previously expressed
- Preserve user's preferred position sizing methodology
- Preserve user's notation style (e.g., "$100" vs "100 dollars")

**STRATEGY PRESERVATION:**
- Do NOT optimize or "improve" user's strategy unless explicitly requested
- Do NOT add stop-losses or take-profits unless user specified them
- Do NOT suggest alternative symbols unless the specified symbol is invalid
- Do NOT modify entry/exit criteria from user's stated parameters

=== ENHANCED HALLUCINATION GUARD ===

CRITICAL: Never reference data or capabilities that don't exist.

**DATA INTEGRITY:**
- ONLY cite prices from verified API responses (Alpaca, Alpha Vantage, broker feed)
- ONLY reference indicators that are actually calculated and available
- ONLY mention news/events from verified data sources
- If data is unavailable, explicitly state: "I don't have current data for [X]"

**CAPABILITY INTEGRITY:**
- ONLY suggest actions the platform can actually perform
- ONLY reference order types the connected broker supports
- ONLY mention features that are implemented and functional
- If uncertain about capability, state: "I'm not sure if [X] is available"

**INDICATOR INTEGRITY:**
- ONLY reference technical indicators the user has configured or requested
- Do NOT assume RSI, MACD, or other indicators are available unless data confirms
- Do NOT fabricate support/resistance levels—calculate from actual price data
- If indicator data is missing, state: "Indicator [X] is not currently available"

=== LOGIC PRESERVATION ===

Preserve user's trading intent exactly. Only warn, never modify.

**SCOPE OF ACTION:**
- Fix ONLY what prevents order execution (invalid symbol, impossible parameters)
- Do NOT refactor for "better" entry points
- Do NOT optimize position sizes based on your analysis
- Do NOT add risk management the user didn't request

**INTENT PRESERVATION:**
- If user's strategy appears unusual but is valid, PRESERVE it
- Add a comment/warning if you identify potential issues, but proceed as requested
- Never assume you understand user's intent better than they do
- If strategy has logical issues (e.g., buy high, sell low), add warning but allow

**WARNING FORMAT:**
When preserving questionable logic, add:
"⚠️ Note: [observation about the request]. Proceeding as specified."

Examples:
- "⚠️ Note: This limit buy is above current market price. Proceeding as specified."
- "⚠️ Note: This position size is 80% of your portfolio. Proceeding as specified."
- "⚠️ Note: You already hold this symbol. Proceeding with additional purchase."

=== ERROR CLASSIFICATION SYSTEM ===

**SYNTAX_ERROR** (Order will fail):
→ BLOCK and notify user with specific error
→ Examples: "Symbol 'APPPLE' not found—did you mean 'AAPL'?", "Quantity 0.5 shares not supported"

**RUNTIME_ERROR** (Order may fail):
→ WARN user before proceeding
→ Examples: "Insufficient buying power: $500 required, $350 available", "Market closed—order will queue"

**LOGIC_WARNING** (Valid but may not match intent):
→ FLAG with warning comment but ALLOW execution without modification
→ Examples: "Buying 100 shares represents 80% of portfolio—intentional?", "Stop loss 50% below current price"
→ Format: "⚠️ Note: [observation]. Proceeding as specified."

**INTENTIONAL_LOGIC** (Unusual but intentional):
→ PRESERVE user's choice exactly, add brief educational comment
→ Examples: "Averaging down strategy detected", "Protective put strategy recognized"
→ Never block or modify—user knows their strategy

=== RESPONSE TEMPLATES ===

**For ANALYSIS requests:**

## VALIDATION SUMMARY
- ✅ Symbol verified: [SYMBOL]
- ✅ Data freshness: [timestamp]
- ⚠️ Note: [any relevant warnings]

## OUTPUT

### Market Context
[2-3 sentence market context]

### Key Metrics
| Metric | Value | Signal |
|--------|-------|--------|
| Price | $XXX.XX | — |
| Daily Change | +/-X.XX% | [bullish/bearish/neutral] |
| Volume | XXX | [above/below] average |

### Assessment
**Action:** [BUY/SELL/HOLD/WAIT]
**Confidence:** [HIGH/MEDIUM/LOW]
**Rationale:** [1-2 sentences]

### Risk Factors
- [risk_1]
- [risk_2]

---

**For ORDER VERIFICATION requests:**

## VALIDATION SUMMARY
- ✅ Symbol verified: [SYMBOL] is valid
- ✅ Quantity: [X] shares
- ✅ Order type: [MARKET/LIMIT/STOP]
- ✅ Buying power: $[available] available, $[required] required
- ✅ Risk limits: Within tolerance

## OUTPUT

### Order Details
| Parameter | Value |
|-----------|-------|
| Action | [BUY/SELL] |
| Symbol | [SYMBOL] |
| Quantity | [X] shares |
| Type | [MARKET/LIMIT/STOP] |
| Estimated Cost | $[amount] |

### Status
**Ready for execution:** [YES/NO]

---

=== AMBIGUITY RESOLUTION PROTOCOL ===

When user intent is unclear:

1. **First attempt:** Ask ONE clarifying question with clear options
   Format: "❓ Clarification: [question]. Options: (1) [option1] (2) [option2] (3) [option3]"

2. **Second attempt:** If still unclear, provide best interpretation with disclaimer
   Format: "I'm interpreting your request as [interpretation]. ⚠️ Note: If this isn't correct, please specify [what's needed]."

3. **Final fallback:** After 2 clarification rounds, suggest manual order entry
   Format: "To ensure accuracy, please use the order form to specify exact parameters."

=== RESPONSE GUIDELINES ===

- Reference the user's current portfolio when giving advice
- Consider their cash balance before suggesting purchases
- Point out positions they already hold when relevant
- Consider current market conditions (SPY trend, VIX level) when discussing risk
- Be concise but thorough—traders value efficiency
- Use structured tables and bullet points for clarity
- For simple questions or casual conversation, respond naturally without full structure
- Always include VALIDATION SUMMARY for trade-related requests
- Only include CLARIFICATION FLAG when genuinely needed
`;

// Build dynamic system prompt with context using Silent Compiler methodology
// Uses buildSystemPromptFromConfig() for base persona/credentials/constraints from claude-config.json
function buildSystemPrompt(portfolio?: PortfolioContext, market?: MarketContext): string {
  const basePrompt = buildSystemPromptFromConfig();
  const contextSection = buildContextSection(portfolio, market);
  
  return `${basePrompt}
${SILENT_COMPILER_SECTIONS}
${contextSection}`;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface PortfolioCommand {
  action: "buy" | "sell" | "info" | null;
  symbol: string | null;
  quantity: number;
}

export interface AlertCommand {
  isAlertCommand: boolean;
  symbol: string | null;
  targetPrice: number | null;
  condition: "above" | "below" | "crosses" | null;
}

// Parse user message for alert commands
export function parseAlertCommand(message: string): AlertCommand {
  const noMatch: AlertCommand = {
    isAlertCommand: false,
    symbol: null,
    targetPrice: null,
    condition: null,
  };
  
  const alertPatterns = [
    // "alert me when AAPL hits $200" or "alert when SPY reaches $600"
    /(?:alert|notify|tell|remind|ping|watch)\s+(?:me\s+)?(?:when|if|for)\s+([a-z]{1,5})\s+(?:hits?|reaches?|gets?\s+to|is\s+at|touches?|breaks?)\s+\$?([\d.,]+)/i,
    // "alert me if TSLA goes above $300" or "notify when AAPL drops below $150"
    /(?:alert|notify|tell|remind|ping|watch)\s+(?:me\s+)?(?:when|if|for)\s+([a-z]{1,5})\s+(?:goes?|drops?|rises?|falls?|moves?|climbs?|dips?|jumps?)\s+(above|below|past|under|over|to)\s+\$?([\d.,]+)/i,
    // "set alert for AAPL at $200" or "create alert SPY above $600"
    /(?:set|create|add|make)\s+(?:a\s+)?(?:price\s+)?alert\s+(?:for\s+)?([a-z]{1,5})\s+(?:at|above|below|when|@)\s+\$?([\d.,]+)/i,
    // "AAPL alert at $200" or "SPY alert above $600"
    /([a-z]{1,5})\s+(?:price\s+)?alert\s+(?:at|above|below|when|@)\s+\$?([\d.,]+)/i,
    // "alert AAPL $200" shorthand
    /(?:alert|notify|watch)\s+([a-z]{1,5})\s+\$?([\d.,]+)/i,
    // "watch AAPL at $200" or "track SPY at $600"
    /(?:watch|track|monitor)\s+([a-z]{1,5})\s+(?:at|@|when|if)\s+\$?([\d.,]+)/i,
    // "AAPL at $200" or "SPY above $600" - simpler patterns
    /^([a-z]{1,5})\s+(above|below|at|@)\s+\$?([\d.,]+)$/i,
    // "AAPL $200" - ultra shorthand
    /^([a-z]{1,5})\s+\$?([\d.,]+)$/i,
    // "$200 AAPL" - reversed shorthand
    /^\$?([\d.,]+)\s+([a-z]{1,5})$/i,
    // "let me know when AAPL is $200"
    /(?:let\s+me\s+know|inform\s+me)\s+(?:when|if)\s+([a-z]{1,5})\s+(?:is|hits?|reaches?|gets?\s+to)\s+\$?([\d.,]+)/i,
  ];

  for (const pattern of alertPatterns) {
    const match = message.match(pattern);
    if (match) {
      let symbol: string;
      let price: number;
      let condition: "above" | "below" | "crosses" = "crosses";
      
      // Handle reversed pattern: "$200 AAPL"
      if (pattern.source.includes("\\$?([\\d.,]+)\\s+([a-z]")) {
        price = parseFloat(match[1].replace(/,/g, ""));
        symbol = match[2].toUpperCase();
      } else if (pattern.source.includes("above|below|past|under|over|to")) {
        symbol = match[1].toUpperCase();
        const conditionWord = match[2].toLowerCase();
        price = parseFloat(match[3].replace(/,/g, ""));
        
        if (["above", "over", "past", "to"].includes(conditionWord)) {
          condition = "above";
        } else if (["below", "under"].includes(conditionWord)) {
          condition = "below";
        }
      } else if (pattern.source.includes("^([a-z]{1,5})\\s+(above|below|at|@)")) {
        symbol = match[1].toUpperCase();
        const conditionWord = match[2].toLowerCase();
        price = parseFloat(match[3].replace(/,/g, ""));
        
        if (conditionWord === "above") {
          condition = "above";
        } else if (conditionWord === "below") {
          condition = "below";
        }
      } else {
        symbol = match[1].toUpperCase();
        price = parseFloat(match[2].replace(/,/g, ""));
        
        const lowerMsg = message.toLowerCase();
        if (lowerMsg.includes("above") || lowerMsg.includes("over") || lowerMsg.includes("rises") || lowerMsg.includes("up")) {
          condition = "above";
        } else if (lowerMsg.includes("below") || lowerMsg.includes("under") || lowerMsg.includes("drops") || lowerMsg.includes("falls") || lowerMsg.includes("down")) {
          condition = "below";
        }
      }
      
      // Validate symbol - reject common English words that aren't stock tickers
      const COMMON_WORDS = new Set([
        'THE', 'AND', 'FOR', 'BUT', 'NOT', 'YOU', 'HIM', 'HER', 'ITS', 'OUR',
        'WHO', 'ALL', 'HAS', 'HAD', 'MAY', 'CAN', 'DID', 'GET', 'NEW', 'NOW',
        'OLD', 'SEE', 'TWO', 'WAY', 'BOT', 'PUT', 'SET', 'YES', 'NO', 'ONE',
        'DAY', 'TOP', 'BIG', 'OUT', 'OFF', 'HOW', 'WHY', 'ANY', 'FEW', 'OWN',
        'SAY', 'LET', 'END', 'RUN', 'TRY', 'USE', 'ADD', 'BUY', 'PAY', 'SAW',
        'JUST', 'ONLY', 'ALSO', 'BACK', 'BEEN', 'COME', 'EACH', 'EVEN', 'FIND',
        'GIVE', 'GOOD', 'HAVE', 'HERE', 'INTO', 'JUST', 'KNOW', 'LAST', 'LIKE',
        'LONG', 'LOOK', 'MADE', 'MAKE', 'MANY', 'MORE', 'MOST', 'MUCH', 'MUST',
        'NAME', 'NEED', 'NEXT', 'OVER', 'PART', 'SHOW', 'SOME', 'SUCH', 'TAKE',
        'TELL', 'THAN', 'THAT', 'THEM', 'THEN', 'THIS', 'TIME', 'VERY', 'WANT',
        'WELL', 'WENT', 'WERE', 'WHAT', 'WHEN', 'WILL', 'WITH', 'WORK', 'YEAR',
        'YOUR', 'CALL', 'SAID', 'FROM', 'THEY', 'ABOUT', 'AFTER', 'ALERT', 'WATCH',
        'PRICE', 'STOCK', 'TRACK', 'ABOVE', 'BELOW', 'TRADE', 'SELLS', 'SHARE'
      ]);
      const validSymbol = /^[A-Z]{1,5}$/.test(symbol) && !COMMON_WORDS.has(symbol);
      
      if (validSymbol && !isNaN(price) && price > 0 && price < 1000000) {
        return {
          isAlertCommand: true,
          symbol,
          targetPrice: price,
          condition,
        };
      }
    }
  }
  
  return noMatch;
}

// Parse user message for portfolio commands
export function parsePortfolioCommand(message: string): PortfolioCommand {
  const lowerMessage = message.toLowerCase();
  
  // Buy patterns
  const buyPatterns = [
    /buy\s+(\d+)?\s*shares?\s+(?:of\s+)?([a-z]{1,5})/i,
    /add\s+(\d+)?\s*(?:shares?\s+(?:of\s+)?)?([a-z]{1,5})/i,
    /purchase\s+(\d+)?\s*shares?\s+(?:of\s+)?([a-z]{1,5})/i,
  ];
  
  // Sell patterns
  const sellPatterns = [
    /sell\s+(\d+)?\s*shares?\s+(?:of\s+)?([a-z]{1,5})/i,
    /remove\s+([a-z]{1,5})/i,
    /exit\s+([a-z]{1,5})/i,
  ];
  
  for (const pattern of buyPatterns) {
    const match = message.match(pattern);
    if (match) {
      return {
        action: "buy",
        symbol: (match[2] || match[1]).toUpperCase(),
        quantity: parseInt(match[1]) || 1,
      };
    }
  }
  
  for (const pattern of sellPatterns) {
    const match = message.match(pattern);
    if (match) {
      return {
        action: "sell",
        symbol: (match[2] || match[1]).toUpperCase(),
        quantity: parseInt(match[1]) || 1,
      };
    }
  }
  
  return { action: null, symbol: null, quantity: 0 };
}

export interface MarketQueryCommand {
  isMarketQuery: boolean;
  queryType: "trending" | "gainers" | "losers" | "active" | "movers" | null;
}

export interface StockPriceQuery {
  isStockQuery: boolean;
  symbol: string | null;
  queryType: "price" | "quote" | "info" | null;
}

const COMPANY_TO_SYMBOL: Record<string, string> = {
  "google": "GOOGL",
  "alphabet": "GOOGL",
  "alphabet inc": "GOOGL",
  "class a": "GOOGL",
  "googl": "GOOGL",
  "goog": "GOOG",
  "apple": "AAPL",
  "apple inc": "AAPL",
  "microsoft": "MSFT",
  "amazon": "AMZN",
  "tesla": "TSLA",
  "meta": "META",
  "meta platforms": "META",
  "facebook": "META",
  "nvidia": "NVDA",
  "netflix": "NFLX",
  "amd": "AMD",
  "intel": "INTC",
  "disney": "DIS",
  "walt disney": "DIS",
  "walmart": "WMT",
  "costco": "COST",
  "jpmorgan": "JPM",
  "jp morgan": "JPM",
  "jpm": "JPM",
  "jpmorgan chase": "JPM",
  "bank of america": "BAC",
  "bofa": "BAC",
  "berkshire": "BRK.B",
  "berkshire hathaway": "BRK.B",
  "brk.b": "BRK.B",
  "brk.a": "BRK.A",
  "johnson & johnson": "JNJ",
  "johnson and johnson": "JNJ",
  "visa": "V",
  "mastercard": "MA",
  "paypal": "PYPL",
  "coinbase": "COIN",
  "robinhood": "HOOD",
  "palantir": "PLTR",
  "3m": "MMM",
  "at&t": "T",
  "att": "T",
  "verizon": "VZ",
  "t-mobile": "TMUS",
  "tmobile": "TMUS",
  "snowflake": "SNOW",
  "uber": "UBER",
  "lyft": "LYFT",
  "airbnb": "ABNB",
  "zoom": "ZM",
  "salesforce": "CRM",
  "oracle": "ORCL",
  "ibm": "IBM",
  "cisco": "CSCO",
  "adobe": "ADBE",
  "spotify": "SPOT",
  "snap": "SNAP",
  "snapchat": "SNAP",
  "twitter": "TWTR",
  "x": "TWTR",
  "pinterest": "PINS",
  "shopify": "SHOP",
  "square": "SQ",
  "block": "SQ",
  "nio": "NIO",
  "lucid": "LCID",
  "rivian": "RIVN",
  "ford": "F",
  "gm": "GM",
  "general motors": "GM",
  "boeing": "BA",
  "lockheed": "LMT",
  "raytheon": "RTX",
  "exxon": "XOM",
  "chevron": "CVX",
  "shell": "SHEL",
  "spy": "SPY",
  "qqq": "QQQ",
  "dia": "DIA",
  "iwm": "IWM",
  "vix": "^VIX",
  "bitcoin": "BTC-USD",
  "btc": "BTC-USD",
  "ethereum": "ETH-USD",
  "eth": "ETH-USD",
  "solana": "SOL-USD",
  "sol": "SOL-USD",
  "xrp": "XRP-USD",
  "ripple": "XRP-USD",
  "dogecoin": "DOGE-USD",
  "doge": "DOGE-USD",
};

export function resolveSymbol(input: string): string | null {
  const normalized = input.toLowerCase().trim();
  if (COMPANY_TO_SYMBOL[normalized]) {
    return COMPANY_TO_SYMBOL[normalized];
  }
  const upperInput = input.toUpperCase().trim();
  if (/^[A-Z0-9]{1,7}(?:\.[A-Z0-9]{1,5})?(?:-[A-Z0-9]{1,8})?$/.test(upperInput)) {
    return upperInput;
  }
  return null;
}

export function parseStockPriceQuery(message: string, conversationHistory?: ChatMessage[]): StockPriceQuery {
  const noMatch: StockPriceQuery = { isStockQuery: false, symbol: null, queryType: null };
  const lowerMessage = message.toLowerCase().trim();
  
  const pricePatterns = [
    /what(?:'s|s| is| are)?\s+([a-z0-9][a-z0-9\s.&-]{0,35}?)\s+(?:at|trading\s+at|price|worth)(?:\s+(?:right\s+now|now|today|please|thanks|currently))?[?.!]*$/i,
    /what(?:'s|s| is| are)?\s+([a-z0-9][a-z0-9\s.&-]{0,35}?)\s+(?:doing|trading)(?:\s+(?:right\s+now|now|today|please|thanks|currently))?[?.!]*$/i,
    /(?:get|show|give|tell)\s+(?:me\s+)?(?:the\s+)?(?:price|quote)\s+(?:of|for|on)\s+([a-z0-9][a-z0-9\s.&-]{0,35})(?:\s+(?:right\s+now|now|today|please|thanks))?/i,
    /(?:price|quote)\s+(?:of|for|on)\s+([a-z0-9][a-z0-9\s.&-]{0,35})(?:\s+(?:right\s+now|now|today|please|thanks))?/i,
    /([a-z0-9][a-z0-9\s.&-]{0,35}?)\s+(?:price|quote|stock)(?:\s+(?:right\s+now|now|today|please|thanks))?[?.!]*$/i,
    /how(?:'s| is| are)?\s+([a-z0-9][a-z0-9\s.&-]{0,35}?)\s+(?:doing|trading|performing)(?:\s+(?:right\s+now|now|today|please|thanks))?[?.!]*$/i,
    /(?:quote|price|check)\s+([a-z0-9][a-z0-9.&-]{0,15})(?:\s+(?:right\s+now|now|today|please|thanks))?[?.!]*$/i,
    /^([a-z0-9]{1,7}(?:\.[a-z0-9]{1,5})?(?:-[a-z0-9]{1,8})?)[?.!]*$/i,
  ];
  
  const stopwords = ['the', 'a', 'an', 'on', 'in', 'for', 'of', 'please', 'thanks', 'now', 'today', 'right', 'currently', 'at'];
  
  function cleanExtractedToken(raw: string): string {
    let cleaned = raw.trim().toLowerCase();
    cleaned = cleaned.replace(/[?.!,;:]+$/g, '');
    cleaned = cleaned.replace(/[?.!,;:]+/g, ' ');
    for (const sw of stopwords) {
      cleaned = cleaned.replace(new RegExp(`(^|\\s)${sw}($|\\s)`, 'gi'), ' ');
    }
    cleaned = cleaned.replace(/\s+/g, ' ').trim();
    return cleaned;
  }
  
  for (const pattern of pricePatterns) {
    const match = message.match(pattern);
    if (match && match[1]) {
      const extracted = cleanExtractedToken(match[1]);
      const symbol = resolveSymbol(extracted);
      if (symbol) {
        return { isStockQuery: true, symbol, queryType: "price" };
      }
    }
  }
  
  if (conversationHistory && conversationHistory.length > 0) {
    const followUpPatterns = [
      /^class\s+(?:a|b|c)(?:\s+(?:price|stock|shares?))?[?.!]*$/i,
      /^(?:what about|how about|and|also)\s+(.+)/i,
      /^(?:that one|this one|it|them|the other one)[?.!]*$/i,
      /^(?:and|also)\s+([a-z0-9\s]+)[?.!]*$/i,
    ];
    
    const isFollowUp = followUpPatterns.some(p => p.test(lowerMessage));
    
    if (isFollowUp) {
      const recentMessages = conversationHistory.slice(-8);
      let lastResolvedSymbol: string | null = null;
      let lastCompanyContext: string | null = null;
      
      for (let i = recentMessages.length - 1; i >= 0; i--) {
        const msg = recentMessages[i];
        const content = msg.content;
        
        const symbolMatches = content.match(/\b([A-Z0-9]{1,7}(?:\.[A-Z0-9]{1,5})?(?:-[A-Z0-9]{1,8})?)\b/g);
        if (symbolMatches) {
          const excludeWords = ['I', 'A', 'AT', 'TO', 'IN', 'ON', 'OR', 'BY', 'SO', 'IT', 'IF', 'IS', 'AN', 'AS', 'BE', 'DO', 'NO', 'OF', 'UP', 'AM', 'PM', 'THE', 'FOR', 'AND', 'BUT', 'NOT', 'YOU', 'ARE', 'ALL', 'DAY', 'LOW', 'BUY', 'HOW', 'OUT', 'GET', 'CAN', 'SET', 'USE', 'ANY', 'MAY', 'HAS', 'OUR', 'USD', 'YES'];
          const validSymbols = symbolMatches.filter(s => !excludeWords.includes(s));
          if (validSymbols.length > 0 && !lastResolvedSymbol) {
            lastResolvedSymbol = validSymbols[validSymbols.length - 1];
          }
        }
        
        if (!lastCompanyContext) {
          for (const [name] of Object.entries(COMPANY_TO_SYMBOL)) {
            if (content.toLowerCase().includes(name)) {
              lastCompanyContext = name;
              break;
            }
          }
        }
      }
      
      if (lowerMessage.includes('class a')) {
        if (lastCompanyContext?.includes('google') || lastCompanyContext?.includes('alphabet') || lastResolvedSymbol === 'GOOGL' || lastResolvedSymbol === 'GOOG') {
          return { isStockQuery: true, symbol: 'GOOGL', queryType: "price" };
        }
        if (lastCompanyContext?.includes('berkshire') || lastResolvedSymbol?.startsWith('BRK')) {
          return { isStockQuery: true, symbol: 'BRK.A', queryType: "price" };
        }
      }
      if (lowerMessage.includes('class b')) {
        if (lastCompanyContext?.includes('berkshire') || lastResolvedSymbol?.startsWith('BRK')) {
          return { isStockQuery: true, symbol: 'BRK.B', queryType: "price" };
        }
      }
      
      const whatAboutMatch = lowerMessage.match(/^(?:what about|how about|and|also)\s+([a-z0-9\s]+)/i);
      if (whatAboutMatch) {
        const newSymbol = resolveSymbol(whatAboutMatch[1].trim());
        if (newSymbol) {
          return { isStockQuery: true, symbol: newSymbol, queryType: "price" };
        }
      }
      
      if (lastResolvedSymbol) {
        return { isStockQuery: true, symbol: lastResolvedSymbol, queryType: "price" };
      }
      if (lastCompanyContext) {
        const sym = COMPANY_TO_SYMBOL[lastCompanyContext];
        if (sym) {
          return { isStockQuery: true, symbol: sym, queryType: "price" };
        }
      }
    }
  }
  
  return noMatch;
}

export function parseMarketQueryCommand(message: string): MarketQueryCommand {
  const lowerMessage = message.toLowerCase();
  
  const trendingPatterns = [
    /what.*(?:stocks?|tickers?).*(?:trending|popular|hot)/i,
    /(?:trending|popular|hot).*(?:stocks?|tickers?)/i,
    /what'?s?\s+(?:trending|hot|popular)/i,
    /show.*(?:trending|popular)/i,
    /(?:top|best).*(?:stocks?|tickers?).*(?:today|now|right now|currently)/i,
    /(?:latest|current|recent).*(?:trending|popular|hot)/i,
    /what.*(?:people|traders?).*(?:buying|trading)/i,
    /what.*should.*(?:buy|trade|invest)/i,
    /give.*(?:trending|popular|hot)/i,
  ];
  
  const gainersPatterns = [
    /(?:top|biggest?|todays?).*(?:gainers?|winners?)/i,
    /what.*(?:stocks?|tickers?).*(?:up|gaining|rising)/i,
    /(?:stocks?|tickers?).*(?:up|gaining).*(?:most|today|now)/i,
    /show.*gainers?/i,
    /who.*(?:up|winning|gaining)/i,
    /(?:best|top).*perform(?:ing|ers?)/i,
    /what'?s?\s+(?:up|green|winning)/i,
    /(?:latest|current|today'?s?).*gainers?/i,
  ];
  
  const losersPatterns = [
    /(?:top|biggest?|todays?).*(?:losers?|decliners?)/i,
    /what.*(?:stocks?|tickers?).*(?:down|falling|dropping|tanking)/i,
    /(?:stocks?|tickers?).*(?:down|falling).*(?:most|today|now)/i,
    /show.*losers?/i,
    /who.*(?:down|losing|falling)/i,
    /(?:worst|bottom).*perform(?:ing|ers?)/i,
    /what'?s?\s+(?:down|red|losing)/i,
    /(?:latest|current|today'?s?).*losers?/i,
  ];
  
  const activePatterns = [
    /(?:most).*(?:active|traded)/i,
    /(?:highest?).*volume/i,
    /what.*(?:stocks?|tickers?).*(?:active|volume)/i,
    /show.*(?:active|volume)/i,
    /(?:biggest?|highest?).*(?:trading|volume)/i,
    /(?:heavy|high).*volume/i,
    /what.*(?:trading|traded).*(?:most|heavily)/i,
  ];
  
  const moversPatterns = [
    /market\s+movers?/i,
    /(?:biggest?|top).*movers?/i,
    /what'?s?\s+moving/i,
    /show.*movers?/i,
    /market\s+(?:action|overview|summary)/i,
    /what'?s?\s+happening.*(?:market|stocks?)/i,
    /(?:give|show).*(?:overview|summary)/i,
  ];
  
  for (const pattern of trendingPatterns) {
    if (pattern.test(lowerMessage)) {
      return { isMarketQuery: true, queryType: "trending" };
    }
  }
  
  for (const pattern of gainersPatterns) {
    if (pattern.test(lowerMessage)) {
      return { isMarketQuery: true, queryType: "gainers" };
    }
  }
  
  for (const pattern of losersPatterns) {
    if (pattern.test(lowerMessage)) {
      return { isMarketQuery: true, queryType: "losers" };
    }
  }
  
  for (const pattern of activePatterns) {
    if (pattern.test(lowerMessage)) {
      return { isMarketQuery: true, queryType: "active" };
    }
  }
  
  for (const pattern of moversPatterns) {
    if (pattern.test(lowerMessage)) {
      return { isMarketQuery: true, queryType: "movers" };
    }
  }
  
  return { isMarketQuery: false, queryType: null };
}

export interface StreamOptions {
  messages: ChatMessage[];
  onPortfolioCommand?: (command: PortfolioCommand) => Promise<string>;
  portfolioContext?: PortfolioContext;
  marketContext?: MarketContext;
}

// Generate streaming chat response with context
export async function* streamChatResponse(
  options: StreamOptions
): AsyncGenerator<string, void, unknown> {
  const { messages, onPortfolioCommand, portfolioContext, marketContext } = options;
  
  // Check for portfolio commands in the latest user message
  const lastUserMessage = messages.filter(m => m.role === "user").pop();
  if (lastUserMessage && onPortfolioCommand) {
    const command = parsePortfolioCommand(lastUserMessage.content);
    if (command.action) {
      const result = await onPortfolioCommand(command);
      yield result;
      return;
    }
  }

  // Build system prompt with context
  const systemPrompt = buildSystemPrompt(portfolioContext, marketContext);
  const config = getModelConfig();

  const stream = await anthropic.messages.stream({
    model: config.model,
    max_tokens: config.max_tokens,
    temperature: config.temperature,
    system: systemPrompt,
    messages: messages.map(m => ({
      role: m.role,
      content: m.content,
    })),
  });

  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      yield event.delta.text;
    }
  }
}

// Enhanced streaming interface for tool-enabled chat
export interface StreamWithToolsOptions extends StreamOptions {
  toolContext: ToolExecutionContext;
  enableTools?: boolean;
}

// Stream event types for tool-enabled chat
export type StreamEvent = 
  | { type: "text"; content: string }
  | { type: "tool_call_start"; toolName: string; toolId: string }
  | { type: "tool_call_result"; toolId: string; result: { summary: string } }
  | { type: "command_result"; result: string }
  | { type: "done" };

// Sanitize tool results before streaming to client to protect sensitive data
// Only expose high-level summaries, not raw portfolio/account data
function sanitizeToolResult(toolName: string, result: any): { summary: string } {
  switch (toolName) {
    case "get_quote":
      return { summary: result.price ? `${result.symbol}: $${result.price.toFixed(2)}` : "Quote unavailable" };
    case "get_positions":
      const count = Array.isArray(result) ? result.length : 0;
      return { summary: `Retrieved ${count} position${count !== 1 ? 's' : ''}` };
    case "get_buying_power":
      return { summary: "Buying power retrieved" };
    case "validate_order":
      return { summary: result.valid ? "Order validation passed" : "Order validation failed" };
    case "get_options_chain":
      return { summary: result.expirations ? `Options chain with ${result.expirations.length} expirations` : "Options data retrieved" };
    case "set_alert":
      return { summary: result.success ? `Alert created for ${result.message?.split(" ")[result.message?.split(" ").indexOf("when") + 1] || "stock"}` : "Alert creation failed" };
    default:
      return { summary: "Tool executed" };
  }
}

// Enhanced streaming with function tool support
export async function* streamChatWithTools(
  options: StreamWithToolsOptions
): AsyncGenerator<StreamEvent, void, unknown> {
  const { messages, onPortfolioCommand, portfolioContext, marketContext, toolContext, enableTools = true } = options;
  
  // Check for portfolio commands in the latest user message first
  const lastUserMessage = messages.filter(m => m.role === "user").pop();
  if (lastUserMessage && onPortfolioCommand) {
    const command = parsePortfolioCommand(lastUserMessage.content);
    if (command.action) {
      const result = await onPortfolioCommand(command);
      yield { type: "command_result", result };
      yield { type: "done" };
      return;
    }
  }

  const systemPrompt = buildSystemPrompt(portfolioContext, marketContext);
  const config = getModelConfig();
  
  // Initial API call with tools
  let currentMessages: Anthropic.MessageParam[] = messages.map(m => ({
    role: m.role,
    content: m.content,
  }));
  
  // Tool loop - Claude may call tools multiple times
  let iterationCount = 0;
  const MAX_TOOL_ITERATIONS = 5; // Prevent infinite loops
  
  while (iterationCount < MAX_TOOL_ITERATIONS) {
    iterationCount++;
    
    // Create message with or without tools
    const createParams: Anthropic.MessageCreateParams = {
      model: config.model,
      max_tokens: config.max_tokens,
      temperature: config.temperature,
      system: systemPrompt,
      messages: currentMessages,
      ...(enableTools ? { tools: TRADING_TOOLS } : {})
    };
    
    const response = await anthropic.messages.create(createParams);
    
    // Check if we need to handle tool calls
    let hasToolUse = false;
    const toolResults: Array<{
      tool_use_id: string;
      content: string;
      is_error?: boolean;
    }> = [];
    
    // Separate text blocks and tool use blocks for parallel execution
    const textBlocks: Anthropic.TextBlock[] = [];
    const toolUseBlocks: Anthropic.ToolUseBlock[] = [];

    for (const block of response.content) {
      if (block.type === "text") {
        textBlocks.push(block);
      } else if (block.type === "tool_use") {
        toolUseBlocks.push(block);
      }
    }

    // Yield text content first
    for (const textBlock of textBlocks) {
      yield { type: "text", content: textBlock.text };
    }

    // Execute all tool calls in parallel for better performance
    if (toolUseBlocks.length > 0) {
      hasToolUse = true;
      
      // Signal all tool call starts first so UI can show loading states
      for (const block of toolUseBlocks) {
        yield { type: "tool_call_start", toolName: block.name, toolId: block.id };
      }
      
      // Execute all tools in parallel
      const toolPromises = toolUseBlocks.map(async (block) => {
        const toolId = block.id;
        const toolName = block.name;
        const toolInput = block.input;
        
        try {
          const result = await executeToolCall(toolName, toolInput, toolContext);
          return {
            toolId,
            toolName,
            success: true,
            result,
            content: typeof result === 'string' ? result : JSON.stringify(result)
          };
        } catch (error: any) {
          return {
            toolId,
            toolName,
            success: false,
            result: { error: error.message || "Tool execution failed" },
            content: JSON.stringify({ error: error.message || "Tool execution failed" })
          };
        }
      });
      
      // Wait for all tools to complete
      const toolOutcomes = await Promise.all(toolPromises);
      
      // Yield results and build toolResults array
      for (const outcome of toolOutcomes) {
        yield { 
          type: "tool_call_result", 
          toolId: outcome.toolId, 
          result: sanitizeToolResult(outcome.toolName, outcome.result) 
        };
        
        toolResults.push({
          tool_use_id: outcome.toolId,
          content: outcome.content,
          is_error: !outcome.success
        });
      }
    }
    
    // Exit if no tool calls were made OR Claude indicates it's done
    // stop_reason === "end_turn" means Claude finished its response
    // stop_reason === "tool_use" means more tool calls expected
    if (!hasToolUse || response.stop_reason === "end_turn") {
      yield { type: "done" };
      return;
    }
    
    // Build properly formatted messages following Anthropic's API contract
    // Assistant message preserves full content array with TextBlock and ToolUseBlock
    const assistantMessage: Anthropic.MessageParam = {
      role: "assistant",
      content: response.content
    };
    
    // User message with tool_result uses proper ToolResultBlockParam structure
    const toolResultMessage: Anthropic.MessageParam = {
      role: "user",
      content: toolResults.map(tr => ({
        type: "tool_result" as const,
        tool_use_id: tr.tool_use_id,
        content: tr.content,
        ...(tr.is_error ? { is_error: true } : {})
      }))
    };
    
    // Append both messages and continue loop to get final response
    currentMessages = [
      ...currentMessages,
      assistantMessage,
      toolResultMessage
    ];
  }
  
  // If we hit max iterations, yield done
  yield { type: "done" };
}

// Non-streaming chat response for simpler use cases
export async function generateChatResponse(
  messages: ChatMessage[],
  portfolioContext?: PortfolioContext,
  marketContext?: MarketContext
): Promise<string> {
  const systemPrompt = buildSystemPrompt(portfolioContext, marketContext);
  const config = getModelConfig();
  const message = await anthropic.messages.create({
    model: config.model,
    max_tokens: config.max_tokens,
    temperature: config.temperature,
    system: systemPrompt,
    messages: messages.map(m => ({
      role: m.role,
      content: m.content,
    })),
  });

  const content = message.content[0];
  if (content.type === "text") {
    return content.text;
  }
  throw new Error("Unexpected response type");
}

// Helper function to check if error is rate limit
function isRateLimitError(error: any): boolean {
  const errorMsg = error?.message || String(error);
  return (
    errorMsg.includes("429") ||
    errorMsg.includes("RATELIMIT_EXCEEDED") ||
    errorMsg.toLowerCase().includes("quota") ||
    errorMsg.toLowerCase().includes("rate limit")
  );
}

// Custom error class for abort
class AbortRetryError extends Error {
  readonly originalError: unknown;
  constructor(error: unknown) {
    super(error instanceof Error ? error.message : String(error));
    this.name = "AbortRetryError";
    this.originalError = error;
  }
}

// Batch process multiple prompts with rate limiting
export async function batchProcessPrompts(prompts: string[]): Promise<string[]> {
  const limit = pLimit(2);
  const config = getModelConfig();
  
  const processingPromises = prompts.map((prompt) =>
    limit(() =>
      pRetry(
        async () => {
          try {
            const message = await anthropic.messages.create({
              model: config.model,
              max_tokens: 8192,
              temperature: config.temperature,
              messages: [{ role: "user", content: prompt }],
            });
            const content = message.content[0];
            return content.type === "text" ? content.text : "";
          } catch (error: unknown) {
            if (isRateLimitError(error)) {
              throw error;
            }
            // Non-rate-limit errors should not be retried
            throw new AbortRetryError(error);
          }
        },
        {
          retries: 7,
          minTimeout: 2000,
          maxTimeout: 128000,
          factor: 2,
          shouldRetry: (error) => !(error instanceof AbortRetryError),
        }
      )
    )
  );
  
  return await Promise.all(processingPromises);
}

// ============================================================================
// ADVANCED AI FEATURES: Multi-Agent Analysis System
// ============================================================================

// Agent signal types
export interface AgentSignal {
  agent: 'technical' | 'sentiment' | 'fundamental';
  signal: number; // -1 (bearish) to 1 (bullish)
  confidence: number; // 0 to 1
  reasoning: string;
  indicators?: Record<string, any>;
}

export interface MarketRegime {
  regime: 'bullish' | 'bearish' | 'neutral' | 'high_volatility';
  confidence: number;
  description: string;
  recommendedStrategy: string;
}

export interface MultiAgentAnalysis {
  symbol: string;
  timestamp: string;
  agents: AgentSignal[];
  consensus: {
    signal: number;
    confidence: number;
    recommendation: 'strong_buy' | 'buy' | 'hold' | 'sell' | 'strong_sell';
  };
  bullBearDebate: {
    bullCase: string;
    bearCase: string;
    winner: 'bull' | 'bear' | 'neutral';
  };
  marketRegime: MarketRegime;
  reactTrace: Array<{
    thought: string;
    action: string;
    observation: string;
  }>;
  // Which model actually produced this analysis (surfaced to the UI).
  analysisProvider: AnalysisProviderMeta;
}

// The built-in Claude completer: powers analysis by default and whenever a
// bring-your-own provider is unavailable. Uses the shared Anthropic client and
// the configured model/temperature.
const claudeCompleter: CompletionFn = async ({
  prompt,
  system,
  maxTokens,
  temperature,
}) => {
  const config = getModelConfig();
  const response = await anthropic.messages.create({
    model: config.model,
    max_tokens: maxTokens ?? 500,
    temperature: temperature ?? config.temperature,
    ...(system ? { system } : {}),
    messages: [{ role: "user", content: prompt }],
  });
  const content = response.content[0];
  return content?.type === "text" ? content.text : "";
};

function defaultClaudeMeta(): AnalysisProviderMeta {
  return {
    provider: "claude",
    model: getModelConfig().model,
    label: "Built-in (Claude)",
  };
}

// Strict shape for an analysis agent's JSON. Numbers are coerced (models often
// emit them as strings) and clamped by the caller; bad output → neutral fallback.
const agentSignalJsonSchema = z.object({
  signal: z.coerce.number(),
  confidence: z.coerce.number(),
  reasoning: z.string().trim().min(1),
  indicators: z.record(z.any()).optional(),
});

const bullBearJsonSchema = z.object({
  bullCase: z.string().trim().min(1),
  bearCase: z.string().trim().min(1),
  winner: z.enum(["bull", "bear", "neutral"]).catch("neutral"),
});

// Parse + validate one agent's raw text into a clamped AgentSignal, returning a
// neutral fallback when the model returns nothing usable.
function parseAgentSignal(
  agent: AgentSignal["agent"],
  raw: string,
): AgentSignal {
  const parsed = agentSignalJsonSchema.safeParse(extractJsonObject(raw));
  if (!parsed.success) {
    return {
      agent,
      signal: 0,
      confidence: 0.5,
      reasoning: `Unable to complete ${agent} analysis at this time.`,
    };
  }
  return {
    agent,
    signal: Math.max(-1, Math.min(1, parsed.data.signal)),
    confidence: Math.max(0, Math.min(1, parsed.data.confidence)),
    reasoning: parsed.data.reasoning,
    indicators: parsed.data.indicators,
  };
}

// Technical Agent Analysis
async function runTechnicalAgent(
  symbol: string,
  priceData: any,
  complete: CompletionFn,
): Promise<AgentSignal> {
  const prompt = `You are a Technical Analysis AI Agent. Analyze the following market data for ${symbol} and provide a trading signal.

Price Data:
- Current Price: $${priceData.price}
- Change: ${priceData.change >= 0 ? '+' : ''}${priceData.change} (${priceData.changePercent >= 0 ? '+' : ''}${priceData.changePercent}%)
- Day Range: $${priceData.low || 'N/A'} - $${priceData.high || 'N/A'}
- Volume: ${priceData.volume?.toLocaleString() || 'N/A'}

Analyze using:
1. Price action and momentum
2. Volume analysis
3. Support/resistance levels
4. Trend direction

Respond in this exact JSON format:
{
  "signal": <number from -1 (very bearish) to 1 (very bullish)>,
  "confidence": <number from 0 to 1>,
  "reasoning": "<2-3 sentence technical analysis>",
  "indicators": {
    "trend": "<uptrend|downtrend|sideways>",
    "momentum": "<strong|moderate|weak>",
    "volumeSignal": "<bullish|bearish|neutral>"
  }
}`;

  try {
    const text = await complete({ prompt, maxTokens: 500 });
    return parseAgentSignal('technical', text);
  } catch (e) {
    console.error("Technical agent error:", e);
    return {
      agent: 'technical',
      signal: 0,
      confidence: 0.5,
      reasoning: "Unable to complete technical analysis at this time.",
    };
  }
}

// Sentiment Agent Analysis
async function runSentimentAgent(
  symbol: string,
  complete: CompletionFn,
): Promise<AgentSignal> {
  const prompt = `You are a Market Sentiment AI Agent. Analyze the current market sentiment for ${symbol}.

Consider:
1. General market mood (fear vs greed)
2. Recent news sentiment for this sector
3. Social media buzz patterns
4. Institutional positioning tendencies

Note: You are simulating sentiment analysis based on your knowledge of typical market patterns and ${symbol}'s characteristics.

Respond in this exact JSON format:
{
  "signal": <number from -1 (very bearish) to 1 (very bullish)>,
  "confidence": <number from 0 to 1>,
  "reasoning": "<2-3 sentence sentiment analysis>",
  "indicators": {
    "fearGreedIndex": <number 0-100>,
    "newsSentiment": "<positive|negative|neutral>",
    "socialBuzz": "<high|moderate|low>"
  }
}`;

  try {
    const text = await complete({ prompt, maxTokens: 500 });
    return parseAgentSignal('sentiment', text);
  } catch (e) {
    console.error("Sentiment agent error:", e);
    return {
      agent: 'sentiment',
      signal: 0,
      confidence: 0.5,
      reasoning: "Unable to complete sentiment analysis at this time.",
    };
  }
}

// Fundamental Agent Analysis
async function runFundamentalAgent(
  symbol: string,
  complete: CompletionFn,
): Promise<AgentSignal> {
  const prompt = `You are a Fundamental Analysis AI Agent. Analyze ${symbol} from a fundamental perspective.

Consider:
1. Business model strength
2. Competitive position
3. Growth prospects
4. Valuation relative to peers
5. Financial health indicators

Note: Provide analysis based on your knowledge of ${symbol}'s business fundamentals.

Respond in this exact JSON format:
{
  "signal": <number from -1 (very bearish) to 1 (very bullish)>,
  "confidence": <number from 0 to 1>,
  "reasoning": "<2-3 sentence fundamental analysis>",
  "indicators": {
    "valuationRating": "<undervalued|fairvalue|overvalued>",
    "growthOutlook": "<strong|moderate|weak>",
    "financialHealth": "<excellent|good|fair|poor>"
  }
}`;

  try {
    const text = await complete({ prompt, maxTokens: 500 });
    return parseAgentSignal('fundamental', text);
  } catch (e) {
    console.error("Fundamental agent error:", e);
    return {
      agent: 'fundamental',
      signal: 0,
      confidence: 0.5,
      reasoning: "Unable to complete fundamental analysis at this time.",
    };
  }
}

// Bull/Bear Debate
async function runBullBearDebate(
  symbol: string,
  agents: AgentSignal[],
  complete: CompletionFn,
): Promise<{ bullCase: string; bearCase: string; winner: 'bull' | 'bear' | 'neutral' }> {
  const agentSummary = agents.map(a => `${a.agent}: signal=${a.signal.toFixed(2)}, reasoning: ${a.reasoning}`).join('\n');
  
  const prompt = `You are moderating a Bull vs Bear debate for ${symbol}.

Agent Analysis Summary:
${agentSummary}

Generate a concise debate between a Bull Agent and Bear Agent. Then declare a winner based on the strength of arguments and current market evidence.

Respond in this exact JSON format:
{
  "bullCase": "<2-3 sentence bull case>",
  "bearCase": "<2-3 sentence bear case>",
  "winner": "<bull|bear|neutral>"
}`;

  try {
    const text = await complete({ prompt, maxTokens: 500 });
    const parsed = bullBearJsonSchema.safeParse(extractJsonObject(text));
    if (parsed.success) {
      return parsed.data;
    }
  } catch (e) {
    console.error("Bull/Bear debate error:", e);
  }
  
  return {
    bullCase: "Insufficient data for bull case.",
    bearCase: "Insufficient data for bear case.",
    winner: 'neutral',
  };
}

// Market Regime Detection
export async function detectMarketRegime(spyData: any, vix?: number): Promise<MarketRegime> {
  const vixLevel = vix || 20;
  const changePercent = spyData?.changePercent || 0;
  
  let regime: MarketRegime['regime'];
  let confidence: number;
  let description: string;
  let recommendedStrategy: string;
  
  if (vixLevel > 30) {
    regime = 'high_volatility';
    confidence = 0.85;
    description = `VIX at ${vixLevel.toFixed(1)} indicates elevated fear. Markets are in crisis mode.`;
    recommendedStrategy = 'Reduce position sizes, consider protective puts, sell premium cautiously.';
  } else if (vixLevel > 20 && changePercent < -0.5) {
    regime = 'bearish';
    confidence = 0.7;
    description = `Elevated VIX (${vixLevel.toFixed(1)}) with negative price action suggests bearish conditions.`;
    recommendedStrategy = 'Consider defensive positions, hedge long exposure, look for short opportunities.';
  } else if (changePercent > 0.3 && vixLevel < 18) {
    regime = 'bullish';
    confidence = 0.75;
    description = `Low VIX (${vixLevel.toFixed(1)}) with positive momentum indicates bullish regime.`;
    recommendedStrategy = 'Favor long positions, consider selling puts, ride the trend.';
  } else {
    regime = 'neutral';
    confidence = 0.6;
    description = `Mixed signals with VIX at ${vixLevel.toFixed(1)}. Market is range-bound.`;
    recommendedStrategy = 'Use mean-reversion strategies, sell strangles, wait for clearer signals.';
  }
  
  return { regime, confidence, description, recommendedStrategy };
}

// Main Multi-Agent Analysis Function
export async function runMultiAgentAnalysis(
  symbol: string,
  priceData: any,
  marketData?: { spyPrice: number; spyChange: number; spyChangePercent: number; vix?: number },
  options?: { completer?: CompletionFn; meta?: AnalysisProviderMeta },
): Promise<MultiAgentAnalysis> {
  const timestamp = new Date().toISOString();
  // Which model runs the agents — built-in Claude unless a session selected a
  // bring-your-own provider. If a BYO provider is selected but fails at call
  // time (revoked key, quota, outage), the first failure latches the whole
  // analysis to the built-in Claude so we never return neutral results that are
  // misleadingly labelled as the BYO provider.
  const byoCompleter =
    options?.completer && options?.meta && options.meta.provider !== "claude"
      ? options.completer
      : undefined;
  const selectedMeta = options?.meta ?? defaultClaudeMeta();

  let latchedToClaude = false;
  const complete: CompletionFn = byoCompleter
    ? async (req) => {
        if (latchedToClaude) return claudeCompleter(req);
        try {
          return await byoCompleter(req);
        } catch (err) {
          latchedToClaude = true;
          console.warn(
            `[multi-agent] ${selectedMeta.provider} provider failed; falling back to built-in Claude:`,
            (err as Error)?.message,
          );
          return claudeCompleter(req);
        }
      }
    : options?.completer ?? claudeCompleter;

  // Run all agents in parallel
  const [technicalSignal, sentimentSignal, fundamentalSignal] = await Promise.all([
    runTechnicalAgent(symbol, priceData, complete),
    runSentimentAgent(symbol, complete),
    runFundamentalAgent(symbol, complete),
  ]);

  const agents = [technicalSignal, sentimentSignal, fundamentalSignal];
  
  // Calculate consensus (weighted average)
  const weights = { technical: 0.4, sentiment: 0.3, fundamental: 0.3 };
  const weightedSignal = agents.reduce((sum, a) => {
    return sum + a.signal * weights[a.agent] * a.confidence;
  }, 0);
  
  const avgConfidence = agents.reduce((sum, a) => sum + a.confidence, 0) / agents.length;
  
  // Determine recommendation
  let recommendation: MultiAgentAnalysis['consensus']['recommendation'];
  if (weightedSignal > 0.6) recommendation = 'strong_buy';
  else if (weightedSignal > 0.2) recommendation = 'buy';
  else if (weightedSignal > -0.2) recommendation = 'hold';
  else if (weightedSignal > -0.6) recommendation = 'sell';
  else recommendation = 'strong_sell';
  
  // Run Bull/Bear debate
  const bullBearDebate = await runBullBearDebate(symbol, agents, complete);
  
  // Detect market regime
  const marketRegime = await detectMarketRegime(
    marketData || priceData,
    marketData?.vix
  );

  // Reflect any mid-run fallback (agents or debate) in the reported provenance.
  const analysisProvider: AnalysisProviderMeta = latchedToClaude
    ? { ...defaultClaudeMeta(), fallbackUsed: true }
    : selectedMeta;
  
  // Build ReAct trace
  const reactTrace = [
    {
      thought: `Need to analyze ${symbol} using multiple perspectives`,
      action: 'run_technical_analysis',
      observation: `Technical signal: ${technicalSignal.signal.toFixed(2)} (${technicalSignal.reasoning})`,
    },
    {
      thought: 'Technical complete, now assess market sentiment',
      action: 'run_sentiment_analysis',
      observation: `Sentiment signal: ${sentimentSignal.signal.toFixed(2)} (${sentimentSignal.reasoning})`,
    },
    {
      thought: 'Need fundamental perspective for complete picture',
      action: 'run_fundamental_analysis',
      observation: `Fundamental signal: ${fundamentalSignal.signal.toFixed(2)} (${fundamentalSignal.reasoning})`,
    },
    {
      thought: 'All agents complete, synthesizing consensus',
      action: 'calculate_consensus',
      observation: `Consensus: ${recommendation} with ${(avgConfidence * 100).toFixed(0)}% confidence`,
    },
  ];
  
  return {
    symbol,
    timestamp,
    agents,
    consensus: {
      signal: weightedSignal,
      confidence: avgConfidence,
      recommendation,
    },
    bullBearDebate,
    marketRegime,
    reactTrace,
    analysisProvider,
  };
}
