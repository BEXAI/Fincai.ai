import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { marketDataService } from "./market-data";
import { triggerAlertAndNotify } from "./alert-monitor";
import { strategyAnalyzer } from "./strategy-analyzer";
import { greeksCalculator } from "./greeks-calculator";
import { z } from "zod";
import { 
  createStrategyInputSchema, 
  updateStrategyStatusSchema,
  updateStrategyPositionsSchema,
  insertKnowledgeBaseSchema,
  pivotPointInputSchema,
  fibonacciInputSchema,
  atrInputSchema,
  bollingerBandsInputSchema,
  insertPsychologyEntrySchema,
  chatMessageInputSchema,
  createPriceAlertInputSchema,
  type PriceAlert,
} from "@shared/schema";
import { 
  streamChatResponse,
  streamChatWithTools,
  parsePortfolioCommand, 
  parseAlertCommand,
  parseMarketQueryCommand,
  parseStockPriceQuery,
  runMultiAgentAnalysis,
  detectMarketRegime,
  type ChatMessage,
  type MultiAgentAnalysis,
  type MarketRegime,
  type AlertCommand,
  type MarketQueryCommand,
  type StockPriceQuery,
  type ToolExecutionContext,
  type StreamEvent,
} from "./anthropic";
import { setupAuth, isAuthenticated as isAuthenticatedReplit } from "./replitAuth";
import {
  registerInputSchema,
  loginInputSchema,
  registerUser,
  loginUser,
  generateAccessToken,
  generateRefreshToken,
  verifyToken,
  setAuthCookies,
  clearAuthCookies,
  optionalAuth,
  extractRefreshToken,
  validateRefreshToken,
} from "./auth";
import { csrfTokenHandler, validateCsrf } from "./csrf";
import { authRateLimiter, registerRateLimiter, chatRateLimiter } from "./rate-limiter";
import { sanitizeChatMessage } from "./sanitize";
import { contextPipeline, isMarketSensitiveQuery, extractQuerySymbols } from "./ai-context-pipeline";
import { strategyRecommendationService } from "./strategy-recommendation";
import { generateSingleRecommendationSchema, updateRecommendationStatusSchema } from "@shared/schema";

// Domain-specific route modules
import { registerAuthRoutes } from "./routes/auth-routes";
import { registerMarketRoutes } from "./routes/market-routes";
import { registerAIRoutes } from "./routes/ai-routes";
import { registerMiscRoutes } from "./routes/misc-routes";
import { registerAgentRoutes, getPortfolioForRequest } from "./routes/agent-routes";
import { registerAiProviderRoutes } from "./routes/ai-provider-routes";
import { registerStrategyRunRoutes } from "./routes/strategy-run-routes";
import { registerNotificationRoutes } from "./routes/notification-routes";
import pricingRoutes from "./routes/pricing-routes";
import { pricingEngine } from "./pricing";

// Demo user ID for anonymous users - enables full functionality without authentication
const DEMO_USER_ID = "demo-user";

