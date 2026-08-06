import crypto from "crypto";

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  expiresAt: number;
  hitCount: number;
  tokenCount?: number;
  marketSensitive?: boolean;
  spyPriceAtCache?: number;
}

export type CacheType = "response" | "embedding" | "rag_result" | "summary" | "context";

interface CacheConfig {
  defaultTTL: number;
  marketSensitiveTTL: number;
  maxEntries: number;
  spyDriftThreshold: number;
}

const defaultConfig: CacheConfig = {
  defaultTTL: 300000, // 5 minutes
  marketSensitiveTTL: 60000, // 1 minute for market-sensitive
  maxEntries: 1000,
  spyDriftThreshold: 0.005, // 0.5% price change invalidates
};

class AICache {
  private l1Cache: Map<string, CacheEntry<any>>; // Hot in-memory cache
  private l2Cache: Map<string, CacheEntry<any>>; // Main process cache
  private config: CacheConfig;
  private stats: {
    hits: number;
    misses: number;
    evictions: number;
  };
  
  private readonly marketKeywords = [
    "price", "trading", "worth", "cost", "buy", "sell", 
    "today", "now", "current", "quote", "market"
  ];

  constructor(config: Partial<CacheConfig> = {}) {
    this.l1Cache = new Map();
    this.l2Cache = new Map();
    this.config = { ...defaultConfig, ...config };
    this.stats = { hits: 0, misses: 0, evictions: 0 };
  }

  generateCacheKey(
    type: CacheType,
    content: string,
    context?: Record<string, any>
  ): string {
    const normalized = content.toLowerCase().trim();
    const contextStr = context ? JSON.stringify(context) : "";
    const combined = `${type}:${normalized}:${contextStr}`;
    return crypto.createHash("sha256").update(combined).digest("hex").substring(0, 32);
  }

  isMarketSensitive(query: string): boolean {
    const lowerQuery = query.toLowerCase();
    return this.marketKeywords.some(kw => lowerQuery.includes(kw));
  }

  get<T>(
    key: string,
    currentSpyPrice?: number
  ): T | null {
    const l1Entry = this.l1Cache.get(key);
    if (l1Entry && this.isValid(l1Entry, currentSpyPrice)) {
      l1Entry.hitCount++;
      this.stats.hits++;
      return l1Entry.data;
    }
    
    const l2Entry = this.l2Cache.get(key);
    if (l2Entry && this.isValid(l2Entry, currentSpyPrice)) {
      l2Entry.hitCount++;
      this.stats.hits++;
      
      this.l1Cache.set(key, l2Entry);
      
      return l2Entry.data;
    }
    
    this.stats.misses++;
    return null;
  }

  set<T>(
    key: string,
    data: T,
    options: {
      type?: CacheType;
      marketSensitive?: boolean;
      spyPrice?: number;
      tokenCount?: number;
      ttl?: number;
    } = {}
  ): void {
    const ttl = options.ttl || 
      (options.marketSensitive ? this.config.marketSensitiveTTL : this.config.defaultTTL);
    
    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      expiresAt: Date.now() + ttl,
      hitCount: 0,
      tokenCount: options.tokenCount,
      marketSensitive: options.marketSensitive,
      spyPriceAtCache: options.spyPrice,
    };
    
    this.l1Cache.set(key, entry);
    this.l2Cache.set(key, entry);
    
    this.enforceMaxEntries();
  }

  private isValid<T>(entry: CacheEntry<T>, currentSpyPrice?: number): boolean {
    if (Date.now() > entry.expiresAt) {
      return false;
    }
    
    if (entry.marketSensitive && entry.spyPriceAtCache && currentSpyPrice) {
      const priceDrift = Math.abs(currentSpyPrice - entry.spyPriceAtCache) / entry.spyPriceAtCache;
      if (priceDrift > this.config.spyDriftThreshold) {
        return false;
      }
    }
    
    return true;
  }

  private enforceMaxEntries(): void {
    if (this.l2Cache.size > this.config.maxEntries) {
      const entries = Array.from(this.l2Cache.entries())
        .sort((a, b) => a[1].expiresAt - b[1].expiresAt);
      
      const toRemove = entries.slice(0, Math.floor(this.config.maxEntries * 0.2));
      for (const [key] of toRemove) {
        this.l2Cache.delete(key);
        this.l1Cache.delete(key);
        this.stats.evictions++;
      }
    }
  }

  invalidate(key: string): void {
    this.l1Cache.delete(key);
    this.l2Cache.delete(key);
  }

  invalidateByPrefix(prefix: string): void {
    const keysToDelete: string[] = [];
    
    this.l2Cache.forEach((_, key) => {
      if (key.startsWith(prefix)) {
        keysToDelete.push(key);
      }
    });
    
    for (const key of keysToDelete) {
      this.l2Cache.delete(key);
      this.l1Cache.delete(key);
    }
  }

  invalidateMarketSensitive(): void {
    const keysToDelete: string[] = [];
    
    this.l2Cache.forEach((entry, key) => {
      if (entry.marketSensitive) {
        keysToDelete.push(key);
      }
    });
    
    for (const key of keysToDelete) {
      this.l2Cache.delete(key);
      this.l1Cache.delete(key);
    }
  }

  clear(): void {
    this.l1Cache.clear();
    this.l2Cache.clear();
    this.stats = { hits: 0, misses: 0, evictions: 0 };
  }

  getStats(): {
    l1Size: number;
    l2Size: number;
    hitRate: number;
    totalHits: number;
    totalMisses: number;
    evictions: number;
  } {
    const total = this.stats.hits + this.stats.misses;
    return {
      l1Size: this.l1Cache.size,
      l2Size: this.l2Cache.size,
      hitRate: total > 0 ? this.stats.hits / total : 0,
      totalHits: this.stats.hits,
      totalMisses: this.stats.misses,
      evictions: this.stats.evictions,
    };
  }

  prune(): number {
    const now = Date.now();
    let pruned = 0;
    
    this.l2Cache.forEach((entry, key) => {
      if (now > entry.expiresAt) {
        this.l2Cache.delete(key);
        this.l1Cache.delete(key);
        pruned++;
      }
    });
    
    return pruned;
  }
}

export const aiCache = new AICache();

export const responseCacheConfig = {
  general: {
    ttl: 300000, // 5 min
    prefix: "resp:",
  },
  marketSensitive: {
    ttl: 60000, // 1 min
    prefix: "resp:market:",
  },
  education: {
    ttl: 3600000, // 1 hour
    prefix: "resp:edu:",
  },
};

export function hashPrompt(systemPrompt: string, messages: any[]): string {
  const content = JSON.stringify({ system: systemPrompt.slice(0, 500), messages: messages.slice(-3) });
  return crypto.createHash("sha256").update(content).digest("hex").substring(0, 32);
}

interface SummarizationCacheEntry {
  summary: string;
  keyTopics: string[];
  messageCount: number;
  timestamp: number;
}

const summarizationCache = new Map<string, SummarizationCacheEntry>();

export function getCachedSummary(conversationId: string): SummarizationCacheEntry | null {
  return summarizationCache.get(conversationId) || null;
}

export function setCachedSummary(
  conversationId: string,
  summary: string,
  keyTopics: string[],
  messageCount: number
): void {
  summarizationCache.set(conversationId, {
    summary,
    keyTopics,
    messageCount,
    timestamp: Date.now(),
  });
}

export function invalidateSummaryCache(conversationId: string): void {
  summarizationCache.delete(conversationId);
}
