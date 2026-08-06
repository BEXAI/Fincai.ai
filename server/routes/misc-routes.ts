import type { Express } from "express";
import type { IStorage } from "../storage";
import { verifyToken } from "../auth";
import { marketDataService } from "../market-data";
import { createPriceAlertInputSchema, type PriceAlert } from "@shared/schema";
import { createAIEventDetector, type MarketEvent } from "../ai-event-detector";
import { parseAlertCommand } from "../anthropic";
import { z } from "zod";

const DEMO_USER_ID = "demo-user";
const MAX_ALERTS_PER_USER = 20;

const AlertParseInputSchema = z.object({
  message: z.string()
    .min(5, "Message must be at least 5 characters")
    .max(500, "Message must not exceed 500 characters")
    .transform(s => s.trim()),
});

const AlertNaturalInputSchema = z.object({
  message: z.string()
    .min(5, "Message must be at least 5 characters")
    .max(500, "Message must not exceed 500 characters")
    .transform(s => s.trim()),
  autoCreate: z.boolean().optional().default(false),
});

const EventMonitorInputSchema = z.object({
  symbol: z.string()
    .min(1, "Symbol is required")
    .max(7, "Symbol must be 1-7 characters")
    .regex(/^[A-Za-z]+$/, "Symbol must contain only letters")
    .transform(s => s.toUpperCase()),
  action: z.enum(["add", "remove"], { errorMap: () => ({ message: "Action must be 'add' or 'remove'" }) }),
});