export async function registerRoutes(app: Express): Promise<Server> {
  // Setup Replit authentication as fallback
  await setupAuth(app);

  // Register domain-specific routes from modules
  registerAuthRoutes(app);
  marketDataService.setStorage(storage);
  registerMarketRoutes(app, marketDataService, storage);
  registerAIRoutes(app, storage);
  registerMiscRoutes(app, storage);

  // Pricing engine routes
  pricingEngine.initialize().catch(err => {
    console.error('[PricingEngine] Failed to initialize:', err);
  });
  app.use('/api/pricing', pricingRoutes);
  registerAgentRoutes(app);
  registerAiProviderRoutes(app);

  // Optional auth middleware - allows anonymous access but sets user context if authenticated
  const optionalAuthForFeatures = async (req: any, res: any, next: any) => {
    // Try JWT auth first
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
    
    // Fallback to Replit Auth
    if (req.isAuthenticated && req.isAuthenticated() && req.user?.claims?.sub) {
      req.userId = req.user.claims.sub;
      req.isAnonymous = false;
      return next();
    }
    
    // Allow anonymous access
    req.isAnonymous = true;
    req.userId = null;
    return next();
  };

  // Live strategy runner routes (auto-trading engine).
  registerStrategyRunRoutes(app, optionalAuthForFeatures);

  // Unified notification feed (price alerts, strategy events, agent orders).
  registerNotificationRoutes(app, optionalAuthForFeatures);

  // Health Check Route
  app.get("/api/health", (req, res) => {
    res.json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  });

  // Psychology Tracker Routes (user-scoped; anonymous uses demo user)
  app.get("/api/psychology-entries", optionalAuthForFeatures, async (req: any, res) => {
    try {
      const userId = req.isAnonymous ? DEMO_USER_ID : req.userId;
      const entries = await storage.getPsychologyEntriesForUser(userId);
      res.json(entries);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/psychology-entries", optionalAuthForFeatures, async (req: any, res) => {
    try {
      const userId = req.isAnonymous ? DEMO_USER_ID : req.userId;
      const validated = insertPsychologyEntrySchema.parse({ ...req.body, userId });

      if (validated.entryType !== "emotion" && validated.entryType !== "mistakes") {
        return res.status(400).json({ error: "entryType must be 'emotion' or 'mistakes'" });
      }

      const entry = await storage.createPsychologyEntry(validated);
      res.json(entry);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: error.message });
    }
  });

  // Strategy Routes
  app.get("/api/strategies", optionalAuthForFeatures, async (req: any, res) => {
    try {
      const userId = req.isAnonymous ? DEMO_USER_ID : req.userId;
      const strategies = await storage.getStrategiesForUser(userId);
      res.json(strategies);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/strategies/:id", optionalAuthForFeatures, async (req: any, res) => {
    try {
      const userId = req.isAnonymous ? DEMO_USER_ID : req.userId;
      const { id } = req.params;
      const strategy = await storage.getStrategy(id);
      
      if (!strategy) {
        return res.status(404).json({ error: "Strategy not found" });
      }

      if (strategy.userId && strategy.userId !== userId) {
        return res.status(403).json({ error: "Access denied" });
      }

      const legs = await storage.getLegsForStrategy(id);
      res.json({ strategy, legs });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/strategies", optionalAuthForFeatures, async (req: any, res) => {
    try {
      const userId = req.isAnonymous ? DEMO_USER_ID : req.userId;
      const validated = createStrategyInputSchema.parse(req.body);
      
      const strategy = await storage.createStrategy({
        name: validated.name,
        underlyingSymbol: validated.underlyingSymbol,
        strategyType: validated.strategyType,
        riskProfile: validated.riskProfile,
        description: validated.description,
        stopLossPercent: validated.stopLossPercent,
        profitTargetPercent: validated.profitTargetPercent,
        timeStopMinutes: validated.timeStopMinutes,
        useTrailingStop: validated.useTrailingStop,
        userId,
      });

      const legs = await Promise.all(
        validated.legs.map((leg) =>
          storage.createOptionsLeg({
            strategyId: strategy.id,
            optionType: leg.optionType,
            action: leg.action,
            strike: leg.strike,
            quantity: leg.quantity,
            premium: leg.premium,
            expirationDate: leg.expirationDate,
          })
        )
      );

      res.json({ strategy, legs });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/strategies/:id", optionalAuthForFeatures, async (req: any, res) => {
    try {
      const userId = req.isAnonymous ? DEMO_USER_ID : req.userId;
      const { id } = req.params;
      
      const strategy = await storage.getStrategy(id);
      if (!strategy) {
        return res.status(404).json({ error: "Strategy not found" });
      }
      
      if (strategy.userId && strategy.userId !== userId) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      await storage.deleteStrategy(id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Change a strategy's lifecycle status (draft -> active -> paused -> closed).
  // Activating a strategy for the first time stamps activatedAt.
  app.patch("/api/strategies/:id/status", optionalAuthForFeatures, async (req: any, res) => {
    try {
      const userId = req.isAnonymous ? DEMO_USER_ID : req.userId;
      const { id } = req.params;
      const { status } = updateStrategyStatusSchema.parse(req.body);

      const strategy = await storage.getStrategy(id);
      if (!strategy) {
        return res.status(404).json({ error: "Strategy not found" });
      }
      if (strategy.userId && strategy.userId !== userId) {
        return res.status(403).json({ error: "Access denied" });
      }

      const update: Partial<typeof strategy> = { status };
      if (status === "active" && !strategy.activatedAt) {
        update.activatedAt = new Date();
      }

      const updated = await storage.updateStrategy(id, update);
      res.json(updated);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: error.message });
    }
  });

  // Link or unlink the live holdings a strategy represents (by symbol).
  app.patch("/api/strategies/:id/positions", optionalAuthForFeatures, async (req: any, res) => {
    try {
      const userId = req.isAnonymous ? DEMO_USER_ID : req.userId;
      const { id } = req.params;
      const { linkedPositions } = updateStrategyPositionsSchema.parse(req.body);

      const strategy = await storage.getStrategy(id);
      if (!strategy) {
        return res.status(404).json({ error: "Strategy not found" });
      }
      if (strategy.userId && strategy.userId !== userId) {
        return res.status(403).json({ error: "Access denied" });
      }

      const updated = await storage.updateStrategy(id, { linkedPositions });
      res.json(updated);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: error.message });
    }
  });

  // Live P&L for a strategy, derived from the linked holdings in the caller's
  // portfolio (live Robinhood when connected, demo data otherwise) and compared
  // against the strategy's stop-loss / profit-target thresholds.
  app.get("/api/strategies/:id/pnl", optionalAuthForFeatures, async (req: any, res) => {
    try {
      const userId = req.isAnonymous ? DEMO_USER_ID : req.userId;
      const { id } = req.params;

      const strategy = await storage.getStrategy(id);
      if (!strategy) {
        return res.status(404).json({ error: "Strategy not found" });
      }
      if (strategy.userId && strategy.userId !== userId) {
        return res.status(403).json({ error: "Access denied" });
      }

      const portfolio = await getPortfolioForRequest(req, res);
      const linkedSymbols = strategy.linkedPositions ?? [];
      const positions = portfolio.holdings.filter((h) =>
        linkedSymbols.includes(h.symbol)
      );

      const currentValue = Number(
        positions.reduce((a, h) => a + h.marketValue, 0).toFixed(2)
      );
      const costBasis = Number(
        positions.reduce((a, h) => a + h.costBasis, 0).toFixed(2)
      );
      const unrealizedPnl = Number((currentValue - costBasis).toFixed(2));
      const unrealizedPnlPercent =
        costBasis > 0 ? Number(((unrealizedPnl / costBasis) * 100).toFixed(2)) : 0;

      // Progress toward each threshold as a 0-100 clamp for the UI gauges.
      const profitTargetPercent = strategy.profitTargetPercent ?? null;
      const stopLossPercent = strategy.stopLossPercent ?? null;
      const clamp = (v: number) => Math.max(0, Math.min(100, Number(v.toFixed(1))));
      const progressToTarget =
        profitTargetPercent && profitTargetPercent > 0
          ? clamp((unrealizedPnlPercent / profitTargetPercent) * 100)
          : null;
      const progressToStop =
        stopLossPercent && stopLossPercent > 0
          ? clamp((-unrealizedPnlPercent / stopLossPercent) * 100)
          : null;

      res.json({
        strategyId: strategy.id,
        status: strategy.status,
        source: portfolio.source,
        linkedSymbols,
        currentValue,
        costBasis,
        unrealizedPnl,
        unrealizedPnlPercent,
        profitTargetPercent,
        stopLossPercent,
        progressToTarget,
        progressToStop,
        positions,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/strategies/analyze", async (req, res) => {
    try {
      const { underlyingSymbol, legs } = req.body;

      if (!underlyingSymbol || !legs || !Array.isArray(legs)) {
        return res.status(400).json({ 
          error: "underlyingSymbol and legs are required" 
        });
      }

      const quote = await marketDataService.getQuote(underlyingSymbol);
      if (!quote) {
        return res.status(503).json({ 
          error: "Market data temporarily unavailable",
          message: `Unable to fetch quote for ${underlyingSymbol}` 
        });
      }
      const currentPrice = quote.price;

      const analysis = strategyAnalyzer.analyzeStrategy({
        underlyingSymbol,
        currentPrice,
        legs,
        riskFreeRate: 0.05,
        volatility: 0.20,
      });

      res.json(analysis);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Greeks Calculate Route
  app.post("/api/greeks/calculate", async (req, res) => {
    try {
      const { spotPrice, strikePrice, timeToExpiry, riskFreeRate, volatility, optionType } = req.body;

      if (!spotPrice || !strikePrice || !timeToExpiry || !optionType) {
        return res.status(400).json({
          error: "spotPrice, strikePrice, timeToExpiry, and optionType are required",
        });
      }

      const result = greeksCalculator.calculateAllGreeks({
        spotPrice,
        strikePrice,
        timeToExpiry,
        riskFreeRate: riskFreeRate || 0.05,
        volatility: volatility || 0.20,
        optionType,
      });

      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Position Sizing Route
  app.post("/api/position-sizing", async (req, res) => {
    try {
      const { accountValue, riskPercentage, premiumPerContract, maxLossPerContract } = req.body;

      if (!accountValue || !riskPercentage || !premiumPerContract || !maxLossPerContract) {
        return res.status(400).json({
          error: "accountValue, riskPercentage, premiumPerContract, and maxLossPerContract are required",
        });
      }

      const maxRiskPerPosition = (accountValue * riskPercentage) / 100;
      const recommendedContracts = Math.floor(maxRiskPerPosition / Math.abs(maxLossPerContract));
      const totalCost = recommendedContracts * premiumPerContract;
      const totalRisk = recommendedContracts * Math.abs(maxLossPerContract);

      res.json({
        accountValue,
        riskPercentage,
        maxRiskPerPosition,
        recommendedContracts,
        totalCost,
        totalRisk,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Knowledge Base Routes
  app.get("/api/knowledge", async (req, res) => {
    try {
      const documents = await storage.getAllKnowledgeDocuments();
      res.json(documents);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/knowledge/:documentId", async (req, res) => {
    try {
      const { documentId } = req.params;
      const document = await storage.getKnowledgeDocument(documentId);
      
      if (!document) {
        return res.status(404).json({ error: "Knowledge document not found" });
      }

      res.json(document);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/knowledge", async (req, res) => {
    try {
      const validationResult = insertKnowledgeBaseSchema.safeParse(req.body);
      
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed",
          details: validationResult.error.issues
        });
      }

      const data = validationResult.data;
      const existing = await storage.getKnowledgeDocument(data.documentId);
      if (existing) {
        return res.status(400).json({ error: "Document with this documentId already exists" });
      }

      // Cast embedding to expected type (drizzle-zod type mismatch)
      const documentData = {
        ...data,
        embedding: data.embedding as number[] | null | undefined,
      };
      const document = await storage.createKnowledgeDocument(documentData);
      res.json(document);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/knowledge/:documentId", async (req, res) => {
    try {
      const { documentId } = req.params;
      
      if (!documentId || typeof documentId !== 'string' || documentId.trim().length === 0) {
        return res.status(400).json({ error: "Valid documentId is required" });
      }

      const existing = await storage.getKnowledgeDocument(documentId);
      if (!existing) {
        return res.status(404).json({ error: "Knowledge document not found" });
      }

      await storage.deleteKnowledgeDocument(documentId);
      res.json({ success: true, message: "Document deleted successfully" });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Walmart Case Study Route
  app.get("/api/walmart-case-study", async (req, res) => {
    try {
      const caseStudy = {
        timeline: {
          listingDate: "2025-12-09",
          announcementDate: "2025-12-13",
          reconstitutionDate: "2025-12-20",
        },
        strategies: {
          conservative: {
            name: "QQQ January 2026 Call Debit Spread",
            description: "Lower cost, defined risk, moderate upside",
            structure: [
              "Buy QQQ Jan 16, 2026 $510 calls",
              "Sell QQQ Jan 16, 2026 $520 calls",
              "Net Debit: ~$2.50-$3.00 per spread ($250-300 per contract)",
            ],
            rationale: [
              "Caps risk while capturing upside through the reconstitution period",
              "Lower breakeven point than naked calls",
              "Profits if QQQ moves ~2-3% higher by January",
            ],
            entryTiming: "November 25-29 (before Thanksgiving week)",
            exitTargets: [
              "Exit if spread value reaches $5.00+ (67-100% gain)",
              "Stop loss if QQQ drops below $500",
            ],
            riskFactors: [
              "Limited upside capped at $520 strike",
              "Time decay on both legs",
              "News already priced in",
            ],
            maxProfit: "$200-250 per spread (67-100% ROI)",
            maxLoss: "$250-300 (premium paid)",
            breakeven: "$512.50-513.00",
          },
          moderate: {
            name: "QQQ December 31, 2025 At-the-Money Calls",
            description: "Balanced risk/reward for the specific event",
            structure: [
              "Buy QQQ Dec 31, 2025 $505 calls",
              "Premium: ~$6.00-7.00 per contract ($600-700)",
            ],
            rationale: [
              "Captures both Dec 9 listing event and Dec reconstitution announcement",
              "Shorter duration = lower premium than January options",
              "Direct play on increased QQQ demand from index tracking requirements",
            ],
            entryTiming: "November 25-29 (optimal window before event premium spike)",
            exitTargets: [
              "Exit if QQQ reaches $515-520 (2-3% move) for ~50-100% gain",
              "Scale out at 50% gain, trail stop on remainder",
            ],
            riskFactors: [
              "Accelerated time decay in final 30 days",
              "QQQ already up significantly in 2025",
              "General market risk if year-end rally falters",
            ],
            maxProfit: "$350-1000 per contract (50-150% ROI)",
            maxLoss: "$600-700 (premium paid)",
            breakeven: "$511-512",
          },
          aggressive: {
            name: "QQQ January 2026 Out-of-the-Money Calls",
            description: "Maximum leverage for strong conviction",
            structure: [
              "Buy QQQ Jan 16, 2026 $520 calls",
              "Premium: ~$3.00-4.00 per contract ($300-400)",
            ],
            rationale: [
              "Highest delta leverage if QQQ breaks above $520",
              "Captures momentum from both Walmart addition and year-end rally",
              "Limited risk (premium paid) with asymmetric upside",
            ],
            entryTiming: "November 25-29 before event premium increases",
            exitTargets: [
              "Scale out at 100% gain",
              "Trail stop on remainder above $525",
              "Exit all positions by Dec 18-20",
            ],
            riskFactors: [
              "Requires QQQ to move >3% to be profitable",
              "Higher probability of total loss",
              "Implied volatility risk",
            ],
            maxProfit: "Unlimited above $520 (200%+ potential)",
            maxLoss: "$300-400 (premium paid)",
            breakeven: "$523-524",
          },
        },
      };

      res.json(caseStudy);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Market Analysis Routes
  
  // Calculate Pivot Points
  app.post("/api/market-analysis/pivot-points", async (req, res) => {
    try {
      const input = pivotPointInputSchema.parse(req.body);

      // Standard Pivot Point formula
      const pivotPoint = (input.high + input.low + input.close) / 3;
      const r1 = (2 * pivotPoint) - input.low;
      const r2 = pivotPoint + (input.high - input.low);
      const r3 = r2 + (input.high - input.low);
      const s1 = (2 * pivotPoint) - input.high;
      const s2 = pivotPoint - (input.high - input.low);
      const s3 = s2 - (input.high - input.low);

      res.json({
        pivotPoint: Number(pivotPoint.toFixed(2)),
        resistance: {
          r1: Number(r1.toFixed(2)),
          r2: Number(r2.toFixed(2)),
          r3: Number(r3.toFixed(2)),
        },
        support: {
          s1: Number(s1.toFixed(2)),
          s2: Number(s2.toFixed(2)),
          s3: Number(s3.toFixed(2)),
        },
      });
    } catch (error: any) {
      if (error.name === "ZodError") {
        return res.status(400).json({ error: error.errors[0].message });
      }
      res.status(500).json({ error: error.message });
    }
  });

  // Calculate Fibonacci Retracement Levels
  app.post("/api/market-analysis/fibonacci", async (req, res) => {
    try {
      const input = fibonacciInputSchema.parse(req.body);

      const range = input.high - input.low;
      const levels = {
        level_0: Number(input.high.toFixed(2)),
        level_236: Number((input.high - range * 0.236).toFixed(2)),
        level_382: Number((input.high - range * 0.382).toFixed(2)),
        level_50: Number((input.high - range * 0.5).toFixed(2)),
        level_618: Number((input.high - range * 0.618).toFixed(2)),
        level_786: Number((input.high - range * 0.786).toFixed(2)),
        level_100: Number(input.low.toFixed(2)),
      };

      res.json(levels);
    } catch (error: any) {
      if (error.name === "ZodError") {
        return res.status(400).json({ error: error.errors[0].message });
      }
      res.status(500).json({ error: error.message });
    }
  });

  // Calculate ATR (Average True Range)
  app.post("/api/market-analysis/atr", async (req, res) => {
    try {
      const input = atrInputSchema.parse(req.body);

      const trueRanges = [];
      for (let i = 1; i < input.prices.length; i++) {
        const current = input.prices[i];
        const previous = input.prices[i - 1];
        
        const highLow = current.high - current.low;
        const highClose = Math.abs(current.high - previous.close);
        const lowClose = Math.abs(current.low - previous.close);
        
        trueRanges.push(Math.max(highLow, highClose, lowClose));
      }

      // Simple moving average of true ranges
      const atr = trueRanges.slice(-input.period).reduce((sum, tr) => sum + tr, 0) / input.period;

      res.json({
        atr: Number(atr.toFixed(2)),
        period: input.period,
        interpretation: atr > 5 ? "High volatility" : atr > 2 ? "Moderate volatility" : "Low volatility",
      });
    } catch (error: any) {
      if (error.name === "ZodError") {
        return res.status(400).json({ error: error.errors[0].message });
      }
      res.status(500).json({ error: error.message });
    }
  });

  // Calculate Bollinger Bands
  app.post("/api/market-analysis/bollinger-bands", async (req, res) => {
    try {
      const input = bollingerBandsInputSchema.parse(req.body);

      // Calculate SMA
      const closePrices = input.prices.slice(-input.period);
      const sma = closePrices.reduce((sum, price) => sum + price, 0) / input.period;

      // Calculate standard deviation
      const squaredDiffs = closePrices.map(price => Math.pow(price - sma, 2));
      const variance = squaredDiffs.reduce((sum, diff) => sum + diff, 0) / input.period;
      const standardDeviation = Math.sqrt(variance);

      const upperBand = sma + (input.stdDev * standardDeviation);
      const lowerBand = sma - (input.stdDev * standardDeviation);
      
      const currentPrice = input.prices[input.prices.length - 1];
      const bandWidth = ((upperBand - lowerBand) / sma) * 100;

      res.json({
        sma: Number(sma.toFixed(2)),
        upperBand: Number(upperBand.toFixed(2)),
        lowerBand: Number(lowerBand.toFixed(2)),
        bandWidth: Number(bandWidth.toFixed(2)),
        currentPrice: Number(currentPrice.toFixed(2)),
        interpretation: currentPrice > upperBand ? "Overbought" : 
                       currentPrice < lowerBand ? "Oversold" : "Normal range",
      });
    } catch (error: any) {
      if (error.name === "ZodError") {
        return res.status(400).json({ error: error.errors[0].message });
      }
      res.status(500).json({ error: error.message });
    }
  });

  // Get VIX and volatility data
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

      // VIX interpretation levels
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

  // Market snapshot for backdrop
  app.get("/api/market/snapshots/:symbol", async (req, res) => {
    try {
      const { symbol } = req.params;
      const limit = parseInt(req.query.limit as string) || 100;
      
      const snapshots = await storage.getRecentSnapshots(symbol.toUpperCase(), limit);
      
      // If no snapshots, create some based on current quote
      if (snapshots.length === 0) {
        const quote = await marketDataService.getQuote(symbol.toUpperCase());
        if (quote) {
          // Create initial snapshot
          const snapshot = await storage.createMarketSnapshot({
            symbol: symbol.toUpperCase(),
            price: quote.price,
            open: quote.open,
            high: quote.high,
            low: quote.low,
            volume: quote.volume,
            timestamp: new Date(),
          });
          return res.json([snapshot]);
        } else {
          return res.json([]);
        }
      }
      
      res.json(snapshots);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================
  // Disclosure and Alert routes are now in misc-routes.ts
  // ============================================

  const httpServer = createServer(app);
  
  // ===== Semantic Response Cache for AI Chat =====
  interface CachedResponse {
    response: string;
    timestamp: number;
    marketState?: { spyPrice: number; spyChange: number };
  }
  const semanticCache = new Map<string, CachedResponse>();
  const SEMANTIC_CACHE_TTL = 300000; // 5 minutes for general queries
  const MARKET_CACHE_TTL = 60000; // 1 minute for market-sensitive queries

  // Normalize query for cache key (lowercase, trim, remove punctuation, sort words)
  function normalizeQueryForCache(query: string): string {
    return query
      .toLowerCase()
      .replace(/[?.!,;:'"]/g, '')
      .trim()
      .split(/\s+/)
      .filter(w => w.length > 2 && !['the', 'what', 'how', 'can', 'you', 'please', 'tell', 'show'].includes(w))
      .sort()
      .join(' ');
  }

  // Check if query is market-sensitive (needs shorter cache TTL)
  function isMarketSensitiveQuery(query: string): boolean {
    const marketKeywords = ['price', 'trading', 'worth', 'cost', 'buy', 'sell', 'today', 'now', 'current'];
    return marketKeywords.some(kw => query.toLowerCase().includes(kw));
  }

  // Get cached response if valid
  function getCachedResponse(query: string, currentSpyPrice?: number): CachedResponse | null {
    const cacheKey = normalizeQueryForCache(query);
    const cached = semanticCache.get(cacheKey);
    if (!cached) return null;
    
    const ttl = isMarketSensitiveQuery(query) ? MARKET_CACHE_TTL : SEMANTIC_CACHE_TTL;
    const isExpired = Date.now() - cached.timestamp > ttl;
    
    // For market-sensitive queries, also check if SPY price changed significantly (>0.5%)
    if (cached.marketState && currentSpyPrice) {
      const priceChange = Math.abs(currentSpyPrice - cached.marketState.spyPrice) / cached.marketState.spyPrice;
      if (priceChange > 0.005) return null; // Invalidate if price moved >0.5%
    }
    
    return isExpired ? null : cached;
  }

  // Store response in cache
  function setCachedResponse(query: string, response: string, spyPrice?: number, spyChange?: number): void {
    const cacheKey = normalizeQueryForCache(query);
    semanticCache.set(cacheKey, {
      response,
      timestamp: Date.now(),
      marketState: spyPrice ? { spyPrice, spyChange: spyChange || 0 } : undefined,
    });
  }

  // ===== WebSocket Market Data Server =====
  const wss = new WebSocketServer({ server: httpServer, path: "/ws/market" });
  const clients = new Set<WebSocket>();
  
  wss.on("connection", (ws) => {
    clients.add(ws);
    
    // Send initial SPY quote on connection
    marketDataService.getQuote("SPY").then(quote => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "quote", data: quote }));
      }
    }).catch(() => {});
    
    ws.on("close", () => {
      clients.delete(ws);
    });
    
    ws.on("error", () => {
      clients.delete(ws);
    });
  });
  
  // Check and trigger price alerts based on current prices
  const checkPriceAlerts = async (priceCache: Map<string, number>) => {
    try {
      const activeAlerts = await storage.getActivePriceAlerts();
      const triggeredAlerts: PriceAlert[] = [];
      
      for (const alert of activeAlerts) {
        const currentPrice = priceCache.get(alert.symbol);
        if (!currentPrice) continue;
        
        let shouldTrigger = false;
        
        if (alert.condition === "above" && currentPrice >= alert.targetPrice) {
          shouldTrigger = true;
        } else if (alert.condition === "below" && currentPrice <= alert.targetPrice) {
          shouldTrigger = true;
        } else if (alert.condition === "crosses") {
          const prevPrice = alert.currentPriceAtCreation;
          if (prevPrice) {
            const crossedAbove = prevPrice < alert.targetPrice && currentPrice >= alert.targetPrice;
            const crossedBelow = prevPrice > alert.targetPrice && currentPrice <= alert.targetPrice;
            shouldTrigger = crossedAbove || crossedBelow;
          }
        }
        
        if (shouldTrigger) {
          // Route through the shared helper so this real-time path ALSO writes a
          // unified-feed notification (deduped on alert:<id>) — otherwise an alert
          // fired here would never reach the NotificationBell.
          const triggeredAlert = await triggerAlertAndNotify(alert, currentPrice);
          if (triggeredAlert) {
            triggeredAlerts.push(triggeredAlert);
          }
        }
      }
      
      return triggeredAlerts;
    } catch (error) {
      return [];
    }
  };

  // Broadcast market updates every 2 seconds for real-time feel
  const broadcastMarketData = async () => {
    if (clients.size === 0) return;
    
    try {
      const quote = await marketDataService.getQuote("SPY");
      
      // If no quote data available, skip this broadcast cycle
      if (!quote) {
        return;
      }
      
      const message = JSON.stringify({ type: "quote", data: quote });
      
      clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(message);
        }
      });
      
      // Store snapshot for historical data
      await storage.createMarketSnapshot({
        symbol: "SPY",
        price: quote.price,
        open: quote.open,
        high: quote.high,
        low: quote.low,
        volume: quote.volume,
        timestamp: new Date(),
      });
      
      // Check price alerts with current price data
      const priceCache = new Map<string, number>();
      priceCache.set("SPY", quote.price);
      
      // Get unique symbols from active alerts and fetch their prices
      const activeAlerts = await storage.getActivePriceAlerts();
      const uniqueSymbols = Array.from(new Set(activeAlerts.map(a => a.symbol)));
      
      for (const symbol of uniqueSymbols) {
        if (symbol !== "SPY" && !priceCache.has(symbol)) {
          const symbolQuote = await marketDataService.getQuote(symbol);
          if (symbolQuote) {
            priceCache.set(symbol, symbolQuote.price);
          }
        }
      }
      
      // Check and trigger alerts
      const triggeredAlerts = await checkPriceAlerts(priceCache);
      
      // Broadcast triggered alerts to all clients
      if (triggeredAlerts.length > 0) {
        const alertMessage = JSON.stringify({ 
          type: "alerts_triggered", 
          data: triggeredAlerts 
        });
        
        clients.forEach((client) => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(alertMessage);
          }
        });
      }
    } catch (error) {
      // Silent fail - will retry on next interval
    }
  };
  
  // Start broadcasting every 2 seconds
  const marketDataInterval = setInterval(broadcastMarketData, 2000);

  // Attach cleanup function for graceful shutdown
  (httpServer as any).__wss = wss;
  (httpServer as any).__wsClients = clients;
  (httpServer as any).__marketDataInterval = marketDataInterval;
  
  return httpServer;
}
