import type { Express } from "express";
import { z } from "zod";
import type { IStorage } from "../storage";
import { marketDataService } from "../market-data";
import {
  chatMessageInputSchema,
  generateSingleRecommendationSchema,
  updateRecommendationStatusSchema,
} from "@shared/schema";
import {
  streamChatWithTools,
  parsePortfolioCommand,
  parseAlertCommand,
  parseMarketQueryCommand,
  parseStockPriceQuery,
  runMultiAgentAnalysis,
  detectMarketRegime,
  type ChatMessage,
  type ToolExecutionContext,
} from "../anthropic";
import { verifyToken } from "../auth";
import { chatRateLimiter, aiAnalyzeRateLimiter } from "../rate-limiter";
import { validateCsrf } from "../csrf";
import { resolveAnalysisLlm } from "../llm-completions";
import { getAgentSessionId } from "./ai-provider-routes";
import { sanitizeChatMessage, isValidUUID } from "../sanitize";
import { contextPipeline, isMarketSensitiveQuery } from "../ai-context-pipeline";
import { strategyRecommendationService } from "../strategy-recommendation";
import { classifyIntent, shouldTreatAsConversation, type IntentClassification } from "../intent-classifier";

const DEMO_USER_ID = "demo-user";

export function registerAIRoutes(app: Express, storage: IStorage): void {
  const isAuthenticated = async (req: any, res: any, next: any) => {
    const accessToken = req.cookies?.accessToken;
    if (accessToken) {
      const payload = verifyToken(accessToken);
      if (payload && payload.type === "access") {
        const user = await storage.getUser(payload.userId);
        if (user) {
          req.user = user;
          req.userId = user.id;
          return next();
        }
      }
    }

    if (req.isAuthenticated && req.isAuthenticated() && req.user?.claims?.sub) {
      req.userId = req.user.claims.sub;
      return next();
    }

    return res.status(401).json({ message: "Unauthorized" });
  };

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

  // ========== AI Strategy Recommendations ==========

  app.get('/api/recommendations', optionalAuthForFeatures, async (req: any, res) => {
    try {
      const userId = req.user?.id || null;
      const recommendations = await strategyRecommendationService.getActiveRecommendations(userId);
      res.json(recommendations);
    } catch (error: any) {
      console.error("Get recommendations error:", error);
      res.status(500).json({ message: "Failed to get recommendations" });
    }
  });

  app.get('/api/recommendations/history', optionalAuthForFeatures, async (req: any, res) => {
    try {
      const userId = req.user?.id || null;
      const limit = parseInt(req.query.limit as string) || 50;
      const recommendations = await strategyRecommendationService.getRecommendationHistory(userId, limit);
      res.json(recommendations);
    } catch (error: any) {
      console.error("Get recommendation history error:", error);
      res.status(500).json({ message: "Failed to get recommendation history" });
    }
  });

  app.post('/api/recommendations/generate', optionalAuthForFeatures, chatRateLimiter, async (req: any, res) => {
    try {
      const userId = req.user?.id || null;
      const validated = generateSingleRecommendationSchema.parse(req.body);

      const recommendation = await strategyRecommendationService.generateRecommendation(
        validated.symbol,
        validated.riskProfile,
        userId
      );

      res.json(recommendation);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      console.error("Generate recommendation error:", error);
      res.status(500).json({ message: "Failed to generate recommendation" });
    }
  });

  app.patch('/api/recommendations/:id/status', optionalAuthForFeatures, async (req: any, res) => {
    try {
      const { id } = req.params;
      const validated = updateRecommendationStatusSchema.parse(req.body);

      const updated = await strategyRecommendationService.updateRecommendationStatus(
        id,
        validated.status,
        validated.executedTradeId
      );

      if (!updated) {
        return res.status(404).json({ message: "Recommendation not found" });
      }

      res.json(updated);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      console.error("Update recommendation status error:", error);
      res.status(500).json({ message: "Failed to update recommendation status" });
    }
  });

  app.get('/api/recommendations/:id', optionalAuthForFeatures, async (req: any, res) => {
    try {
      const { id } = req.params;
      const recommendation = await storage.getAiStrategyRecommendation(id);

      if (!recommendation) {
        return res.status(404).json({ message: "Recommendation not found" });
      }

      res.json(recommendation);
    } catch (error: any) {
      console.error("Get recommendation error:", error);
      res.status(500).json({ message: "Failed to get recommendation" });
    }
  });

  // ============================================
  // AI Chat & Conversation Routes
  // ============================================

  app.get("/api/conversations", optionalAuthForFeatures, async (req: any, res) => {
    try {
      if (req.isAnonymous) {
        return res.json([]);
      }
      const userId = req.userId;
      
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
      const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : undefined;
      
      if (limit !== undefined && (isNaN(limit) || limit < 1 || limit > 100)) {
        return res.status(400).json({ error: "Invalid limit. Must be between 1 and 100." });
      }
      if (offset !== undefined && (isNaN(offset) || offset < 0)) {
        return res.status(400).json({ error: "Invalid offset. Must be non-negative." });
      }
      
      const conversationsWithMeta = await storage.getConversationsWithMessageCount(userId, limit, offset);
      res.json(conversationsWithMeta);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/conversations/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.userId;
      const { id } = req.params;
      
      if (!isValidUUID(id)) {
        return res.status(400).json({ error: "Invalid conversation ID format" });
      }
      
      const conversation = await storage.getConversation(id);

      if (!conversation) {
        return res.status(404).json({ error: "Conversation not found" });
      }

      if (conversation.userId !== userId) {
        return res.status(403).json({ error: "Access denied" });
      }

      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
      const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : undefined;
      
      if (limit !== undefined && (isNaN(limit) || limit < 1 || limit > 500)) {
        return res.status(400).json({ error: "Invalid limit. Must be between 1 and 500." });
      }
      if (offset !== undefined && (isNaN(offset) || offset < 0)) {
        return res.status(400).json({ error: "Invalid offset. Must be non-negative." });
      }

      const effectiveOffset = offset ?? 0;
      
      const [messages, totalMessages] = await Promise.all([
        storage.getMessagesForConversation(id, limit, effectiveOffset),
        storage.getMessageCountForConversation(id),
      ]);
      
      const hasMore = limit !== undefined ? (effectiveOffset + messages.length) < totalMessages : false;
      
      res.json({ 
        conversation, 
        messages,
        pagination: {
          total: totalMessages,
          limit: limit ?? null,
          offset: effectiveOffset,
          hasMore,
        }
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/conversations", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.userId;
      const conversation = await storage.createConversation({
        userId,
        title: req.body.title || "New Chat",
      });
      res.json(conversation);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/conversations/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.userId;
      const { id } = req.params;
      
      if (!isValidUUID(id)) {
        return res.status(400).json({ error: "Invalid conversation ID format" });
      }

      const conversation = await storage.getConversation(id);
      if (!conversation) {
        return res.status(404).json({ error: "Conversation not found" });
      }
      if (conversation.userId !== userId) {
        return res.status(403).json({ error: "Access denied" });
      }

      await storage.deleteConversation(id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.put("/api/conversations/:id/title", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.userId;
      const { id } = req.params;
      const { title } = req.body;
      
      if (!isValidUUID(id)) {
        return res.status(400).json({ error: "Invalid conversation ID format" });
      }

      if (!title || typeof title !== 'string' || title.trim().length === 0) {
        return res.status(400).json({ error: "Title is required" });
      }

      const conversation = await storage.getConversation(id);
      if (!conversation) {
        return res.status(404).json({ error: "Conversation not found" });
      }
      if (conversation.userId !== userId) {
        return res.status(403).json({ error: "Access denied" });
      }

      const updated = await storage.updateConversation(id, { title: title.trim() });
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/conversations/migrate-anonymous", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.userId;
      const { messages } = req.body;

      if (!messages || !Array.isArray(messages) || messages.length === 0) {
        return res.json({ success: true, message: "No messages to migrate" });
      }

      const conversation = await storage.createConversation({
        userId,
        title: "Imported Chat",
      });

      for (const msg of messages) {
        if (msg.role && msg.content) {
          await storage.createMessage({
            conversationId: conversation.id,
            role: msg.role,
            content: msg.content,
          });
        }
      }

      const firstUserMessage = messages.find((m: any) => m.role === 'user');
      if (firstUserMessage) {
        const title = firstUserMessage.content.slice(0, 50) + (firstUserMessage.content.length > 50 ? '...' : '');
        await storage.updateConversation(conversation.id, { title });
      }

      res.json({
        success: true,
        conversationId: conversation.id,
        messagesImported: messages.length
      });
    } catch (error: any) {
      console.error("Migration error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================================================
  // ADVANCED AI FEATURES: Multi-Agent Analysis Endpoints
  // ============================================================================

  app.post("/api/ai/analyze", aiAnalyzeRateLimiter, validateCsrf, async (req, res) => {
    try {
      const { symbol } = req.body;

      if (!symbol || typeof symbol !== 'string') {
        return res.status(400).json({ error: "Symbol is required" });
      }

      const upperSymbol = symbol.toUpperCase();

      const priceData = await marketDataService.getQuote(upperSymbol);
      if (!priceData) {
        return res.status(503).json({
          error: "Market data temporarily unavailable",
          message: `Unable to fetch quote for ${upperSymbol}`
        });
      }

      let marketData;
      try {
        const [spyQuote, vixQuote] = await Promise.all([
          marketDataService.getQuote("SPY"),
          marketDataService.getQuote("VIX"),
        ]);
        if (spyQuote) {
          marketData = {
            spyPrice: spyQuote.price,
            spyChange: spyQuote.change,
            spyChangePercent: spyQuote.changePercent,
            vix: vixQuote?.price ?? undefined,
          };
        }
      } catch (e) {
        marketData = undefined;
      }

      const sessionId = getAgentSessionId(req, res);
      const llm = await resolveAnalysisLlm(sessionId);
      const analysis = await runMultiAgentAnalysis(upperSymbol, priceData, marketData, {
        completer: llm.completer,
        meta: llm.meta,
      });

      try {
        const technicalAgent = analysis.agents.find(a => a.agent === 'technical');
        const sentimentAgent = analysis.agents.find(a => a.agent === 'sentiment');
        const fundamentalAgent = analysis.agents.find(a => a.agent === 'fundamental');

        await storage.createAiPrediction({
          symbol: upperSymbol,
          recommendation: analysis.consensus.recommendation,
          signal: analysis.consensus.signal,
          confidence: analysis.consensus.confidence,
          technicalSignal: technicalAgent?.signal,
          sentimentSignal: sentimentAgent?.signal,
          fundamentalSignal: fundamentalAgent?.signal,
          marketRegime: analysis.marketRegime.regime,
          bullBearWinner: analysis.bullBearDebate?.winner,
          priceAtPrediction: priceData.price,
          analysisData: analysis,
        });
      } catch (saveError) {
        console.warn("Failed to save AI prediction:", saveError);
      }

      res.json(analysis);
    } catch (error: any) {
      console.error("Multi-agent analysis error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/ai/predictions/:symbol", async (req, res) => {
    try {
      const { symbol } = req.params;
      const limit = parseInt(req.query.limit as string) || 50;
      const predictions = await storage.getAiPredictionsForSymbol(symbol.toUpperCase(), limit);
      res.json(predictions);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/ai/predictions", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const predictions = await storage.getRecentAiPredictions(limit);
      res.json(predictions);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/ai/market-regime", async (req, res) => {
    try {
      const [spyQuote, vixQuote] = await Promise.all([
        marketDataService.getQuote("SPY"),
        marketDataService.getQuote("VIX"),
      ]);

      if (!spyQuote) {
        return res.status(503).json({
          error: "Market data temporarily unavailable",
          message: "Unable to fetch SPY data for market regime detection"
        });
      }

      const regime = await detectMarketRegime(spyQuote, vixQuote?.price ?? undefined);

      res.json({
        ...regime,
        spyPrice: spyQuote.price,
        spyChange: spyQuote.change,
        spyChangePercent: spyQuote.changePercent,
        vix: vixQuote?.price ?? undefined,
      });
    } catch (error: any) {
      console.error("Market regime error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/ai/signal/:symbol", async (req, res) => {
    try {
      const { symbol } = req.params;
      const upperSymbol = symbol.toUpperCase();

      const priceData = await marketDataService.getQuote(upperSymbol);
      if (!priceData) {
        return res.status(503).json({
          error: "Market data temporarily unavailable",
          message: `Unable to get data for ${upperSymbol}`
        });
      }

      const changePercent = priceData.changePercent || 0;
      let signal: number;
      let recommendation: string;

      if (changePercent > 2) {
        signal = 0.8;
        recommendation = 'strong_buy';
      } else if (changePercent > 0.5) {
        signal = 0.4;
        recommendation = 'buy';
      } else if (changePercent > -0.5) {
        signal = 0;
        recommendation = 'hold';
      } else if (changePercent > -2) {
        signal = -0.4;
        recommendation = 'sell';
      } else {
        signal = -0.8;
        recommendation = 'strong_sell';
      }

      res.json({
        symbol: upperSymbol,
        price: priceData.price,
        change: priceData.change,
        changePercent: priceData.changePercent,
        signal,
        recommendation,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================
  // Streaming Chat Endpoint with SSE
  // ============================================

  app.post("/api/chat/stream", chatRateLimiter, optionalAuthForFeatures, async (req: any, res) => {
    try {
      const userId = req.userId;
      const isAnonymous = req.isAnonymous;
      const effectiveUserId = isAnonymous ? DEMO_USER_ID : userId;
      const validated = chatMessageInputSchema.parse(req.body);
      const isPlanMode = validated.mode === "plan";

      if (!isAnonymous && validated.conversationId && !isValidUUID(validated.conversationId)) {
        return res.status(400).json({ error: "Invalid conversation ID format" });
      }

      const sanitizedContent = sanitizeChatMessage(validated.content);
      if (!sanitizedContent) {
        return res.status(400).json({ error: "Message content is empty after sanitization" });
      }

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.flushHeaders();

      let conversationId = validated.conversationId;
      let chatHistory: ChatMessage[] = [];

      if (isAnonymous) {
        chatHistory = validated.history || [];
        chatHistory.push({ role: "user", content: sanitizedContent });
      } else {
        if (!conversationId) {
          const conversation = await storage.createConversation({
            title: "New Chat",
            userId,
          });
          conversationId = conversation.id;
          res.write(`data: ${JSON.stringify({ type: "conversation_id", id: conversationId })}\n\n`);
        }

        await storage.createMessage({
          conversationId,
          role: "user",
          content: sanitizedContent,
          status: "complete",
        });

        const allMessages = await storage.getMessagesForConversation(conversationId);
        const recentMessages = allMessages.slice(-12);
        chatHistory = recentMessages.map(m => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        }));
      }

      const handlePortfolioCommand = async (command: ReturnType<typeof parsePortfolioCommand>): Promise<{ type: "error" | "text" | "plan_advisory"; data: any }> => {
        if (command.action === "buy" || command.action === "sell") {
          const quote = await marketDataService.getQuote(command.symbol!);
          const priceText = quote ? ` The current price is around $${quote.price.toFixed(2)}.` : "";
          const verb = command.action === "buy" ? "Buy" : "Sell";
          return {
            type: "plan_advisory",
            data: `## ${verb} ${command.symbol}\n\n` +
              `Fincai doesn't place trades directly.${priceText}\n\n` +
              `To execute trades, use the Robinhood agent in the Agent terminal (/agent). ` +
              `I'm happy to provide analysis, Greeks, risk metrics, or a trade plan to inform your decision.`,
          };
        }
        return { type: "error", data: null };
      };

      let fullResponse = "";

      if (chatHistory.length > 12) {
        chatHistory = chatHistory.slice(-12);
      }

      const intentClassification = classifyIntent(sanitizedContent);
      console.log(`[Intent] Classified "${sanitizedContent.slice(0, 50)}..." as ${intentClassification.intent} (confidence: ${intentClassification.confidence.toFixed(2)})`);

      if (shouldTreatAsConversation(intentClassification) && intentClassification.suggestedResponse) {
        fullResponse = intentClassification.suggestedResponse;
        res.write(`data: ${JSON.stringify({ type: "content", text: fullResponse })}\n\n`);
      }

      if (!fullResponse && intentClassification.intent === 'affirmation') {
        fullResponse = "Great! What would you like to do? I can help you check stock prices, view your portfolio, or analyze trading opportunities.";
        res.write(`data: ${JSON.stringify({ type: "content", text: fullResponse })}\n\n`);
      }

      if (!fullResponse && intentClassification.intent === 'negation') {
        fullResponse = "No problem! Let me know when you'd like to continue. I'm here to help with any trading questions.";
        res.write(`data: ${JSON.stringify({ type: "content", text: fullResponse })}\n\n`);
      }

      const command = !fullResponse ? parsePortfolioCommand(sanitizedContent) : { action: null, symbol: null, quantity: 0 };
      if (command.action && command.symbol) {
        const result = await handlePortfolioCommand(command);
        if (result.type === "plan_advisory") {
          fullResponse = result.data;
          res.write(`data: ${JSON.stringify({ type: "content", text: result.data })}\n\n`);
        } else if (result.type === "text" || result.type === "error") {
          if (result.data) {
            fullResponse = result.data;
            res.write(`data: ${JSON.stringify({ type: "content", text: result.data })}\n\n`);
          }
        }
      }

      if (!fullResponse) {
        const marketQuery = parseMarketQueryCommand(sanitizedContent);
        if (marketQuery.isMarketQuery && marketQuery.queryType) {
          try {
            const movers = await marketDataService.getMarketMovers();
            let responseText = "";

            const formatStock = (s: any) => {
              const sign = s.changePercent >= 0 ? "+" : "";
              return `**${s.symbol}**: $${s.price.toFixed(2)} (${sign}${s.changePercent.toFixed(2)}%)`;
            };

            const noDataMessage = "I'm having trouble fetching live market data right now. This could be due to market hours or temporary API limits. Try again in a few moments, or ask me about a specific stock symbol like AAPL or TSLA.";

            switch (marketQuery.queryType) {
              case "trending":
                const trending = await marketDataService.getTrendingStocks(5);
                if (trending.length === 0) {
                  responseText = noDataMessage;
                } else {
                  responseText = `## Trending Stocks Right Now\n\nHere are the stocks getting the most attention today:\n\n${trending.map((s, i) => `${i + 1}. ${formatStock(s)}`).join("\n")}\n\n*These are stocks with the highest trading interest today. Remember to do your own research before trading!*`;
                }
                break;
              case "gainers":
                if (movers.gainers.length === 0) {
                  responseText = noDataMessage;
                } else {
                  responseText = `## Top Gainers Today\n\nHere are the best performing stocks right now:\n\n${movers.gainers.map((s, i) => `${i + 1}. ${formatStock(s)}`).join("\n")}\n\n*Strong gains don't guarantee future performance. Always analyze the underlying reason for the move.*`;
                }
                break;
              case "losers":
                if (movers.losers.length === 0) {
                  responseText = noDataMessage;
                } else {
                  responseText = `## Biggest Losers Today\n\nThese stocks are seeing the most selling pressure:\n\n${movers.losers.map((s, i) => `${i + 1}. ${formatStock(s)}`).join("\n")}\n\n*Dips can be buying opportunities, but understand why a stock is falling before catching a falling knife.*`;
                }
                break;
              case "active":
                if (movers.mostActive.length === 0) {
                  responseText = noDataMessage;
                } else {
                  responseText = `## Most Active by Volume\n\nThese stocks have the highest trading volume today:\n\n${movers.mostActive.map((s, i) => `${i + 1}. ${formatStock(s)} - Volume: ${(s.volume / 1000000).toFixed(1)}M`).join("\n")}\n\n*High volume often indicates institutional interest or significant news.*`;
                }
                break;
              case "movers":
                if (movers.gainers.length === 0 && movers.losers.length === 0 && movers.mostActive.length === 0) {
                  responseText = noDataMessage;
                } else {
                  const parts: string[] = ["## Market Movers Today\n"];
                  if (movers.gainers.length > 0) {
                    parts.push(`### Top Gainers\n${movers.gainers.slice(0, 3).map((s, i) => `${i + 1}. ${formatStock(s)}`).join("\n")}`);
                  }
                  if (movers.losers.length > 0) {
                    parts.push(`### Top Losers\n${movers.losers.slice(0, 3).map((s, i) => `${i + 1}. ${formatStock(s)}`).join("\n")}`);
                  }
                  if (movers.mostActive.length > 0) {
                    parts.push(`### Most Active\n${movers.mostActive.slice(0, 3).map((s, i) => `${i + 1}. ${formatStock(s)}`).join("\n")}`);
                  }
                  parts.push("*Would you like me to analyze any of these stocks in detail?*");
                  responseText = parts.join("\n\n");
                }
                break;
            }

            if (responseText) {
              fullResponse = responseText;
              res.write(`data: ${JSON.stringify({ type: "content", text: responseText })}\n\n`);
            }
          } catch (marketError: any) {
            console.error("Market query error:", marketError);
            const fallbackMessage = "I'm having trouble fetching live market data right now. Try asking about a specific stock symbol like AAPL, TSLA, or SPY instead.";
            fullResponse = fallbackMessage;
            res.write(`data: ${JSON.stringify({ type: "content", text: fallbackMessage })}\n\n`);
          }
        }
      }

      if (!fullResponse && !intentClassification.shouldSkipSymbolLookup) {
        const stockQuery = parseStockPriceQuery(sanitizedContent, chatHistory);
        if (stockQuery.isStockQuery && stockQuery.symbol) {
          try {
            const quote = await marketDataService.getQuote(stockQuery.symbol);
            if (quote) {
              const sign = quote.changePercent >= 0 ? "+" : "";
              const emoji = quote.changePercent >= 0 ? "📈" : "📉";

              fullResponse = `## ${quote.symbol} ${emoji}\n\n` +
                `**Current Price:** $${quote.price.toFixed(2)}\n` +
                `**Change:** ${sign}$${quote.change.toFixed(2)} (${sign}${quote.changePercent.toFixed(2)}%)\n` +
                `**Day Range:** $${quote.low.toFixed(2)} - $${quote.high.toFixed(2)}\n` +
                `**Volume:** ${(quote.volume / 1000000).toFixed(2)}M\n\n` +
                `*Data as of ${new Date(quote.timestamp).toLocaleTimeString()}. Would you like me to analyze this stock or set a price alert?*`;

              res.write(`data: ${JSON.stringify({ type: "content", text: fullResponse })}\n\n`);
            } else {
              fullResponse = `I couldn't find current market data for "${stockQuery.symbol}". Please check the symbol and try again. Common symbols include AAPL (Apple), GOOGL (Google), MSFT (Microsoft), TSLA (Tesla).`;
              res.write(`data: ${JSON.stringify({ type: "content", text: fullResponse })}\n\n`);
            }
          } catch (quoteError: any) {
            console.error("Stock quote error:", quoteError);
            fullResponse = `I'm having trouble fetching data for ${stockQuery.symbol} right now. Please try again in a moment.`;
            res.write(`data: ${JSON.stringify({ type: "content", text: fullResponse })}\n\n`);
          }
        }
      }

      if (!fullResponse) {
        const alertCommand = parseAlertCommand(sanitizedContent);
        if (alertCommand.isAlertCommand && alertCommand.symbol && alertCommand.targetPrice) {
          if (isAnonymous) {
            fullResponse = `To set up price alerts for ${alertCommand.symbol}, please sign up or log in. This way you'll receive notifications when the price reaches $${alertCommand.targetPrice.toFixed(2)}. I can still help you analyze ${alertCommand.symbol} or discuss trading strategies!`;
            res.write(`data: ${JSON.stringify({ type: "content", text: fullResponse })}\n\n`);
          } else {
            try {
              let currentPrice: number | null = null;
              const quote = await marketDataService.getQuote(alertCommand.symbol);
              if (quote) {
                currentPrice = quote.price;
              }

              const alert = await storage.createPriceAlert({
                symbol: alertCommand.symbol,
                targetPrice: alertCommand.targetPrice,
                condition: alertCommand.condition || "crosses",
                currentPriceAtCreation: currentPrice,
                note: `Created via chat: "${sanitizedContent.slice(0, 100)}"`,
                userId,
              });

              const conditionText = alertCommand.condition === "above" ? "goes above" :
                alertCommand.condition === "below" ? "drops below" : "crosses";

              fullResponse = `I've set up a price alert for you! You'll be notified when ${alertCommand.symbol} ${conditionText} $${alertCommand.targetPrice.toFixed(2)}${currentPrice ? ` (current price: $${currentPrice.toFixed(2)})` : ""}. You can manage your alerts in the Alerts tab on the right panel.`;
              res.write(`data: ${JSON.stringify({ type: "content", text: fullResponse })}\n\n`);
            } catch (alertError: any) {
              console.error("Alert creation error:", alertError);
              fullResponse = `I understood you want to create an alert for ${alertCommand.symbol} at $${alertCommand.targetPrice}, but I encountered an error: ${alertError.message}. Please try again or use the Alerts panel.`;
              res.write(`data: ${JSON.stringify({ type: "content", text: fullResponse })}\n\n`);
            }
          }
        }
      }

      if (!fullResponse) {
        try {
          // In-app portfolio/holdings were removed in the MVP strip; trading and
          // portfolio data now live exclusively in the Robinhood agent terminal.
          // Chat operates in planning/analysis mode with a neutral demo context.
          const portfolioContext = {
            cashBalance: 100000,
            totalValue: 100000,
            holdings: [],
            recentTrades: [],
          };

          let marketContext;
          const spyQuote = await marketDataService.getQuote("SPY");
          if (spyQuote) {
            marketContext = {
              spyPrice: spyQuote.price,
              spyChange: spyQuote.change,
              spyChangePercent: spyQuote.changePercent,
            };
          }

          const queryIsMarketSensitive = isMarketSensitiveQuery(sanitizedContent);
          const cacheResult = await contextPipeline.checkCache(
            sanitizedContent,
            isAnonymous ? null : userId,
            spyQuote?.price
          );

          if (cacheResult.hit && cacheResult.data && !queryIsMarketSensitive) {
            fullResponse = cacheResult.data;
            res.write(`data: ${JSON.stringify({ type: "content", text: fullResponse })}\n\n`);
            res.write(`data: ${JSON.stringify({ type: "cache_hit", cached: true })}\n\n`);
          } else {
            const toolContext: ToolExecutionContext = {
              userId: effectiveUserId,
              portfolioContext,
              marketDataService,
              storage,
            };

            for await (const event of streamChatWithTools({
              messages: chatHistory,
              portfolioContext,
              marketContext,
              toolContext,
              enableTools: true,
            })) {
              if (event.type === "text") {
                fullResponse += event.content;
                res.write(`data: ${JSON.stringify({ type: "content", text: event.content })}\n\n`);
              } else if (event.type === "tool_call_start") {
                res.write(`data: ${JSON.stringify({ type: "tool_call", tool: event.toolName, status: "started" })}\n\n`);
              } else if (event.type === "tool_call_result") {
                res.write(`data: ${JSON.stringify({ type: "tool_result", summary: event.result.summary })}\n\n`);
              } else if (event.type === "command_result") {
                fullResponse = event.result;
                res.write(`data: ${JSON.stringify({ type: "content", text: event.result })}\n\n`);
              }
            }

            if (fullResponse && !queryIsMarketSensitive) {
              await contextPipeline.setCacheResponse(
                sanitizedContent,
                fullResponse,
                isAnonymous ? null : userId,
                spyQuote?.price,
                queryIsMarketSensitive
              );
            }
          }
        } catch (streamError: any) {
          console.error("Streaming error:", streamError);
          fullResponse = "I apologize, but I'm having trouble connecting right now. Please try again in a moment.";
          res.write(`data: ${JSON.stringify({ type: "content", text: fullResponse })}\n\n`);
        }
      }

      if (!isAnonymous && conversationId) {
        await storage.createMessage({
          conversationId,
          role: "assistant",
          content: fullResponse,
          status: "complete",
        });

        const messages = await storage.getMessagesForConversation(conversationId);
        if (messages.length <= 2) {
          const title = sanitizedContent.slice(0, 50) + (sanitizedContent.length > 50 ? "..." : "");
          await storage.updateConversation(conversationId, { title });
        }
      }

      res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
      res.end();
    } catch (error: any) {
      console.error("Chat stream error:", error);
      if (error instanceof z.ZodError) {
        res.write(`data: ${JSON.stringify({ type: "error", message: error.errors[0].message })}\n\n`);
      } else {
        res.write(`data: ${JSON.stringify({ type: "error", message: error.message })}\n\n`);
      }
      res.end();
    }
  });
}