export function registerMiscRoutes(app: Express, storage: IStorage): void {
  const optionalAuthForFeatures = async (req: any, res: any, next: any) => {
    const accessToken = req.cookies?.accessToken;
    if (accessToken) {
      const payload = verifyToken(accessToken);
      if (payload && payload.type === "access") {
        const user = await storage.getUser(payload.userId);
        if (user) {
          req.user = user;
          req.userId = user.id;
          req.isAnonymous = false;
          return next();
        }
      }
    }
    
    if (req.isAuthenticated && req.isAuthenticated() && req.user?.claims?.sub) {
      req.userId = req.user.claims.sub;
      req.isAnonymous = false;
      return next();
    }
    
    req.isAnonymous = true;
    req.userId = null;
    return next();
  };

  // ============================================
  // Watchlist Routes
  // ============================================

  app.get("/api/watchlist", optionalAuthForFeatures, async (req: any, res) => {
    try {
      const userId = req.isAnonymous ? DEMO_USER_ID : req.userId;
      const watchlist = await storage.getWatchlistForUser(userId);
      res.json(watchlist);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/watchlist", optionalAuthForFeatures, async (req: any, res) => {
    try {
      const userId = req.isAnonymous ? DEMO_USER_ID : req.userId;
      const { symbol } = req.body;

      if (!symbol) {
        return res.status(400).json({ error: "symbol is required" });
      }

      const upperSymbol = symbol.toUpperCase();

      const existing = await storage.findWatchlistBySymbolForUser(userId, upperSymbol);
      if (existing) {
        return res.status(400).json({ error: "Symbol already in watchlist" });
      }

      // Save watchlist item immediately with symbol as default name
      const item = await storage.addToWatchlist({
        symbol: upperSymbol,
        name: upperSymbol, // Use symbol as default name
        userId,
      });

      // Fire off async enrichment (don't wait for it)
      // This prevents timeout issues with market data provider rate limiting
      (async () => {
        try {
          const results = await marketDataService.searchSymbols(upperSymbol);
          if (results && results.length > 0) {
            const enrichedName = results[0].name || upperSymbol;
            // Update the watchlist item with the enriched name
            // We don't await this - best effort update
            storage.updateWatchlistItem(item.id, { name: enrichedName }).catch(err => {
              console.error(`Failed to update watchlist item ${item.id} with enriched name:`, err);
            });
          }
        } catch (error) {
          console.error(`Async symbol search failed for ${upperSymbol}:`, error);
          // Fail silently - item already saved with symbol as name
        }
      })();

      res.json(item);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/watchlist/:id", optionalAuthForFeatures, async (req: any, res) => {
    try {
      const userId = req.isAnonymous ? DEMO_USER_ID : req.userId;
      const { id } = req.params;
      
      const item = await storage.getWatchlistItem(id);
      if (!item) {
        return res.status(404).json({ error: "Watchlist item not found" });
      }
      
      if (item.userId && item.userId !== userId) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      await storage.removeFromWatchlist(id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================
  // Price Alerts API Routes
  // ============================================

  app.get("/api/alerts", optionalAuthForFeatures, async (req: any, res) => {
    try {
      const userId = req.isAnonymous ? DEMO_USER_ID : req.userId;
      const status = req.query.status as string | undefined;
      let alerts: PriceAlert[];
      
      if (status === "active") {
        alerts = await storage.getActivePriceAlertsForUser(userId);
      } else {
        alerts = await storage.getPriceAlertsForUser(userId);
      }
      
      res.json(alerts);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/alerts/symbol/:symbol", optionalAuthForFeatures, async (req: any, res) => {
    try {
      const userId = req.isAnonymous ? DEMO_USER_ID : req.userId;
      const { symbol } = req.params;
      const allAlerts = await storage.getPriceAlertsForUser(userId);
      const alerts = allAlerts.filter(a => a.symbol === symbol.toUpperCase());
      res.json(alerts);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/alerts/:id", optionalAuthForFeatures, async (req: any, res) => {
    try {
      const userId = req.isAnonymous ? DEMO_USER_ID : req.userId;
      const { id } = req.params;
      const alert = await storage.getPriceAlert(id);
      
      if (!alert) {
        return res.status(404).json({ error: "Alert not found" });
      }
      
      if (alert.userId && alert.userId !== userId) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      res.json(alert);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/alerts", optionalAuthForFeatures, async (req: any, res) => {
    try {
      const userId = req.isAnonymous ? DEMO_USER_ID : req.userId;
      const parsed = createPriceAlertInputSchema.safeParse(req.body);
      
      if (!parsed.success) {
        return res.status(400).json({ 
          error: "Invalid input", 
          details: parsed.error.errors 
        });
      }

      const { symbol, targetPrice, condition, note, expiresAt } = parsed.data;
      
      // Create alert immediately without waiting for quote data
      // This prevents timeout issues with market data provider rate limiting
      const alert = await storage.createPriceAlert({
        symbol: symbol.toUpperCase(),
        targetPrice,
        condition,
        status: "active",
        currentPriceAtCreation: null, // Will be enriched asynchronously
        note: note ?? null,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        userId,
      });
      
      // Fire off async enrichment (don't wait for it)
      // Fetch current price in the background
      (async () => {
        try {
          const quote = await marketDataService.getQuote(symbol.toUpperCase());
          if (quote) {
            // Update alert with current price
            // We don't await this - best effort update
            storage.updatePriceAlert(alert.id, { 
              currentPriceAtCreation: quote.price 
            }).catch(err => {
              console.error(`Failed to update alert ${alert.id} with current price:`, err);
            });
          }
        } catch (error) {
          console.error(`Async quote fetch failed for ${symbol.toUpperCase()}:`, error);
          // Fail silently - alert already saved without current price
        }
      })();
      
      res.status(201).json({
        alert,
        message: `Alert created: Notify when ${symbol.toUpperCase()} goes ${condition} $${targetPrice.toFixed(2)}`,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/alerts/:id", optionalAuthForFeatures, async (req: any, res) => {
    try {
      const userId = req.isAnonymous ? DEMO_USER_ID : req.userId;
      const { id } = req.params;
      const alert = await storage.getPriceAlert(id);
      
      if (!alert) {
        return res.status(404).json({ error: "Alert not found" });
      }
      
      if (alert.userId && alert.userId !== userId) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      await storage.deletePriceAlert(id);
      res.json({ message: "Alert deleted successfully" });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.patch("/api/alerts/:id", optionalAuthForFeatures, async (req: any, res) => {
    try {
      const userId = req.isAnonymous ? DEMO_USER_ID : req.userId;
      const { id } = req.params;
      const { status } = req.body;
      
      if (!["active", "cancelled", "expired"].includes(status)) {
        return res.status(400).json({ error: "Invalid status" });
      }
      
      const existingAlert = await storage.getPriceAlert(id);
      if (!existingAlert) {
        return res.status(404).json({ error: "Alert not found" });
      }
      
      if (existingAlert.userId && existingAlert.userId !== userId) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      const alert = await storage.updatePriceAlert(id, { status });
      res.json(alert);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================
  // Natural Language Alert Parsing
  // ============================================

  app.post("/api/alerts/parse", optionalAuthForFeatures, async (req: any, res) => {
    try {
      const validationResult = AlertParseInputSchema.safeParse(req.body);
      
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Invalid input",
          details: validationResult.error.errors.map(e => e.message),
        });
      }
      
      const { message } = validationResult.data;
      const parsed = parseAlertCommand(message);
      
      if (!parsed.isAlertCommand) {
        return res.json({
          success: false,
          message: "Could not parse alert from message. Try something like 'Alert me when AAPL hits $200' or 'Notify me if SPY drops below $600'.",
          suggestions: [
            "Alert me when AAPL hits $200",
            "Notify me if SPY drops below $600",
            "Set alert for TSLA above $300",
            "Watch NVDA at $200",
            "AAPL above 300"
          ]
        });
      }
      
      let currentPrice: number | undefined;
      if (parsed.symbol) {
        const quote = await marketDataService.getQuote(parsed.symbol);
        if (quote) {
          currentPrice = quote.price;
        }
      }
      
      res.json({
        success: true,
        parsed: {
          symbol: parsed.symbol,
          targetPrice: parsed.targetPrice,
          condition: parsed.condition,
          currentPrice,
        },
        message: `Parsed: Alert when ${parsed.symbol} goes ${parsed.condition} $${parsed.targetPrice?.toFixed(2)}${currentPrice ? ` (current: $${currentPrice.toFixed(2)})` : ''}`
      });
    } catch (error: any) {
      console.error('[AlertParse] Error:', error);
      res.status(500).json({ error: "Failed to parse alert request" });
    }
  });

  app.post("/api/alerts/natural", optionalAuthForFeatures, async (req: any, res) => {
    try {
      const validationResult = AlertNaturalInputSchema.safeParse(req.body);
      
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Invalid input",
          details: validationResult.error.errors.map(e => e.message),
        });
      }
      
      const userId = req.isAnonymous ? DEMO_USER_ID : req.userId;
      const { message, autoCreate } = validationResult.data;
      
      const parsed = parseAlertCommand(message);
      
      if (!parsed.isAlertCommand || !parsed.symbol || !parsed.targetPrice || !parsed.condition) {
        return res.status(400).json({
          success: false,
          message: "Could not understand your alert request. Try: 'Alert me when AAPL reaches $200'",
          suggestions: [
            "Alert me when AAPL hits $200",
            "Notify if SPY goes above $700",
            "Tell me when TSLA drops below $400",
            "Watch NVDA at $200",
            "AAPL above 300"
          ]
        });
      }
      
      if (autoCreate) {
        const existingAlerts = await storage.getPriceAlertsForUser(userId);
        const activeAlerts = existingAlerts.filter((a: PriceAlert) => a.status === "active");
        
        if (activeAlerts.length >= MAX_ALERTS_PER_USER) {
          return res.status(429).json({
            error: "Alert limit reached",
            message: `You can have up to ${MAX_ALERTS_PER_USER} active alerts. Delete some alerts to create new ones.`,
            activeCount: activeAlerts.length,
            limit: MAX_ALERTS_PER_USER,
          });
        }
        
        const duplicateAlert = activeAlerts.find(
          (a: PriceAlert) => a.symbol === parsed.symbol && 
               a.condition === parsed.condition && 
               Math.abs(a.targetPrice - parsed.targetPrice!) < 0.01
        );
        
        if (duplicateAlert) {
          return res.status(409).json({
            error: "Duplicate alert",
            message: `You already have an alert for ${parsed.symbol} ${parsed.condition} $${parsed.targetPrice!.toFixed(2)}`,
            existingAlert: duplicateAlert,
          });
        }
        
        // Create alert immediately without waiting for quote data
        // This prevents timeout issues with market data provider rate limiting
        const symbol = parsed.symbol; // Capture for async closure
        const alert = await storage.createPriceAlert({
          symbol: symbol,
          targetPrice: parsed.targetPrice,
          condition: parsed.condition,
          status: "active",
          currentPriceAtCreation: null, // Will be enriched asynchronously
          note: `Created via natural language: "${message}"`,
          expiresAt: null,
          userId,
        });
        
        // Fire off async enrichment (don't wait for it)
        // Fetch current price in the background
        (async () => {
          try {
            const quote = await marketDataService.getQuote(symbol);
            if (quote) {
              // Update alert with current price
              storage.updatePriceAlert(alert.id, { 
                currentPriceAtCreation: quote.price 
              }).catch(err => {
                console.error(`Failed to update alert ${alert.id} with current price:`, err);
              });
            }
          } catch (error) {
            console.error(`Async quote fetch failed for ${symbol}:`, error);
            // Fail silently - alert already saved without current price
          }
        })();
        
        return res.status(201).json({
          success: true,
          alert,
          message: `Alert created: ${parsed.symbol} ${parsed.condition} $${parsed.targetPrice.toFixed(2)}`,
          alertsRemaining: MAX_ALERTS_PER_USER - activeAlerts.length - 1,
        });
      }
      
      // For parsing without autoCreate, fetch current price synchronously
      // since user needs to see it before confirming alert creation
      let currentPrice: number | undefined;
      const quote = await marketDataService.getQuote(parsed.symbol);
      if (quote) {
        currentPrice = quote.price;
      }
      
      res.json({
        success: true,
        parsed: {
          symbol: parsed.symbol,
          targetPrice: parsed.targetPrice,
          condition: parsed.condition,
        },
        currentPrice,
        message: `Ready to create: Alert when ${parsed.symbol} goes ${parsed.condition} $${parsed.targetPrice.toFixed(2)}`,
        confirmation: "Set autoCreate: true to create this alert"
      });
    } catch (error: any) {
      console.error('[AlertNatural] Error:', error);
      res.status(500).json({ error: "Failed to process alert request" });
    }
  });

  // ============================================
  // AI Market Event Detection
  // ============================================
  
  const eventDetector = createAIEventDetector(marketDataService, storage);
  const recentEvents: MarketEvent[] = [];
  
  eventDetector.onEvent((event) => {
    recentEvents.unshift(event);
    if (recentEvents.length > 100) {
      recentEvents.pop();
    }
    console.log(`[AIEventDetector] ${event.severity.toUpperCase()}: ${event.message}`);
  });

  const HOT_SYMBOLS = [
    'SPY', 'QQQ', 'DIA', 'IWM', 'VIX',
    'AAPL', 'MSFT', 'NVDA', 'GOOGL', 'AMZN',
    'META', 'TSLA', 'JPM', 'BAC', 'GS'
  ];
  
  // Delay event detector startup to avoid rate limits
  setTimeout(() => {
    eventDetector.startMonitoring(HOT_SYMBOLS).then(() => {
      console.log(`[AIEventDetector] Started monitoring ${HOT_SYMBOLS.length} symbols`);
    }).catch((err) => {
      console.error('[AIEventDetector] Failed to start monitoring:', err);
    });
  }, 60000); // Wait 1 minute before starting monitoring

  app.post("/api/events/monitor", optionalAuthForFeatures, async (req: any, res) => {
    try {
      const { symbol, action } = req.body;
      
      if (!symbol || !/^[A-Za-z]{1,7}$/.test(symbol)) {
        return res.status(400).json({ error: "Invalid symbol" });
      }
      
      const upperSymbol = symbol.toUpperCase();
      
      if (action === 'add') {
        eventDetector.addSymbol(upperSymbol);
        res.json({ message: `Now monitoring ${upperSymbol}`, symbol: upperSymbol });
      } else if (action === 'remove') {
        eventDetector.removeSymbol(upperSymbol);
        res.json({ message: `Stopped monitoring ${upperSymbol}`, symbol: upperSymbol });
      } else {
        res.status(400).json({ error: "Action must be 'add' or 'remove'" });
      }
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/events/market", optionalAuthForFeatures, async (req: any, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
      const severity = req.query.severity as string | undefined;
      
      let events = recentEvents.slice(0, limit);
      
      if (severity && ['info', 'warning', 'critical'].includes(severity)) {
        events = events.filter(e => e.severity === severity);
      }
      
      res.json({
        events,
        count: events.length,
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/events/check/:symbol", optionalAuthForFeatures, async (req: any, res) => {
    try {
      const { symbol } = req.params;
      
      if (!symbol || !/^[A-Za-z]{1,7}$/.test(symbol)) {
        return res.status(400).json({ error: "Invalid symbol" });
      }
      
      const events = await eventDetector.checkSymbol(symbol.toUpperCase());
      
      res.json({
        symbol: symbol.toUpperCase(),
        events,
        count: events.length,
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/events/stats", optionalAuthForFeatures, async (req: any, res) => {
    try {
      const stats = eventDetector.getStats();
      
      res.json({
        ...stats,
        recentEventsCount: recentEvents.length,
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });
}
