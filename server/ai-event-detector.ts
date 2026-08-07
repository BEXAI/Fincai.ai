import { MarketDataService } from './market-data';
import { IStorage } from './storage';

export interface MarketEvent {
  type: 'price_spike' | 'price_drop' | 'volume_spike' | 'gap' | 'key_level' | 'portfolio_alert';
  symbol: string;
  severity: 'info' | 'warning' | 'critical';
  message: string;
  details: {
    currentPrice?: number;
    priceChange?: number;
    percentChange?: number;
    volume?: number;
    volumeRatio?: number;
    level?: number;
    levelType?: string;
  };
  timestamp: string;
}

export interface EventDetectorConfig {
  largeMoveThresholdPercent: number;
  criticalMoveThresholdPercent: number;
  volumeSpikeRatio: number;
  checkIntervalMs: number;
}

interface SymbolStats {
  averageVolume: number;
  fiftyTwoWeekHigh: number;
  fiftyTwoWeekLow: number;
  previousClose: number;
}

const DEFAULT_CONFIG: EventDetectorConfig = {
  largeMoveThresholdPercent: 3,
  criticalMoveThresholdPercent: 5,
  volumeSpikeRatio: 2,
  checkIntervalMs: 60000,
};

const ROUND_NUMBER_INTERVALS = [10, 25, 50, 100, 500, 1000];

export class AIEventDetector {
  private marketDataService: MarketDataService;
  private storage: IStorage;
  private config: EventDetectorConfig;
  private eventHistory: Map<string, MarketEvent[]> = new Map();
  private previousPrices: Map<string, number> = new Map();
  private symbolStats: Map<string, SymbolStats> = new Map();
  private monitoringInterval: NodeJS.Timeout | null = null;
  private monitoredSymbols: Set<string> = new Set();
  private eventCallbacks: Set<(event: MarketEvent) => void> = new Set();
  private emittedEventKeys: Set<string> = new Set();
  private lastEventCleanup: number = Date.now();
  private checkInFlight = false;

