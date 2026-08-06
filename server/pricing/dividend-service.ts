/**
 * Fincai Autonomous Pricing Engine - Dividend Yield Service
 * 
 * Caches dividend yields for the universe of supported symbols.
 * Uses a "Universe Caching" strategy:
 * - Batch fetch dividend yields periodically (nightly or on-demand)
 * - Runtime lookups are fast cache hits
 * - Falls back to 0 for unknown symbols (conservative assumption)
 * 
 * License: MIT (Original optlib by Davis Edwards / Daniel Rojas)
 */

interface DividendCacheEntry {
  yield: number;
  lastUpdated: Date;
  source: string;
}

const dividendCache: Map<string, DividendCacheEntry> = new Map();
const CACHE_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

const DEFAULT_DIVIDENDS: { [symbol: string]: number } = {
  'SPY': 0.0127,    // ~1.27%
  'QQQ': 0.0055,    // ~0.55%
  'IWM': 0.0108,    // ~1.08%
  'DIA': 0.0163,    // ~1.63%
  'VIX': 0,         // VIX has no dividend
  'AAPL': 0.0044,   // ~0.44%
  'MSFT': 0.0073,   // ~0.73%
  'GOOGL': 0.0045,  // ~0.45%
  'AMZN': 0,        // No dividend
  'NVDA': 0.0003,   // ~0.03%
  'TSLA': 0,        // No dividend
  'META': 0.0035,   // ~0.35%
  'JPM': 0.0211,    // ~2.11%
  'BAC': 0.0245,    // ~2.45%
  'GS': 0.0228,     // ~2.28%
  'V': 0.0075,      // ~0.75%
  'MA': 0.0056,     // ~0.56%
  'AMD': 0,         // No dividend
  'INTC': 0.0123,   // ~1.23%
  'NFLX': 0,        // No dividend
  'DIS': 0,         // Suspended
  'KO': 0.0300,     // ~3.00%
  'PEP': 0.0273,    // ~2.73%
  'JNJ': 0.0310,    // ~3.10%
  'PG': 0.0242,     // ~2.42%
  'XOM': 0.0327,    // ~3.27%
  'CVX': 0.0421,    // ~4.21%
  'WMT': 0.0108,    // ~1.08%
  'HD': 0.0224,     // ~2.24%
  'UNH': 0.0128,    // ~1.28%
  'VZ': 0.0647,     // ~6.47%
  'T': 0.0577,      // ~5.77%
  'PFE': 0.0584,    // ~5.84%
  'MRK': 0.0252,    // ~2.52%
  'ABBV': 0.0347,   // ~3.47%
  'LLY': 0.0067,    // ~0.67%
};

const INDEX_SYMBOLS = new Set(['SPY', 'QQQ', 'IWM', 'DIA', 'SPX', 'NDX', 'RUT']);

/**
 * Initialize dividend cache with default values
 */
export function initializeDividendCache(): void {
  console.log('[DividendService] Initializing dividend cache...');
  
  const now = new Date();
  
  for (const [symbol, dividendYield] of Object.entries(DEFAULT_DIVIDENDS)) {
    dividendCache.set(symbol.toUpperCase(), {
      yield: dividendYield,
      lastUpdated: now,
      source: 'default',
    });
  }
  
  console.log(`[DividendService] Cached ${dividendCache.size} dividend yields`);
}

/**
 * Get dividend yield for a symbol
 */
export function getDividendYield(symbol: string): number {
  const normalizedSymbol = symbol.toUpperCase();
  const cached = dividendCache.get(normalizedSymbol);
  
  if (cached) {
    return cached.yield;
  }
  
  // Conservative fallback: assume no dividend for unknown symbols
  return 0;
}

/**
 * Check if symbol is an index (uses dividend yield model)
 */
export function isIndexSymbol(symbol: string): boolean {
  return INDEX_SYMBOLS.has(symbol.toUpperCase());
}

/**
 * Set dividend yield for a symbol
 */
export function setDividendYield(symbol: string, dividendYield: number, source: string = 'manual'): void {
  dividendCache.set(symbol.toUpperCase(), {
    yield: dividendYield,
    lastUpdated: new Date(),
    source,
  });
}

/**
 * Update multiple dividend yields at once
 */
export function batchUpdateDividends(updates: { symbol: string; yield: number }[], source: string = 'batch'): void {
  const now = new Date();
  
  for (const update of updates) {
    dividendCache.set(update.symbol.toUpperCase(), {
      yield: update.yield,
      lastUpdated: now,
      source,
    });
  }
  
  console.log(`[DividendService] Batch updated ${updates.length} dividend yields`);
}

/**
 * Get dividend yield with metadata
 */
export function getDividendInfo(symbol: string): DividendCacheEntry | null {
  return dividendCache.get(symbol.toUpperCase()) || null;
}

/**
 * Check if dividend data is stale
 */
export function isDividendStale(symbol: string): boolean {
  const cached = dividendCache.get(symbol.toUpperCase());
  
  if (!cached) return true;
  
  const elapsed = Date.now() - cached.lastUpdated.getTime();
  return elapsed > CACHE_DURATION_MS;
}

/**
 * Get all cached symbols
 */
export function getCachedSymbols(): string[] {
  return Array.from(dividendCache.keys());
}

/**
 * Get cache statistics
 */
export function getDividendCacheStats(): {
  size: number;
  staleCount: number;
  sources: { [source: string]: number };
} {
  let staleCount = 0;
  const sources: { [source: string]: number } = {};
  
  for (const [symbol, entry] of Array.from(dividendCache.entries())) {
    if (isDividendStale(symbol)) staleCount++;
    sources[entry.source] = (sources[entry.source] || 0) + 1;
  }
  
  return {
    size: dividendCache.size,
    staleCount,
    sources,
  };
}

/**
 * Fetch dividend yield via the market data service.
 * This should be called in a batch job, not on the hot path
 */
export async function fetchDividendYield(symbol: string): Promise<number | null> {
  try {
    // Dynamic import to avoid circular dependencies
    const { marketDataService } = await import('../market-data');
    
    const quote = await marketDataService.getQuote(symbol);
    
    // Check for dividend yield in the quote response
    // Note: The MarketQuote interface may need extension to include dividendYield
    if (quote && 'dividendYield' in quote && typeof (quote as any).dividendYield === 'number') {
      return (quote as any).dividendYield;
    }
    
    return null;
  } catch (error) {
    console.warn(`[DividendService] Failed to fetch dividend for ${symbol}:`, error);
    return null;
  }
}

/**
 * Refresh dividend for a single symbol
 */
export async function refreshDividend(symbol: string): Promise<boolean> {
  const dividendYield = await fetchDividendYield(symbol);
  
  if (dividendYield !== null) {
    setDividendYield(symbol, dividendYield, 'market-data');
    return true;
  }
  
  return false;
}

/**
 * Refresh all stale dividends
 */
export async function refreshStaleDividends(): Promise<number> {
  let refreshed = 0;
  
  for (const symbol of getCachedSymbols()) {
    if (isDividendStale(symbol)) {
      const success = await refreshDividend(symbol);
      if (success) refreshed++;
      
      // Rate limiting - wait between requests
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  
  return refreshed;
}

// Initialize on module load
initializeDividendCache();
