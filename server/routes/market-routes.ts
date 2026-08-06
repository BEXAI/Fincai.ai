import type { Express } from "express";
import { MarketDataService } from "../market-data";
import type { IStorage } from "../storage";
import { optionalAuth } from "../auth";

// Symbol validation constants
const MAX_SYMBOL_LENGTH = 21; // OCC options symbols can be up to 21 chars
const MAX_SYMBOLS_PER_REQUEST = 50;
const VALID_EQUITY_SYMBOL = /^[A-Z]{1,5}$/;
const VALID_INDEX_SYMBOL = /^\^[A-Z]{1,10}$/; // e.g., ^VIX, ^GSPC
const VALID_OCC_OPTION = /^[A-Z]{1,6}\d{6}[CP]\d{8}$/; // Standard OCC format

/**
 * Validates a stock/option symbol for security and correctness
 * Returns null if valid, error message if invalid
 */
function validateSymbol(symbol: string): string | null {
  if (!symbol || typeof symbol !== 'string') {
    return 'Symbol is required';
  }
  
  const trimmed = symbol.trim().toUpperCase();
  
  if (trimmed.length === 0) {
    return 'Symbol cannot be empty';
  }
  
  if (trimmed.length > MAX_SYMBOL_LENGTH) {
    return `Symbol too long (max ${MAX_SYMBOL_LENGTH} characters)`;
  }
  
  // Check for dangerous characters (prevent injection)
  if (/[<>"'`;(){}[\]\\|&$]/.test(trimmed)) {
    return 'Symbol contains invalid characters';
  }
  
  // Valid patterns: equity (AAPL), index (^VIX), or OCC option
  const isValidEquity = VALID_EQUITY_SYMBOL.test(trimmed);
  const isValidIndex = VALID_INDEX_SYMBOL.test(trimmed);
  const isValidOption = VALID_OCC_OPTION.test(trimmed);
  
  // Also allow special symbols like VIX (without ^)
  const isKnownSpecial = ['VIX', 'DXY', 'TNX', 'TYX'].includes(trimmed);
  
  if (!isValidEquity && !isValidIndex && !isValidOption && !isKnownSpecial) {
    return 'Invalid symbol format';
  }
  
  return null;
}

/**
 * Validates multiple symbols, returns array of valid symbols and any errors
 */
function validateSymbols(symbols: string[]): { valid: string[]; errors: string[] } {
  const valid: string[] = [];
  const errors: string[] = [];
  
  if (symbols.length > MAX_SYMBOLS_PER_REQUEST) {
    errors.push(`Too many symbols (max ${MAX_SYMBOLS_PER_REQUEST})`);
    return { valid: [], errors };
  }
  
  for (const symbol of symbols) {
    const error = validateSymbol(symbol);
    if (error) {
      errors.push(`${symbol}: ${error}`);
    } else {
      valid.push(symbol.trim().toUpperCase());
    }
  }
  
  return { valid, errors };
}

export function registerMarketRoutes(app: Express, marketDataService: MarketDataService, storage?: IStorage): void {
  // GET /api/market/hot-symbols - Get list of commonly tracked symbols
  app.get("/api/market/hot-symbols", (req, res) => {
    res.json({
      symbols: MarketDataService.getHotSymbols(),
      description: "Commonly tracked symbols with pre-warmed cache"
    });
  });

  // GET /api/market/summary - Get market summary for key indices
  app.get("/api/market/summary", async (req, res) => {
    try {
      const symbols = ["QQQ", "WMT", "SPY", "VIX"];
      const quotes = await marketDataService.getMultipleQuotes(symbols);

      res.json({
        QQQ: quotes.QQQ,
        WMT: quotes.WMT,
        SPY: quotes.SPY,
        VIX: quotes.VIX,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/market/quote/:symbol - Get quote for a single symbol
  app.get("/api/market/quote/:symbol", async (req, res) => {
    try {
      const { symbol } = req.params;
      const validationError = validateSymbol(symbol);
      if (validationError) {
        return res.status(400).json({ error: validationError });
      }
      
      const quote = await marketDataService.getQuote(symbol.toUpperCase());
      res.json(quote);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/market/quotes - Get quotes for multiple symbols
  app.get("/api/market/quotes", async (req, res) => {
    try {
      const symbolsParam = req.query.symbols as string | undefined;
      if (!symbolsParam) {
        return res.status(400).json({ error: "symbols query parameter is required" });
      }

      const rawSymbols = symbolsParam.split(",").map((s) => s.trim());
      const { valid: symbols, errors } = validateSymbols(rawSymbols);
      
      if (symbols.length === 0) {
        return res.status(400).json({ error: "No valid symbols provided", details: errors });
      }
      
      const quotes = await marketDataService.getMultipleQuotes(symbols);
      
      // Include validation warnings if some symbols were invalid
      if (errors.length > 0) {
        return res.json({ quotes, warnings: errors });
      }
      
      res.json(quotes);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/market/intraday/:symbol - Get intraday price data
  app.get("/api/market/intraday/:symbol", async (req, res) => {
    try {
      const { symbol } = req.params;
      const validationError = validateSymbol(symbol);
      if (validationError) {
        return res.status(400).json({ error: validationError });
      }
      
      const interval = (req.query.interval as "1m" | "5m" | "15m" | "1h") || "5m";
      const result = await marketDataService.getIntradayData(symbol.toUpperCase(), interval);
      
      if (!result.data || result.data.length === 0) {
        return res.status(503).json({ 
          error: "Market data temporarily unavailable",
          message: `Unable to fetch intraday data for ${symbol}` 
        });
      }
      
      const formattedData = result.data.map((point) => ({
        time: point.timestamp,
        price: point.close,
        open: point.open,
        high: point.high,
        low: point.low,
        volume: point.volume,
      }));
      
      res.json({ data: formattedData, source: result.source });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/market/historical/:symbol - Get historical price data
  app.get("/api/market/historical/:symbol", async (req, res) => {
    try {
      const { symbol } = req.params;
      const validationError = validateSymbol(symbol);
      if (validationError) {
        return res.status(400).json({ error: validationError });
      }
      
      const period = (req.query.period as "1d" | "5d" | "1mo" | "3mo" | "6mo" | "ytd" | "1y" | "2y" | "5y") || "1mo";
      const data = await marketDataService.getHistoricalData(symbol.toUpperCase(), period);
      
      if (!data || data.length === 0) {
        return res.status(503).json({ 
          error: "Market data temporarily unavailable",
          message: `Unable to fetch historical data for ${symbol}` 
        });
      }
      
      const formattedData = data.map((point) => ({
        time: point.timestamp,
        price: point.close,
        open: point.open,
        high: point.high,
        low: point.low,
        volume: point.volume,
      }));
      
      res.json(formattedData);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/market/movers - Get market movers (gainers, losers, most active)
  app.get("/api/market/movers", async (req, res) => {
    try {
      const movers = await marketDataService.getMarketMovers();
      res.json(movers);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/market/trending - Get trending stocks
  app.get("/api/market/trending", async (req, res) => {
    try {
      const count = parseInt(req.query.count as string) || 10;
      const trending = await marketDataService.getTrendingStocks(count);
      res.json(trending);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/market-analysis/vix - Get VIX and volatility data
  app.get("/api/market-analysis/vix", async (req, res) => {
    try {
      const vixSymbol = "VIX";
      const quote = await marketDataService.getQuote(vixSymbol);

      if (!quote) {
        return res.status(503).json({ 
          error: "Market data temporarily unavailable",
          message: "Unable to fetch VIX data" 
        });
      }

      const vixValue = quote.price;
      let sentiment = "Unknown";
      let level = "moderate";
      
      if (vixValue < 15) {
        sentiment = "Low volatility - Market optimism";
        level = "low";
      } else if (vixValue < 25) {
        sentiment = "Moderate volatility - Normal conditions";
        level = "moderate";
      } else if (vixValue < 40) {
        sentiment = "Elevated volatility - Increased uncertainty";
        level = "elevated";
      } else {
        sentiment = "Extreme fear - High market stress";
        level = "extreme";
      }

      res.json({
        vix: vixValue,
        level,
        sentiment,
        optionsStrategy: vixValue > 25 
          ? "High IV - Consider selling premium (iron condors, covered calls)" 
          : "Low IV - Consider buying options (straddles, directional plays)",
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/options/chain/:symbol - Get options chain data
  app.get("/api/options/chain/:symbol", async (req, res) => {
    try {
      const { symbol } = req.params;
      const validationError = validateSymbol(symbol);
      if (validationError) {
        return res.status(400).json({ error: validationError });
      }
      
      const { expiration } = req.query;

      const optionsChain = await marketDataService.getOptionsChain(
        symbol.toUpperCase(),
        expiration as string | undefined
      );

      if (!optionsChain) {
        return res.status(503).json({ 
          error: "Options data temporarily unavailable",
          message: `Unable to fetch options chain for ${symbol.toUpperCase()}` 
        });
      }

      const chain = [
        ...optionsChain.calls.map(c => ({
          symbol: c.contractSymbol,
          strike: c.strike,
          expiration: c.expiration,
          type: "call" as const,
          bid: c.bid,
          ask: c.ask,
          last: c.last,
          volume: c.volume,
          openInterest: c.openInterest,
          impliedVolatility: c.impliedVolatility,
          inTheMoney: c.inTheMoney,
        })),
        ...optionsChain.puts.map(p => ({
          symbol: p.contractSymbol,
          strike: p.strike,
          expiration: p.expiration,
          type: "put" as const,
          bid: p.bid,
          ask: p.ask,
          last: p.last,
          volume: p.volume,
          openInterest: p.openInterest,
          impliedVolatility: p.impliedVolatility,
          inTheMoney: p.inTheMoney,
        })),
      ];

      res.json({
        chain,
        expirationDates: optionsChain.expirationDates,
        underlyingPrice: optionsChain.underlyingPrice,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/admin/market-audit - Query market data audit log entries (requires admin access)
  app.get("/api/admin/market-audit", optionalAuth, async (req: any, res) => {
    // Require authentication
    if (!req.user) {
      return res.status(401).json({ error: "Authentication required to access audit logs" });
    }
    // Additional admin authorization: fail-closed in production, open to authenticated users in development
    const isDev = process.env.NODE_ENV === 'development';
    const adminToken = req.headers['x-admin-token'];
    const sessionSecret = process.env.SESSION_SECRET;
    const adminEmails = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim()).filter(Boolean);
    const hasValidToken = sessionSecret ? adminToken === sessionSecret : false;
    const isAdminEmail = adminEmails.length > 0 && adminEmails.includes(req.user.email || '');
    // In production: require X-Admin-Token or ADMIN_EMAILS. In development: allow any authenticated user.
    if (!isDev && !hasValidToken && !isAdminEmail) {
      return res.status(403).json({ error: "Admin access required. Provide X-Admin-Token header or configure ADMIN_EMAILS." });
    }
    if (!storage) {
      return res.status(503).json({ error: "Audit log storage not available" });
    }
    try {
      const {
        symbol,
        provider,
        eventType,
        from,
        to,
        limit: limitParam,
        offset: offsetParam,
      } = req.query as Record<string, string | undefined>;

      const limit = Math.min(parseInt(limitParam || "100"), 500);
      const offset = parseInt(offsetParam || "0");

      const filters: {
        symbol?: string;
        provider?: string;
        eventType?: string;
        from?: Date;
        to?: Date;
        limit: number;
        offset: number;
      } = { limit, offset };

      if (symbol) filters.symbol = symbol.toUpperCase();
      if (provider) filters.provider = provider;
      if (eventType) filters.eventType = eventType;
      if (from) {
        const fromDate = new Date(from);
        if (!isNaN(fromDate.getTime())) filters.from = fromDate;
      }
      if (to) {
        const toDate = new Date(to);
        if (!isNaN(toDate.getTime())) filters.to = toDate;
      }

      const result = await storage.queryMarketAuditLogs(filters);
      res.json({
        entries: result.entries,
        total: result.total,
        limit,
        offset,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/market/prefetch - Prefetch stock quotes to warm the cache
  app.post("/api/market/prefetch", async (req, res) => {
    try {
      const { symbols } = req.body;
      if (!Array.isArray(symbols) || symbols.length === 0) {
        return res.status(400).json({ error: "symbols array required" });
      }
      
      const limitedSymbols = symbols.slice(0, 20);
      
      marketDataService.prefetchQuotes(limitedSymbols).catch(err => {
        console.warn("Prefetch error:", err.message);
      });
      
      res.json({ status: "prefetching", symbols: limitedSymbols });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/market/health - Comprehensive API health check for all market data providers
  app.get("/api/market/health", async (req, res) => {
    try {
      const healthReport = await marketDataService.checkProviderHealth();
      
      const overallStatus = healthReport.alphaVantage.status === "ok" ||
                           healthReport.alpaca.status === "ok" ? "healthy" : "degraded";
      
      res.json({
        status: overallStatus,
        timestamp: new Date().toISOString(),
        providers: healthReport,
        summary: {
          alphaVantage: healthReport.alphaVantage.status,
          alpaca: healthReport.alpaca.status,
          primaryAvailable: healthReport.alphaVantage.status === "ok",
          secondaryAvailable: healthReport.alpaca.status === "ok",
        }
      });
    } catch (error: any) {
      res.status(500).json({ 
        status: "error",
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });
}