  constructor(
    marketDataService: MarketDataService,
    storage: IStorage,
    config?: Partial<EventDetectorConfig>
  ) {
    this.marketDataService = marketDataService;
    this.storage = storage;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async startMonitoring(symbols: string[]): Promise<void> {
    symbols.forEach(symbol => this.monitoredSymbols.add(symbol.toUpperCase()));
    
    await this.initializeSymbolStats(symbols);

    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }

    // Guarded tick: a rejected check must not become an unhandled rejection,
    // and a slow check must not overlap the next tick.
    this.monitoringInterval = setInterval(() => {
      if (this.checkInFlight) return;
      this.checkInFlight = true;
      this.checkAllSymbols()
        .catch((err) => console.error("[AIEventDetector] Symbol check failed:", err))
        .finally(() => {
          this.checkInFlight = false;
        });
    }, this.config.checkIntervalMs);

    // Startup scan shares the in-flight flag so the first tick can't overlap it.
    this.checkInFlight = true;
    try {
      await this.checkAllSymbols();
    } finally {
      this.checkInFlight = false;
    }
    
    console.log(`[AIEventDetector] Started monitoring ${symbols.length} symbols`);
  }

  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    console.log('[AIEventDetector] Stopped monitoring');
  }

  addSymbol(symbol: string): void {
    this.monitoredSymbols.add(symbol.toUpperCase());
  }

  removeSymbol(symbol: string): void {
    this.monitoredSymbols.delete(symbol.toUpperCase());
    this.previousPrices.delete(symbol.toUpperCase());
    this.symbolStats.delete(symbol.toUpperCase());
    this.eventHistory.delete(symbol.toUpperCase());
  }

  private async initializeSymbolStats(symbols: string[]): Promise<void> {
    const batchSize = 5;
    for (let i = 0; i < symbols.length; i += batchSize) {
      const batch = symbols.slice(i, i + batchSize);
      await Promise.all(batch.map(async (symbol) => {
        try {
          const normalizedSymbol = symbol.toUpperCase();
          const quote = await this.marketDataService.getQuote(normalizedSymbol);
          
          if (quote) {
            this.previousPrices.set(normalizedSymbol, quote.price);
            
            const historicalData = await this.marketDataService.getHistoricalData(normalizedSymbol, '1y');
            
            let fiftyTwoWeekHigh = quote.high;
            let fiftyTwoWeekLow = quote.low;
            let totalVolume = quote.volume;
            let volumeCount = 1;

            if (historicalData.length > 0) {
              historicalData.forEach(point => {
                if (point.high > fiftyTwoWeekHigh) fiftyTwoWeekHigh = point.high;
                if (point.low < fiftyTwoWeekLow) fiftyTwoWeekLow = point.low;
                totalVolume += point.volume;
                volumeCount++;
              });
            }

            this.symbolStats.set(normalizedSymbol, {
              averageVolume: Math.round(totalVolume / volumeCount),
              fiftyTwoWeekHigh,
              fiftyTwoWeekLow,
              previousClose: quote.previousClose,
            });
          }
        } catch (error) {
          console.warn(`[AIEventDetector] Failed to initialize stats for ${symbol}:`, error);
        }
      }));
    }
  }

  private async checkAllSymbols(): Promise<void> {
    const symbols = Array.from(this.monitoredSymbols);
    const batchSize = 5;
    
    for (let i = 0; i < symbols.length; i += batchSize) {
      const batch = symbols.slice(i, i + batchSize);
      await Promise.all(batch.map(symbol => this.checkSymbol(symbol)));
    }
  }

  async checkSymbol(symbol: string): Promise<MarketEvent[]> {
    const normalizedSymbol = symbol.toUpperCase();
    const events: MarketEvent[] = [];

    try {
      const quote = await this.marketDataService.getQuote(normalizedSymbol);
      
      if (!quote) {
        return events;
      }

      const previousPrice = this.previousPrices.get(normalizedSymbol);
      const stats = this.symbolStats.get(normalizedSymbol);

      const priceEvents = this.detectPriceEvents(normalizedSymbol, quote, previousPrice);
      events.push(...priceEvents);

      if (stats) {
        const volumeEvents = this.detectVolumeEvents(normalizedSymbol, quote, stats);
        events.push(...volumeEvents);

        const keyLevelEvents = this.detectKeyLevelEvents(normalizedSymbol, quote, stats, previousPrice);
        events.push(...keyLevelEvents);

        const gapEvents = this.detectGapEvents(normalizedSymbol, quote, stats);
        events.push(...gapEvents);
      }

      this.previousPrices.set(normalizedSymbol, quote.price);

      if (events.length > 0) {
        this.recordEvents(normalizedSymbol, events);
        events.forEach(event => this.emitEvent(event));
      }

    } catch (error) {
      console.warn(`[AIEventDetector] Error checking ${symbol}:`, error);
    }

    return events;
  }

  private detectPriceEvents(
    symbol: string,
    quote: { price: number; change: number; changePercent: number },
    previousPrice?: number
  ): MarketEvent[] {
    const events: MarketEvent[] = [];
    const percentChange = Math.abs(quote.changePercent);
    const timestamp = new Date().toISOString();

    if (percentChange >= this.config.criticalMoveThresholdPercent) {
      const eventType = quote.change > 0 ? 'price_spike' : 'price_drop';
      events.push({
        type: eventType,
        symbol,
        severity: 'critical',
        message: `${symbol} ${quote.change > 0 ? 'surged' : 'plunged'} ${percentChange.toFixed(2)}% to $${quote.price.toFixed(2)}`,
        details: {
          currentPrice: quote.price,
          priceChange: quote.change,
          percentChange: quote.changePercent,
        },
        timestamp,
      });
    } else if (percentChange >= this.config.largeMoveThresholdPercent) {
      const eventType = quote.change > 0 ? 'price_spike' : 'price_drop';
      events.push({
        type: eventType,
        symbol,
        severity: 'warning',
        message: `${symbol} ${quote.change > 0 ? 'rose' : 'fell'} ${percentChange.toFixed(2)}% to $${quote.price.toFixed(2)}`,
        details: {
          currentPrice: quote.price,
          priceChange: quote.change,
          percentChange: quote.changePercent,
        },
        timestamp,
      });
    }

    return events;
  }

  private detectVolumeEvents(
    symbol: string,
    quote: { price: number; volume: number },
    stats: SymbolStats
  ): MarketEvent[] {
    const events: MarketEvent[] = [];
    const timestamp = new Date().toISOString();

    if (stats.averageVolume > 0) {
      const volumeRatio = quote.volume / stats.averageVolume;

      if (volumeRatio >= this.config.volumeSpikeRatio * 2) {
        events.push({
          type: 'volume_spike',
          symbol,
          severity: 'critical',
          message: `${symbol} volume is ${volumeRatio.toFixed(1)}x average - unusual trading activity detected`,
          details: {
            currentPrice: quote.price,
            volume: quote.volume,
            volumeRatio,
          },
          timestamp,
        });
      } else if (volumeRatio >= this.config.volumeSpikeRatio) {
        events.push({
          type: 'volume_spike',
          symbol,
          severity: 'warning',
          message: `${symbol} volume is ${volumeRatio.toFixed(1)}x average`,
          details: {
            currentPrice: quote.price,
            volume: quote.volume,
            volumeRatio,
          },
          timestamp,
        });
      }
    }

    return events;
  }

  private detectKeyLevelEvents(
    symbol: string,
    quote: { price: number },
    stats: SymbolStats,
    previousPrice?: number
  ): MarketEvent[] {
    const events: MarketEvent[] = [];
    const timestamp = new Date().toISOString();

    if (previousPrice) {
      if (quote.price >= stats.fiftyTwoWeekHigh && previousPrice < stats.fiftyTwoWeekHigh) {
        events.push({
          type: 'key_level',
          symbol,
          severity: 'critical',
          message: `${symbol} broke 52-week high at $${stats.fiftyTwoWeekHigh.toFixed(2)}!`,
          details: {
            currentPrice: quote.price,
            level: stats.fiftyTwoWeekHigh,
            levelType: '52-week high',
          },
          timestamp,
        });
      }

      if (quote.price <= stats.fiftyTwoWeekLow && previousPrice > stats.fiftyTwoWeekLow) {
        events.push({
          type: 'key_level',
          symbol,
          severity: 'critical',
          message: `${symbol} broke 52-week low at $${stats.fiftyTwoWeekLow.toFixed(2)}!`,
          details: {
            currentPrice: quote.price,
            level: stats.fiftyTwoWeekLow,
            levelType: '52-week low',
          },
          timestamp,
        });
      }

      for (const interval of ROUND_NUMBER_INTERVALS) {
        const nearestRound = Math.round(quote.price / interval) * interval;
        const previousNearest = Math.round(previousPrice / interval) * interval;
        
        if (nearestRound !== previousNearest && Math.abs(quote.price - nearestRound) < interval * 0.01) {
          const crossed = quote.price > previousPrice ? 'crossed above' : 'crossed below';
          events.push({
            type: 'key_level',
            symbol,
            severity: 'info',
            message: `${symbol} ${crossed} $${nearestRound}`,
            details: {
              currentPrice: quote.price,
              level: nearestRound,
              levelType: 'round number',
            },
            timestamp,
          });
          break;
        }
      }
    }

    return events;
  }

  private detectGapEvents(
    symbol: string,
    quote: { price: number; open: number },
    stats: SymbolStats
  ): MarketEvent[] {
    const events: MarketEvent[] = [];
    const timestamp = new Date().toISOString();

    const gapPercent = ((quote.open - stats.previousClose) / stats.previousClose) * 100;
    const absGapPercent = Math.abs(gapPercent);

    if (absGapPercent >= this.config.criticalMoveThresholdPercent) {
      events.push({
        type: 'gap',
        symbol,
        severity: 'critical',
        message: `${symbol} gapped ${gapPercent > 0 ? 'up' : 'down'} ${absGapPercent.toFixed(2)}% at market open`,
        details: {
          currentPrice: quote.price,
          priceChange: quote.open - stats.previousClose,
          percentChange: gapPercent,
        },
        timestamp,
      });
    } else if (absGapPercent >= this.config.largeMoveThresholdPercent) {
      events.push({
        type: 'gap',
        symbol,
        severity: 'warning',
        message: `${symbol} gapped ${gapPercent > 0 ? 'up' : 'down'} ${absGapPercent.toFixed(2)}% at market open`,
        details: {
          currentPrice: quote.price,
          priceChange: quote.open - stats.previousClose,
          percentChange: gapPercent,
        },
        timestamp,
      });
    }

    return events;
  }

  getRecentEvents(limit: number = 50): MarketEvent[] {
    const allEvents: MarketEvent[] = [];
    
    this.eventHistory.forEach(events => {
      allEvents.push(...events);
    });

    return allEvents
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit);
  }

  getEventsForSymbol(symbol: string, limit: number = 20): MarketEvent[] {
    const events = this.eventHistory.get(symbol.toUpperCase()) || [];
    return events
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit);
  }

  onEvent(callback: (event: MarketEvent) => void): () => void {
    this.eventCallbacks.add(callback);
    
    return () => {
      this.eventCallbacks.delete(callback);
    };
  }

  private emitEvent(event: MarketEvent): void {
    const eventKey = `${event.symbol}:${event.type}:${new Date(event.timestamp).toDateString()}`;
    
    if (this.emittedEventKeys.has(eventKey)) {
      return;
    }
    
    this.emittedEventKeys.add(eventKey);
    
    const now = Date.now();
    if (now - this.lastEventCleanup > 3600000) {
      this.emittedEventKeys.clear();
      this.lastEventCleanup = now;
    }
    
    this.eventCallbacks.forEach(callback => {
      try {
        callback(event);
      } catch (error) {
        console.error('[AIEventDetector] Error in event callback:', error);
      }
    });
  }

  private recordEvents(symbol: string, events: MarketEvent[]): void {
    const existingEvents = this.eventHistory.get(symbol) || [];
    const maxEventsPerSymbol = 100;
    
    const combinedEvents = [...events, ...existingEvents].slice(0, maxEventsPerSymbol);
    this.eventHistory.set(symbol, combinedEvents);
  }

  updateConfig(config: Partial<EventDetectorConfig>): void {
    this.config = { ...this.config, ...config };
    console.log('[AIEventDetector] Config updated:', this.config);
  }

  getConfig(): EventDetectorConfig {
    return { ...this.config };
  }

  getMonitoredSymbols(): string[] {
    return Array.from(this.monitoredSymbols);
  }

  getStats(): {
    monitoredSymbols: number;
    totalEvents: number;
    eventsByType: Record<string, number>;
  } {
    let totalEvents = 0;
    const eventsByType: Record<string, number> = {};

    this.eventHistory.forEach(events => {
      totalEvents += events.length;
      events.forEach(event => {
        eventsByType[event.type] = (eventsByType[event.type] || 0) + 1;
      });
    });

    return {
      monitoredSymbols: this.monitoredSymbols.size,
      totalEvents,
      eventsByType,
    };
  }
}

export function createAIEventDetector(
  marketDataService: MarketDataService,
  storage: IStorage,
  config?: Partial<EventDetectorConfig>
): AIEventDetector {
  return new AIEventDetector(marketDataService, storage, config);
}
