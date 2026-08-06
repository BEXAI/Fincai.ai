import type { IStorage } from "./storage";
import type { InsertMarketDataAuditLog, AuditEventType } from "@shared/schema";
export interface MarketMover {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  marketCap?: number;
}

export interface MarketMoversData {
  gainers: MarketMover[];
  losers: MarketMover[];
  mostActive: MarketMover[];
  trending: MarketMover[];
}

interface MarketQuote {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  high: number;
  low: number;
  open: number;
  previousClose: number;
  timestamp: string;
  source: "alphavantage" | "alpaca";
}

// Alpha Vantage API configuration
const ALPHA_VANTAGE_BASE_URL = "https://www.alphavantage.co/query";
const alphaVantageApiKey = process.env.ALPHA_VANTAGE_API_KEY || "";

// Throttle the "no Alpha Vantage data" warning so symbols Alpha Vantage simply
// doesn't cover (e.g. the VIX index, already served by Alpaca) don't spam the
// logs on every fallback. At most one warning per symbol per interval.
const AV_NO_DATA_WARN_INTERVAL_MS = 10 * 60_000;
const avNoDataLastWarn = new Map<string, number>();

// Alpaca Market Data API configuration
// Alpaca Market Data API configuration
const ALPACA_DATA_BASE_URL = "https://data.alpaca.markets/v2";
const ALPACA_OPTIONS_BASE_URL = "https://data.alpaca.markets/v1beta1/options";
const ALPACA_AUTH_URL = "https://authx.alpaca.markets/v1/oauth2/token";

// Trading API keys (for header-based auth)
const alpacaApiKey = process.env.ALPACA_API_KEY || "";
const alpacaApiSecret = process.env.ALPACA_API_SECRET || "";

// Broker API OAuth credentials (for OAuth 2.0 flow)
const alpacaClientId = process.env.ALPACA_CLIENT_ID || "";
const alpacaClientSecret = process.env.ALPACA_CLIENT_SECRET || "";

// OAuth token cache for Broker API
let brokerAccessToken: string | null = null;
let brokerTokenExpiry: number = 0;

// Get OAuth access token for Broker API
async function getBrokerAccessToken(): Promise<string | null> {
  // Return cached token if still valid (with 1 minute buffer)
  if (brokerAccessToken && Date.now() < brokerTokenExpiry - 60000) {
    return brokerAccessToken;
  }

  if (!alpacaClientId || !alpacaClientSecret) {
    console.warn('[MarketData] Broker API credentials not configured');
    return null;
  }

  try {
    console.log('[MarketData] Fetching new OAuth access token from Alpaca...');
    
    const response = await fetch(ALPACA_AUTH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: alpacaClientId,
        client_secret: alpacaClientSecret,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[MarketData] OAuth token error: ${response.status} - ${errorText}`);
      return null;
    }

    const data = await response.json();
    brokerAccessToken = data.access_token;
    // Token expires in 15 minutes, cache expiry time
    brokerTokenExpiry = Date.now() + (data.expires_in || 900) * 1000;
    
    console.log('[MarketData] Successfully obtained OAuth access token');
    return brokerAccessToken;
  } catch (error: any) {
    console.error('[MarketData] Failed to get OAuth token:', error.message);
    return null;
  }
}

// Generate auth headers for Alpaca Market Data API.
// The market data API (data.alpaca.markets) authenticates with Trading API key
// headers (APCA-API-KEY-ID / APCA-API-SECRET-KEY), so those are always preferred
// when available. The Broker OAuth flow is only used as a fallback for accounts
// that have Broker API client credentials but no Trading API keys.
async function getAlpacaAuthHeadersAsync(): Promise<Record<string, string>> {
  // Primary: Trading API key headers — the correct auth for the market data API.
  if (alpacaApiKey && alpacaApiSecret) {
    return {
      'APCA-API-KEY-ID': alpacaApiKey,
      'APCA-API-SECRET-KEY': alpacaApiSecret,
    };
  }

  // Fallback: Broker API OAuth Bearer token (only when no Trading API keys exist).
  if (alpacaClientId && alpacaClientSecret) {
    const token = await getBrokerAccessToken();
    if (token) {
      return {
        'Authorization': `Bearer ${token}`,
      };
    }
  }

  console.warn('[MarketData] No valid Alpaca credentials available');
  return {};
}

// Log Alpaca configuration on startup. The market data API authenticates with
// Trading API key headers when present; broker OAuth is only a fallback.
const ALPACA_ACTIVE_AUTH = (alpacaApiKey && alpacaApiSecret)
  ? 'trading-keys'
  : (alpacaClientId && alpacaClientSecret) ? 'broker-oauth' : 'none';
console.log(`[MarketData] Alpaca configured: auth=${ALPACA_ACTIVE_AUTH}, clientId=${alpacaClientId ? 'SET' : 'NOT SET'}, apiKey=${alpacaApiKey ? 'SET' : 'NOT SET'}`);

interface IntradayDataPoint {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface OptionsChainData {
  calls: OptionContract[];
  puts: OptionContract[];
  expirationDates: string[];
  underlyingPrice: number;
}

interface OptionContract {
  contractSymbol: string;
  strike: number;
  expiration: string;
  type: "call" | "put";
  bid: number;
  ask: number;
  last: number;
  volume: number;
  openInterest: number;
  impliedVolatility: number;
  inTheMoney: boolean;
}

// Curated list of common symbols for basic symbol search (Alpaca has no fuzzy search endpoint)
const COMMON_SYMBOLS: { symbol: string; name: string; type: string }[] = [
  { symbol: "SPY", name: "SPDR S&P 500 ETF Trust", type: "etf" },
  { symbol: "QQQ", name: "Invesco QQQ Trust", type: "etf" },
  { symbol: "IWM", name: "iShares Russell 2000 ETF", type: "etf" },
  { symbol: "DIA", name: "SPDR Dow Jones Industrial Average ETF", type: "etf" },
  { symbol: "VOO", name: "Vanguard S&P 500 ETF", type: "etf" },
  { symbol: "VTI", name: "Vanguard Total Stock Market ETF", type: "etf" },
  { symbol: "AAPL", name: "Apple Inc.", type: "equity" },
  { symbol: "MSFT", name: "Microsoft Corporation", type: "equity" },
  { symbol: "NVDA", name: "NVIDIA Corporation", type: "equity" },
  { symbol: "GOOGL", name: "Alphabet Inc. Class A", type: "equity" },
  { symbol: "GOOG", name: "Alphabet Inc. Class C", type: "equity" },
  { symbol: "AMZN", name: "Amazon.com Inc.", type: "equity" },
  { symbol: "META", name: "Meta Platforms Inc.", type: "equity" },
  { symbol: "TSLA", name: "Tesla Inc.", type: "equity" },
  { symbol: "AMD", name: "Advanced Micro Devices Inc.", type: "equity" },
  { symbol: "INTC", name: "Intel Corporation", type: "equity" },
  { symbol: "NFLX", name: "Netflix Inc.", type: "equity" },
  { symbol: "JPM", name: "JPMorgan Chase & Co.", type: "equity" },
  { symbol: "BAC", name: "Bank of America Corporation", type: "equity" },
  { symbol: "GS", name: "Goldman Sachs Group Inc.", type: "equity" },
  { symbol: "WMT", name: "Walmart Inc.", type: "equity" },
  { symbol: "DIS", name: "Walt Disney Company", type: "equity" },
  { symbol: "KO", name: "Coca-Cola Company", type: "equity" },
  { symbol: "PEP", name: "PepsiCo Inc.", type: "equity" },
  { symbol: "XOM", name: "Exxon Mobil Corporation", type: "equity" },
  { symbol: "CVX", name: "Chevron Corporation", type: "equity" },
  { symbol: "COIN", name: "Coinbase Global Inc.", type: "equity" },
  { symbol: "PLTR", name: "Palantir Technologies Inc.", type: "equity" },
  { symbol: "BABA", name: "Alibaba Group Holding Ltd.", type: "equity" },
  { symbol: "UBER", name: "Uber Technologies Inc.", type: "equity" },
];

// Parse an OCC option symbol (e.g. "AAPL250620C00190000") given its underlying root.
// After the root: YYMMDD + C/P + 8-digit strike (strike x 1000).
function parseOccSymbol(
  optionSymbol: string,
  underlying: string,
): { strike: number; expiration: string; type: "call" | "put" } | null {
  if (!optionSymbol.startsWith(underlying)) return null;
  const rest = optionSymbol.slice(underlying.length);
  if (rest.length < 15) return null;
  const datePart = rest.slice(0, 6);
  const cp = rest[6];
  const strikeRaw = rest.slice(7);
  if (!/^\d{6}$/.test(datePart) || (cp !== "C" && cp !== "P") || !/^\d{8}$/.test(strikeRaw)) {
    return null;
  }
  const expiration = `20${datePart.slice(0, 2)}-${datePart.slice(2, 4)}-${datePart.slice(4, 6)}`;
  const strike = parseInt(strikeRaw, 10) / 1000;
  return { strike, expiration, type: cp === "C" ? "call" : "put" };
}

export class MarketDataService {
  private cache: Map<string, { data: any; timestamp: number }>;
  private hotCache: Map<string, { data: any; timestamp: number }>; // L1 hot cache for rapid re-fetches
  private storage: IStorage | null = null;

  // Base cache durations (1 minute refresh cycle)
  private quoteCacheDuration: number = 60000; // 1 minute for quotes
  private hotCacheDuration: number = 60000; // 1 minute for hot L1 cache
  private intradayCacheDuration: number = 60000; // 1 minute for intraday
  private optionsCacheDuration: number = 300000; // 5 minutes for options
  
  // Adaptive cache multiplier (retained for cache TTL math and status reporting)
  private adaptiveCacheMultiplier: number = 1;
  private rateLimitBackoff: number = 0; // Retained for cache status reporting

  // Stale-while-revalidate pattern
  private staleDataWindow: number = 600000; // 10 minutes window to serve stale data while refreshing
  private backgroundRefreshQueue: Set<string> = new Set(); // Track keys being refreshed in background

  private static readonly HOT_SYMBOLS = [
    // Core indices only for startup (reduced to avoid rate limits)
    'SPY',
  ];
  
  private static readonly EXTENDED_SYMBOLS = [
    // Full list for on-demand prefetch
    'SPY', 'QQQ', 'IWM', 'DIA', 'VIX',
    'AAPL', 'MSFT', 'NVDA', 'GOOGL', 'AMZN', 'META', 'TSLA',
    'JPM', 'BAC', 'GS', 'AMD', 'INTC', 'NFLX',
  ];

  static getHotSymbols(): string[] {
    return [...MarketDataService.HOT_SYMBOLS];
  }

  constructor() {
    this.cache = new Map();
    this.hotCache = new Map();
  }

  setStorage(storage: IStorage): void {
    this.storage = storage;
  }

  // Compute eventType from provider, statusCode, and cacheResult
  private computeEventType(provider: string, statusCode: number | null | undefined, cacheResult: string | null | undefined): AuditEventType {
    if (provider === 'cache' || cacheResult === 'hit' || cacheResult === 'stale') return 'cache_hit';
    if (statusCode === 429) return 'rate_limit';
    if (statusCode === 401 || statusCode === 403) return 'error';
    if (statusCode && statusCode >= 200 && statusCode < 300) return 'fresh';
    return 'error';
  }

  // Fire-and-forget audit event — never blocks the caller
  // eventType is computed automatically from provider/statusCode/cacheResult
  private emitAuditEvent(entry: Omit<InsertMarketDataAuditLog, 'eventType'>): void {
    if (!this.storage) return;
    const eventType = this.computeEventType(entry.provider, entry.statusCode, entry.cacheResult);
    this.storage.insertMarketAuditLog({ ...entry, eventType }).catch((err) => {
      console.warn('[MarketAudit] Failed to write audit log entry:', err?.message);
    });
  }

  private getCachedData(key: string, maxAge: number): any | null {
    const cached = this.cache.get(key);
    if (!cached) return null;
    
    const age = Date.now() - cached.timestamp;
    // Apply adaptive multiplier to cache duration during rate limiting
    const effectiveMaxAge = maxAge * this.adaptiveCacheMultiplier;
    
    if (age < effectiveMaxAge) {
      return cached.data;
    }
    return null;
  }

  // Stale-while-revalidate: returns stale data if available, triggers background refresh
  private getCachedDataWithStale(key: string, maxAge: number, staleWindow: number): { data: any | null; isStale: boolean } {
    const cached = this.cache.get(key);
    if (!cached) return { data: null, isStale: false };
    
    const age = Date.now() - cached.timestamp;
    const effectiveMaxAge = maxAge * this.adaptiveCacheMultiplier;
    
    // Fresh data
    if (age < effectiveMaxAge) {
      return { data: cached.data, isStale: false };
    }
    
    // Stale data within the stale window
    if (age < effectiveMaxAge + staleWindow) {
      return { data: cached.data, isStale: true };
    }
    
    return { data: null, isStale: false };
  }

  private setCachedData(key: string, data: any): void {
    this.cache.set(key, { data, timestamp: Date.now() });
  }

  // Get the current cache status for debugging
  getCacheStatus(): {
    cacheSize: number;
    hotCacheSize: number;
    adaptiveMultiplier: number;
    rateLimitBackoff: number;
  } {
    return {
      cacheSize: this.cache.size,
      hotCacheSize: this.hotCache.size,
      adaptiveMultiplier: this.adaptiveCacheMultiplier,
      rateLimitBackoff: this.rateLimitBackoff,
    };
  }

  // Alpha Vantage fallback for when Alpaca is rate limited
  private async getQuoteFromAlphaVantage(symbol: string): Promise<{ data: MarketQuote | null; statusCode: number; errorMessage?: string }> {
    if (!alphaVantageApiKey) {
      return { data: null, statusCode: 0, errorMessage: 'Alpha Vantage API key not configured' };
    }

    try {
      const url = `${ALPHA_VANTAGE_BASE_URL}?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${alphaVantageApiKey}`;
      const response = await fetch(url);
      const httpStatus = response.status;
      const data = await response.json();

      // Check for API errors
      if (data['Error Message'] || data['Note']) {
        const msg = data['Error Message'] || data['Note'];
        console.warn(`[MarketData] Alpha Vantage error for ${symbol}:`, msg);
        const isRateLimit = String(msg).includes('limit') || String(msg).includes('Limit');
        return { data: null, statusCode: isRateLimit ? 429 : httpStatus, errorMessage: String(msg) };
      }

      const quote = data['Global Quote'];
      if (!quote || !quote['05. price']) {
        const now = Date.now();
        const lastWarn = avNoDataLastWarn.get(symbol) ?? 0;
        if (now - lastWarn > AV_NO_DATA_WARN_INTERVAL_MS) {
          console.warn(`[MarketData] No Alpha Vantage data for ${symbol}`);
          avNoDataLastWarn.set(symbol, now);
          // Prune stale entries so the throttle map can't grow unbounded.
          if (avNoDataLastWarn.size > 256) {
            avNoDataLastWarn.forEach((ts, sym) => {
              if (now - ts > AV_NO_DATA_WARN_INTERVAL_MS) avNoDataLastWarn.delete(sym);
            });
          }
        }
        return { data: null, statusCode: httpStatus, errorMessage: 'No data returned' };
      }

      const price = parseFloat(quote['05. price']);
      const previousClose = parseFloat(quote['08. previous close']) || price;
      const change = parseFloat(quote['09. change']) || 0;
      const changePercent = parseFloat(quote['10. change percent']?.replace('%', '')) || 0;

      const result: MarketQuote = {
        symbol: symbol.toUpperCase(),
        price,
        change,
        changePercent,
        volume: parseInt(quote['06. volume']) || 0,
        high: parseFloat(quote['03. high']) || price,
        low: parseFloat(quote['04. low']) || price,
        open: parseFloat(quote['02. open']) || price,
        previousClose,
        timestamp: new Date().toISOString(),
        source: "alphavantage",
      };

      console.log(`✅ Alpha Vantage: ${symbol} $${result.price}`);
      return { data: result, statusCode: 200 };
    } catch (error: any) {
      console.warn(`[MarketData] Alpha Vantage error for ${symbol}:`, error.message);
      return { data: null, statusCode: 0, errorMessage: error.message };
    }
  }

  // Alpaca Market Data as secondary provider
  private async getQuoteFromAlpaca(symbol: string): Promise<{ data: MarketQuote | null; statusCode: number; errorMessage?: string }> {
    if (!alpacaApiKey || !alpacaApiSecret) {
      return { data: null, statusCode: 0, errorMessage: 'Alpaca API keys not configured' };
    }

    try {
      // Handle VIX differently - Alpaca doesn't have VIX directly
      if (symbol === "VIX") {
        return { data: null, statusCode: 0, errorMessage: 'VIX not supported by Alpaca' };
      }

      // Get latest trade and snapshot for the symbol (using OAuth for Broker API)
      const snapshotUrl = `${ALPACA_DATA_BASE_URL}/stocks/${symbol}/snapshot`;
      const authHeaders = await getAlpacaAuthHeadersAsync();
      const response = await fetch(snapshotUrl, {
        headers: authHeaders,
      });

      if (!response.ok) {
        const status = response.status;
        if (status === 429) {
          console.warn(`[MarketData] Alpaca rate limited for ${symbol}`);
        } else if (status === 401 || status === 403) {
          console.error(`[MarketData] Alpaca authentication failed for ${symbol}`);
        }
        return { data: null, statusCode: status, errorMessage: `Alpaca HTTP ${status}` };
      }

      const data = await response.json();
      
      if (!data || !data.latestTrade) {
        return { data: null, statusCode: 200, errorMessage: 'No latestTrade in Alpaca response' };
      }

      const latestTrade = data.latestTrade;
      const dailyBar = data.dailyBar;
      const prevDailyBar = data.prevDailyBar;

      const price = latestTrade.p;
      const previousClose = prevDailyBar?.c || price;
      const change = price - previousClose;
      const changePercent = previousClose ? (change / previousClose) * 100 : 0;

      const result: MarketQuote = {
        symbol: symbol.toUpperCase(),
        price,
        change,
        changePercent,
        volume: dailyBar?.v || 0,
        high: dailyBar?.h || price,
        low: dailyBar?.l || price,
        open: dailyBar?.o || price,
        previousClose,
        timestamp: latestTrade.t || new Date().toISOString(),
        source: "alpaca",
      };

      console.log(`✅ Alpaca: ${symbol} $${result.price}`);
      return { data: result, statusCode: 200 };
    } catch (error: any) {
      console.warn(`[MarketData] Alpaca error for ${symbol}:`, error.message);
      return { data: null, statusCode: 0, errorMessage: error.message };
    }
  }

  // Alpaca bars/intraday data - SOLE PROVIDER for chart data
  private async getIntradayFromAlpaca(symbol: string, interval: "1m" | "5m" | "15m" | "1h" = "5m"): Promise<{ data: IntradayDataPoint[] | null; statusCode: number; errorMessage?: string }> {
    if (!alpacaApiKey || !alpacaApiSecret) {
      console.warn(`[MarketData] Alpaca API keys not configured`);
      return { data: null, statusCode: 0, errorMessage: 'Alpaca API keys not configured' };
    }

    try {
      const timeframeMap: Record<string, string> = {
        "1m": "1Min",
        "5m": "5Min",
        "15m": "15Min",
        "1h": "1Hour",
      };

      const timeframe = timeframeMap[interval] || "5Min";
      
      // Look back 3 days to ensure we get data even on weekends/holidays
      const now = new Date();
      const startDate = new Date(now);
      startDate.setDate(startDate.getDate() - 3);
      startDate.setHours(0, 0, 0, 0);
      
      const start = startDate.toISOString();
      const end = now.toISOString();

      // Use SIP feed for best data quality (requires paid subscription, falls back to IEX)
      const barsUrl = `${ALPACA_DATA_BASE_URL}/stocks/${symbol}/bars?timeframe=${timeframe}&start=${start}&end=${end}&limit=1000&adjustment=raw&feed=iex`;
      
      console.log(`[MarketData] Fetching Alpaca bars for ${symbol}: ${start} to ${end}`);
      
      // Use OAuth for Broker API or header auth for Trading API
      const authHeaders = await getAlpacaAuthHeadersAsync();
      const response = await fetch(barsUrl, {
        headers: authHeaders,
      });

      if (!response.ok) {
        const errorText = await response.text();
        const status = response.status;
        console.error(`[MarketData] Alpaca API error for ${symbol}: ${status} - ${errorText}`);
        if (status === 429) {
          console.warn(`[MarketData] Alpaca bars rate limited for ${symbol}`);
        } else if (status === 401 || status === 403) {
          console.error(`[MarketData] Alpaca authentication failed - check API keys`);
        }
        return { data: null, statusCode: status, errorMessage: `Alpaca ${status}: ${errorText.slice(0, 200)}` };
      }

      const data = await response.json();
      
      if (!data.bars || data.bars.length === 0) {
        console.warn(`[MarketData] Alpaca returned no bars for ${symbol}`);
        return { data: null, statusCode: 200, errorMessage: 'Alpaca returned no bars for this symbol/period' };
      }

      // Get only the most recent trading day's data for intraday view
      const bars: IntradayDataPoint[] = data.bars.map((bar: any) => ({
        timestamp: bar.t,
        open: bar.o,
        high: bar.h,
        low: bar.l,
        close: bar.c,
        volume: bar.v,
      }));

      // Filter to most recent trading day
      if (bars.length > 0) {
        const lastBarDate = new Date(bars[bars.length - 1].timestamp);
        const lastTradingDay = new Date(lastBarDate.getFullYear(), lastBarDate.getMonth(), lastBarDate.getDate());
        
        const todayBars = bars.filter(bar => {
          const barDate = new Date(bar.timestamp);
          const barDay = new Date(barDate.getFullYear(), barDate.getMonth(), barDate.getDate());
          return barDay.getTime() === lastTradingDay.getTime();
        });
        
        if (todayBars.length > 0) {
          console.log(`✅ Alpaca bars: ${symbol} ${todayBars.length} points (${interval}) from ${lastTradingDay.toDateString()}`);
          return { data: todayBars, statusCode: 200 };
        }
      }

      console.log(`✅ Alpaca bars: ${symbol} ${bars.length} points (${interval})`);
      return { data: bars, statusCode: 200 };
    } catch (error: any) {
      console.error(`[MarketData] Alpaca bars error for ${symbol}:`, error.message);
      return { data: null, statusCode: 0, errorMessage: error.message };
    }
  }

  async getQuote(symbol: string): Promise<MarketQuote | null> {
    // Canonicalize the volatility index to a single "VIX" symbol. Neither
    // Alpaca nor Alpha Vantage support the caret form ("^VIX"), so collapsing
    // it here keeps the downstream VIX guards consistent and avoids firing
    // pointless failing requests for an unsupported caret symbol.
    const normalizedSymbol = symbol.toUpperCase() === "^VIX" ? "VIX" : symbol.toUpperCase();
    const cacheKey = `quote_${normalizedSymbol}`;
    
    // Check L1 hot cache first (respects adaptive multiplier)
    const hotCached = this.hotCache.get(cacheKey);
    if (hotCached && Date.now() - hotCached.timestamp < (this.hotCacheDuration * this.adaptiveCacheMultiplier)) {
      this.emitAuditEvent({
        symbol: normalizedSymbol,
        endpoint: 'quote',
        provider: 'cache',
        cacheResult: 'hit',
        statusCode: 200,
        latencyMs: 0,
      });
      return hotCached.data;
    }
    
    // Check L2 main cache with stale-while-revalidate
    const { data: cached, isStale } = this.getCachedDataWithStale(
      cacheKey,
      this.quoteCacheDuration,
      this.staleDataWindow
    );
    
    if (cached) {
      this.hotCache.set(cacheKey, { data: cached, timestamp: Date.now() });
      this.emitAuditEvent({
        symbol: normalizedSymbol,
        endpoint: 'quote',
        provider: 'cache',
        cacheResult: isStale ? 'stale' : 'hit',
        statusCode: 200,
        latencyMs: 0,
      });
      return cached;
    }

    // PROVIDER CHAIN: Alpha Vantage → Alpaca

    // PRIMARY: Try Alpha Vantage first (most reliable, has API key)
    if (alphaVantageApiKey) {
      const t0 = Date.now();
      const alphaResult = await this.getQuoteFromAlphaVantage(normalizedSymbol);
      const latencyMs = Date.now() - t0;
      if (alphaResult.data) {
        this.setCachedData(cacheKey, alphaResult.data);
        this.hotCache.set(cacheKey, { data: alphaResult.data, timestamp: Date.now() });
        this.emitAuditEvent({
          symbol: normalizedSymbol,
          endpoint: 'quote',
          provider: 'alpha_vantage',
          cacheResult: 'miss',
          statusCode: 200,
          latencyMs,
        });
        return alphaResult.data;
      }
      this.emitAuditEvent({
        symbol: normalizedSymbol,
        endpoint: 'quote',
        provider: 'alpha_vantage',
        cacheResult: 'miss',
        statusCode: alphaResult.statusCode,
        latencyMs,
        errorMessage: alphaResult.errorMessage,
      });
    }

    // SECONDARY: Try Alpaca Market Data
    if (alpacaApiKey && alpacaApiSecret) {
      const t1 = Date.now();
      const alpacaResult = await this.getQuoteFromAlpaca(normalizedSymbol);
      const latencyMs = Date.now() - t1;
      if (alpacaResult.data) {
        this.setCachedData(cacheKey, alpacaResult.data);
        this.hotCache.set(cacheKey, { data: alpacaResult.data, timestamp: Date.now() });
        this.emitAuditEvent({
          symbol: normalizedSymbol,
          endpoint: 'quote',
          provider: 'alpaca',
          cacheResult: 'miss',
          statusCode: 200,
          latencyMs,
        });
        return alpacaResult.data;
      }
      this.emitAuditEvent({
        symbol: normalizedSymbol,
        endpoint: 'quote',
        provider: 'alpaca',
        cacheResult: 'miss',
        statusCode: alpacaResult.statusCode,
        latencyMs,
        errorMessage: alpacaResult.errorMessage,
      });
    }

    // All providers exhausted (Alpha Vantage + Alpaca)
    this.emitAuditEvent({
      symbol: normalizedSymbol,
      endpoint: 'quote',
      provider: 'aggregated',
      cacheResult: 'miss',
      statusCode: 0,
      latencyMs: 0,
      errorMessage: 'All providers failed to return quote',
    });

    return null;
  }

  async getMultipleQuotes(symbols: string[]): Promise<Record<string, MarketQuote | null>> {
    const quotes: Record<string, MarketQuote | null> = {};
    
    const promises = symbols.map(async (symbol) => {
      quotes[symbol] = await this.getQuote(symbol);
    });
    
    await Promise.all(promises);
    return quotes;
  }

  // Prefetch quotes for a list of symbols to warm the cache
  async prefetchQuotes(symbols: string[]): Promise<void> {
    const uncachedSymbols = symbols.filter(symbol => {
      const cacheKey = `quote_${symbol.toUpperCase()}`;
      const hotCached = this.hotCache.get(cacheKey);
      const mainCached = this.getCachedData(cacheKey, this.quoteCacheDuration);
      return !hotCached && !mainCached;
    });

    if (uncachedSymbols.length === 0) return;

    // Fetch in parallel with rate limiting (max 5 concurrent)
    const batchSize = 5;
    for (let i = 0; i < uncachedSymbols.length; i += batchSize) {
      const batch = uncachedSymbols.slice(i, i + batchSize);
      await Promise.all(batch.map(symbol => this.getQuote(symbol)));
    }
  }

  // Check if a symbol is already cached
  isSymbolCached(symbol: string): boolean {
    const cacheKey = `quote_${symbol.toUpperCase()}`;
    const hotCached = this.hotCache.get(cacheKey);
    if (hotCached && Date.now() - hotCached.timestamp < this.hotCacheDuration) {
      return true;
    }
    return !!this.getCachedData(cacheKey, this.quoteCacheDuration);
  }

  async startupPrefetch(): Promise<void> {
    console.log('[MarketData] Starting cache warmup for hot symbols...');
    const startTime = Date.now();
    
    try {
      await this.prefetchQuotes(MarketDataService.HOT_SYMBOLS);
      const elapsed = Date.now() - startTime;
      console.log(`[MarketData] Cache warmup complete: ${MarketDataService.HOT_SYMBOLS.length} symbols in ${elapsed}ms`);
    } catch (error) {
      console.warn('[MarketData] Cache warmup partial failure:', error);
    }
  }

  async getIntradayData(symbol: string, interval: "1m" | "5m" | "15m" | "1h" = "5m", todayOnly: boolean = true): Promise<{ data: IntradayDataPoint[], source: 'alpaca' | 'cache' | 'unavailable' }> {
    const normalizedSymbol = symbol.toUpperCase();
    const cacheKey = `intraday_${normalizedSymbol}_${interval}_${todayOnly ? 'today' : 'multi'}`;
    const cached = this.getCachedData(cacheKey, this.intradayCacheDuration);
    if (cached) {
      this.emitAuditEvent({
        symbol: normalizedSymbol,
        endpoint: 'intraday',
        provider: 'cache',
        cacheResult: 'hit',
        statusCode: 200,
        latencyMs: 0,
        metadata: { interval, points: cached.length },
      });
      const cachedSource = (cached as any)._source as 'alpaca' | undefined;
      return { data: cached, source: cachedSource ?? 'cache' };
    }

    // PROVIDER CHAIN: Alpaca (primary) → unavailable (no fabricated fallback)
    // Yahoo Finance removed: consistently rate-limited (429) and adds latency without value
    
    // PRIMARY: Try Alpaca if credentials are configured
    const hasAlpacaCredentials = (alpacaApiKey && alpacaApiSecret) || (alpacaClientId && alpacaClientSecret);
    if (hasAlpacaCredentials && normalizedSymbol !== "VIX") {
      const t0 = Date.now();
      const alpacaResult = await this.getIntradayFromAlpaca(normalizedSymbol, interval);
      const latencyMs = Date.now() - t0;
      if (alpacaResult.data && alpacaResult.data.length > 0) {
        this.setCachedData(cacheKey, alpacaResult.data);
        this.emitAuditEvent({
          symbol: normalizedSymbol,
          endpoint: 'intraday',
          provider: 'alpaca',
          cacheResult: 'miss',
          statusCode: 200,
          latencyMs,
          metadata: { interval, points: alpacaResult.data.length },
        });
        return { data: alpacaResult.data, source: 'alpaca' };
      }
      // Alpaca failed — log with real status code
      this.emitAuditEvent({
        symbol: normalizedSymbol,
        endpoint: 'intraday',
        provider: 'alpaca',
        cacheResult: 'miss',
        statusCode: alpacaResult.statusCode,
        latencyMs,
        errorMessage: alpacaResult.errorMessage,
        metadata: { interval },
      });
    }

    // NO FABRICATED DATA: when Alpaca cannot provide intraday data we return an
    // empty result so the API responds 503 and the chart shows an honest
    // "market data temporarily unavailable" state - we never invent prices.
    console.warn(`[MarketData] Intraday data unavailable for ${symbol} (no live provider)`);
    return { data: [], source: 'unavailable' };
  }


  async getOptionsChain(symbol: string, expiration?: string): Promise<OptionsChainData | null> {
    const normalizedSymbol = symbol.toUpperCase();
    const cacheKey = `options_${normalizedSymbol}_${expiration || "default"}`;
    const cached = this.getCachedData(cacheKey, this.optionsCacheDuration);
    if (cached) {
      this.emitAuditEvent({
        symbol: normalizedSymbol,
        endpoint: 'options',
        provider: 'cache',
        cacheResult: 'hit',
        statusCode: 200,
        latencyMs: 0,
        metadata: { expiration: expiration || null },
      });
      return cached;
    }

    const t0 = Date.now();
    try {
      const authHeaders = await getAlpacaAuthHeadersAsync();

      // Alpaca caps each snapshots response at 1000 contracts, returning a
      // next_page_token to fetch the rest. Follow the cursor so the full chain
      // is returned instead of being clipped at the first page.
      const snapshots: Record<string, any> = {};
      let pageToken: string | undefined;
      const MAX_PAGES = 10;
      for (let page = 0; page < MAX_PAGES; page++) {
        let url = `${ALPACA_OPTIONS_BASE_URL}/snapshots/${normalizedSymbol}?feed=indicative&limit=1000`;
        if (pageToken) url += `&page_token=${encodeURIComponent(pageToken)}`;
        const response = await fetch(url, { headers: authHeaders });

        if (!response.ok) {
          const status = response.status;
          const errorText = await response.text();
          this.emitAuditEvent({
            symbol: normalizedSymbol,
            endpoint: 'options',
            provider: 'alpaca',
            cacheResult: 'miss',
            statusCode: status,
            latencyMs: Date.now() - t0,
            errorMessage: `Alpaca options ${status}: ${errorText.slice(0, 200)}`,
            metadata: { expiration: expiration || null, page },
          });
          // If we already collected contracts from earlier pages, use them;
          // otherwise treat as a hard failure.
          if (Object.keys(snapshots).length > 0) break;
          return null;
        }

        const data = await response.json();
        Object.assign(snapshots, data?.snapshots || {});
        pageToken = data?.next_page_token || undefined;
        if (!pageToken) break;
      }

      const optionSymbols = Object.keys(snapshots);

      if (optionSymbols.length === 0) {
        this.emitAuditEvent({
          symbol: normalizedSymbol,
          endpoint: 'options',
          provider: 'alpaca',
          cacheResult: 'miss',
          statusCode: 200,
          latencyMs: Date.now() - t0,
          errorMessage: 'No options data returned by Alpaca',
          metadata: { expiration: expiration || null },
        });
        return null;
      }

      const underlyingQuote = await this.getQuote(normalizedSymbol);
      const underlyingPrice = underlyingQuote?.price ?? 0;

      const calls: OptionContract[] = [];
      const puts: OptionContract[] = [];
      const expirationSet = new Set<string>();

      for (const optionSymbol of optionSymbols) {
        const parsed = parseOccSymbol(optionSymbol, normalizedSymbol);
        if (!parsed) continue;
        const snap: any = snapshots[optionSymbol] || {};
        const contract: OptionContract = {
          contractSymbol: optionSymbol,
          strike: parsed.strike,
          expiration: parsed.expiration,
          type: parsed.type,
          bid: snap.latestQuote?.bp ?? 0,
          ask: snap.latestQuote?.ap ?? 0,
          last: snap.latestTrade?.p ?? 0,
          volume: snap.dailyBar?.v ?? 0,
          openInterest: snap.openInterest ?? 0,
          impliedVolatility: snap.impliedVolatility ?? 0.2,
          inTheMoney:
            parsed.type === "call"
              ? underlyingPrice > parsed.strike
              : underlyingPrice < parsed.strike,
        };
        expirationSet.add(parsed.expiration);
        if (parsed.type === "call") calls.push(contract);
        else puts.push(contract);
      }

      const expirationDates = Array.from(expirationSet).sort();
      let filteredCalls = calls;
      let filteredPuts = puts;
      if (expiration) {
        filteredCalls = calls.filter((c) => c.expiration === expiration);
        filteredPuts = puts.filter((p) => p.expiration === expiration);
      }
      filteredCalls.sort((a, b) => a.strike - b.strike);
      filteredPuts.sort((a, b) => a.strike - b.strike);

      const result: OptionsChainData = {
        calls: filteredCalls,
        puts: filteredPuts,
        expirationDates,
        underlyingPrice,
      };

      this.setCachedData(cacheKey, result);
      this.emitAuditEvent({
        symbol: normalizedSymbol,
        endpoint: 'options',
        provider: 'alpaca',
        cacheResult: 'miss',
        statusCode: 200,
        latencyMs: Date.now() - t0,
        metadata: { expiration: expiration || null, calls: filteredCalls.length, puts: filteredPuts.length },
      });
      if (process.env.NODE_ENV !== 'production') {
        console.log(`✅ Options chain (Alpaca) for ${normalizedSymbol}: ${filteredCalls.length} calls, ${filteredPuts.length} puts`);
      }
      return result;
    } catch (error: any) {
      console.warn(`⚠️ Options chain error for ${symbol}:`, error.message);
      this.emitAuditEvent({
        symbol: normalizedSymbol,
        endpoint: 'options',
        provider: 'alpaca',
        cacheResult: 'miss',
        statusCode: 0,
        latencyMs: Date.now() - t0,
        errorMessage: error.message,
        metadata: { expiration: expiration || null },
      });
      return null;
    }
  }

  async getVIXData(): Promise<{
    vix: number;
    level: string;
    sentiment: string;
    optionsStrategy: string;
  } | null> {
    const quote = await this.getQuote("^VIX");
    if (!quote) return null;
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

    return {
      vix: vixValue,
      level,
      sentiment,
      optionsStrategy:
        vixValue > 25
          ? "High IV - Consider selling premium (iron condors, covered calls)"
          : "Low IV - Consider buying options (straddles, directional plays)",
    };
  }

  async searchSymbols(query: string): Promise<{ symbol: string; name: string; type: string }[]> {
    const q = query.trim().toUpperCase();
    if (!q) return [];

    // Basic search against a curated list of common symbols
    const matches = COMMON_SYMBOLS.filter(
      (s) => s.symbol.includes(q) || s.name.toUpperCase().includes(q)
    ).slice(0, 10);
    if (matches.length > 0) return matches;

    // Fallback: validate an exact ticker via Alpaca snapshot
    if (alpacaApiKey && alpacaApiSecret && /^[A-Z.]{1,6}$/.test(q)) {
      try {
        const authHeaders = await getAlpacaAuthHeadersAsync();
        const response = await fetch(`${ALPACA_DATA_BASE_URL}/stocks/${q}/snapshot`, {
          headers: authHeaders,
        });
        if (response.ok) {
          const data = await response.json();
          if (data && data.latestTrade) {
            return [{ symbol: q, name: q, type: "equity" }];
          }
        }
      } catch (error: any) {
        console.warn(`⚠️ Search error:`, error.message);
      }
    }

    return [];
  }

  async getHistoricalData(
    symbol: string,
    period: "1d" | "5d" | "1mo" | "3mo" | "6mo" | "ytd" | "1y" | "2y" | "5y" = "1mo"
  ): Promise<IntradayDataPoint[]> {
    const normalizedSymbol = symbol.toUpperCase();
    const cacheKey = `historical_${normalizedSymbol}_${period}`;
    const cached = this.getCachedData(cacheKey, this.quoteCacheDuration);
    if (cached) {
      this.emitAuditEvent({
        symbol: normalizedSymbol,
        endpoint: 'historical',
        provider: 'cache',
        cacheResult: 'hit',
        statusCode: 200,
        latencyMs: 0,
        metadata: { period },
      });
      return cached;
    }

    // Alpaca bars are the sole historical source (VIX is unsupported by Alpaca)
    if (!alpacaApiKey || !alpacaApiSecret) {
      this.emitAuditEvent({
        symbol: normalizedSymbol,
        endpoint: 'historical',
        provider: 'alpaca',
        cacheResult: 'miss',
        statusCode: 0,
        latencyMs: 0,
        errorMessage: 'Alpaca API keys not configured',
        metadata: { period },
      });
      return [];
    }
    if (normalizedSymbol === "VIX") {
      return [];
    }

    const t0 = Date.now();
    try {
      let period1: Date;
      let days: number;

      if (period === "ytd") {
        const now = new Date();
        period1 = new Date(now.getFullYear(), 0, 1);
        days = Math.ceil((now.getTime() - period1.getTime()) / (1000 * 60 * 60 * 24));
      } else {
        const periodMap: Record<string, number> = {
          "1d": 1,
          "5d": 5,
          "1mo": 30,
          "3mo": 90,
          "6mo": 180,
          "1y": 365,
          "2y": 730,
          "5y": 1825,
        };
        days = periodMap[period] || 30;
        period1 = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      }

      const timeframe = days <= 5 ? "1Hour" : "1Day";
      const start = period1.toISOString();
      const end = new Date().toISOString();
      const barsUrl = `${ALPACA_DATA_BASE_URL}/stocks/${normalizedSymbol}/bars?timeframe=${timeframe}&start=${start}&end=${end}&limit=10000&adjustment=raw&feed=iex`;

      const authHeaders = await getAlpacaAuthHeadersAsync();
      const response = await fetch(barsUrl, { headers: authHeaders });

      if (!response.ok) {
        const errorText = await response.text();
        const status = response.status;
        this.emitAuditEvent({
          symbol: normalizedSymbol,
          endpoint: 'historical',
          provider: 'alpaca',
          cacheResult: 'miss',
          statusCode: status,
          latencyMs: Date.now() - t0,
          errorMessage: `Alpaca ${status}: ${errorText.slice(0, 200)}`,
          metadata: { period },
        });
        return [];
      }

      const data = await response.json();
      if (!data.bars || data.bars.length === 0) {
        this.emitAuditEvent({
          symbol: normalizedSymbol,
          endpoint: 'historical',
          provider: 'alpaca',
          cacheResult: 'miss',
          statusCode: 200,
          latencyMs: Date.now() - t0,
          errorMessage: 'Alpaca returned no bars for this symbol/period',
          metadata: { period },
        });
        return [];
      }

      const result: IntradayDataPoint[] = data.bars.map((bar: any) => ({
        timestamp: bar.t,
        open: bar.o,
        high: bar.h,
        low: bar.l,
        close: bar.c,
        volume: bar.v,
      }));

      this.setCachedData(cacheKey, result);
      this.emitAuditEvent({
        symbol: normalizedSymbol,
        endpoint: 'historical',
        provider: 'alpaca',
        cacheResult: 'miss',
        statusCode: 200,
        latencyMs: Date.now() - t0,
        metadata: { period, points: result.length },
      });
      if (process.env.NODE_ENV !== 'production') {
        console.log(`✅ Historical data (Alpaca) for ${normalizedSymbol}: ${result.length} points`);
      }
      return result;
    } catch (error: any) {
      console.warn(`⚠️ Historical data error for ${symbol}:`, error.message);
      this.emitAuditEvent({
        symbol: normalizedSymbol,
        endpoint: 'historical',
        provider: 'alpaca',
        cacheResult: 'miss',
        statusCode: 0,
        latencyMs: Date.now() - t0,
        errorMessage: error.message,
        metadata: { period },
      });
      return [];
    }
  }

  async getMarketMovers(): Promise<MarketMoversData> {
    const cacheKey = "market_movers";
    const cached = this.getCachedData(cacheKey, this.quoteCacheDuration);
    if (cached) {
      this.emitAuditEvent({
        symbol: 'MARKET',
        endpoint: 'movers',
        provider: 'cache',
        cacheResult: 'hit',
        statusCode: 200,
        latencyMs: 0,
      });
      return cached;
    }

    const t0 = Date.now();
    const result: MarketMoversData = {
      gainers: [],
      losers: [],
      mostActive: [],
      trending: [],
    };

    try {
      const popularSymbols = [
        "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA", "AMD", "NFLX", "INTC",
        "SPY", "QQQ", "IWM", "DIA", "XLF", "XLE", "XLK", "XLV", "COIN", "MARA"
      ];
      
      const quotes = await Promise.all(
        popularSymbols.map(async (symbol) => {
          const quote = await this.getQuote(symbol);
          if (quote) {
            return {
              symbol: quote.symbol,
              name: symbol,
              price: quote.price,
              change: quote.change,
              changePercent: quote.changePercent,
              volume: quote.volume,
            };
          }
          return null;
        })
      );

      const validQuotes = quotes.filter((q): q is MarketMover => q !== null);
      
      const sortedByGain = [...validQuotes].sort((a, b) => b.changePercent - a.changePercent);
      result.gainers = sortedByGain.slice(0, 5);
      result.losers = sortedByGain.slice(-5).reverse();
      
      const sortedByVolume = [...validQuotes].sort((a, b) => b.volume - a.volume);
      result.mostActive = sortedByVolume.slice(0, 5);
      
      const sortedByAbsChange = [...validQuotes].sort((a, b) => 
        Math.abs(b.changePercent) - Math.abs(a.changePercent)
      );
      result.trending = sortedByAbsChange.slice(0, 5);

      this.setCachedData(cacheKey, result);
      this.emitAuditEvent({
        symbol: 'MARKET',
        endpoint: 'movers',
        provider: 'aggregated',
        cacheResult: 'miss',
        statusCode: 200,
        latencyMs: Date.now() - t0,
        metadata: { symbolsAnalyzed: validQuotes.length },
      });
      if (process.env.NODE_ENV !== 'production') {
        console.log(`✅ Market movers fetched: ${validQuotes.length} stocks analyzed`);
      }
      return result;
    } catch (error: any) {
      console.warn(`⚠️ Market movers error:`, error.message);
      this.emitAuditEvent({
        symbol: 'MARKET',
        endpoint: 'movers',
        provider: 'aggregated',
        cacheResult: 'miss',
        statusCode: 0,
        latencyMs: Date.now() - t0,
        errorMessage: error.message,
      });
      return result;
    }
  }

  async getTrendingStocks(count: number = 10): Promise<MarketMover[]> {
    const cacheKey = `trending_${count}`;
    const cached = this.getCachedData(cacheKey, this.quoteCacheDuration);
    if (cached) return cached;

    // Derive trending from market movers (Yahoo trending endpoint removed)
    const movers = await this.getMarketMovers();
    const trending = movers.trending.slice(0, count);
    this.setCachedData(cacheKey, trending);
    return trending;
  }

  // Health check for all market data providers
  async checkProviderHealth(): Promise<{
    alphaVantage: { status: string; latencyMs?: number; error?: string; apiKeyConfigured: boolean; testSymbol?: string; testPrice?: number };
    alpaca: { status: string; latencyMs?: number; error?: string; apiKeyConfigured: boolean; testSymbol?: string; testPrice?: number };
  }> {
    const testSymbol = "AAPL";

    // Test Alpha Vantage
    const alphaVantageResult = await this.testAlphaVantage(testSymbol);

    // Test Alpaca
    const alpacaResult = await this.testAlpaca(testSymbol);

    console.log(`[HealthCheck] Alpha Vantage: ${alphaVantageResult.status}, Alpaca: ${alpacaResult.status}`);

    return {
      alphaVantage: alphaVantageResult,
      alpaca: alpacaResult,
    };
  }

  private async testAlphaVantage(symbol: string): Promise<{ status: string; latencyMs?: number; error?: string; apiKeyConfigured: boolean; testSymbol?: string; testPrice?: number }> {
    const apiKeyConfigured = !!alphaVantageApiKey;
    
    if (!apiKeyConfigured) {
      return { status: "not_configured", apiKeyConfigured: false, error: "ALPHA_VANTAGE_API_KEY not set" };
    }

    try {
      const startTime = Date.now();
      const url = `${ALPHA_VANTAGE_BASE_URL}?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${alphaVantageApiKey}`;
      const response = await fetch(url);
      const latencyMs = Date.now() - startTime;
      
      if (!response.ok) {
        return { status: "error", apiKeyConfigured, latencyMs, error: `HTTP ${response.status}` };
      }

      const data = await response.json();
      
      if (data["Error Message"]) {
        return { status: "error", apiKeyConfigured, latencyMs, error: data["Error Message"] };
      }
      
      if (data["Note"]) {
        return { status: "rate_limited", apiKeyConfigured, latencyMs, error: "API call frequency exceeded" };
      }
      
      if (data["Information"]) {
        return { status: "rate_limited", apiKeyConfigured, latencyMs, error: data["Information"] };
      }

      const quote = data["Global Quote"];
      if (!quote || !quote["05. price"]) {
        return { status: "error", apiKeyConfigured, latencyMs, error: "No quote data returned" };
      }

      return { 
        status: "ok", 
        apiKeyConfigured, 
        latencyMs, 
        testSymbol: symbol, 
        testPrice: parseFloat(quote["05. price"]) 
      };
    } catch (error: any) {
      return { status: "error", apiKeyConfigured, error: error.message };
    }
  }

  private async testAlpaca(symbol: string): Promise<{ status: string; latencyMs?: number; error?: string; apiKeyConfigured: boolean; testSymbol?: string; testPrice?: number }> {
    const apiKeyConfigured = !!(alpacaApiKey && alpacaApiSecret);
    
    if (!apiKeyConfigured) {
      return { status: "not_configured", apiKeyConfigured: false, error: "ALPACA_API_KEY or ALPACA_API_SECRET not set" };
    }

    try {
      const startTime = Date.now();
      const snapshotUrl = `${ALPACA_DATA_BASE_URL}/stocks/${symbol}/snapshot`;
      const authHeaders = await getAlpacaAuthHeadersAsync();
      const response = await fetch(snapshotUrl, {
        headers: authHeaders,
      });
      const latencyMs = Date.now() - startTime;

      if (response.status === 401 || response.status === 403) {
        return { status: "auth_failed", apiKeyConfigured, latencyMs, error: "Invalid API credentials" };
      }

      if (response.status === 429) {
        return { status: "rate_limited", apiKeyConfigured, latencyMs, error: "Rate limit exceeded" };
      }

      if (!response.ok) {
        return { status: "error", apiKeyConfigured, latencyMs, error: `HTTP ${response.status}` };
      }

      const data = await response.json();
      
      if (!data.latestTrade) {
        return { status: "error", apiKeyConfigured, latencyMs, error: "No trade data returned" };
      }

      return { 
        status: "ok", 
        apiKeyConfigured, 
        latencyMs, 
        testSymbol: symbol, 
        testPrice: data.latestTrade.p 
      };
    } catch (error: any) {
      return { status: "error", apiKeyConfigured, error: error.message };
    }
  }
}

export const marketDataService = new MarketDataService();
