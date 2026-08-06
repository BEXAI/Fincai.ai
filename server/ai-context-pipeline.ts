import { storage } from "./storage";
import { searchKnowledgeBase, type RAGSearchResult, type RAGSearchOptions } from "./rag";
import { aiCache, type CacheType } from "./ai-cache";
import { generateEmbedding } from "./embeddings";
import type { ChatMessage, PortfolioContext, MarketContext } from "./anthropic";
import type { KnowledgeBase, RAGChunk } from "@shared/schema";

export interface RAGContext {
  documents: RAGChunk[];
  totalTokens: number;
  queryTokens: number;
}

export interface CacheCheckResult {
  hit: boolean;
  data?: string;
  cacheKey?: string;
}

export interface CacheableQuery {
  query: string;
  userId?: string;
  currentSpyPrice?: number;
}

interface ConversationMemory {
  summaryTokens: number;
  recentMessages: ChatMessage[];
  rollingSummary: string | null;
  keyTopics: string[];
  tradingContext: Record<string, unknown> | null;
}

interface ContextInjectionResult {
  ragContext: RAGContext;
  memory: ConversationMemory;
  totalTokens: number;
  budgetUsed: number;
}

interface PipelineConfig {
  maxContextTokens: number;
  maxRecentMessages: number;
  summaryThreshold: number;
  ragTopK: number;
  enableRAG: boolean;
  enableCache: boolean;
  enableSummarization: boolean;
}

const DEFAULT_CONFIG: PipelineConfig = {
  maxContextTokens: 8000,
  maxRecentMessages: 25,
  summaryThreshold: 30,
  ragTopK: 5,
  enableRAG: true,
  enableCache: true,
  enableSummarization: true,
};

export class AIContextPipeline {
  private config: PipelineConfig;

  constructor(config: Partial<PipelineConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async checkCache(
    query: string,
    userId: string | null,
    spyPrice?: number
  ): Promise<CacheCheckResult> {
    if (!this.config.enableCache) {
      return { hit: false };
    }

    const cacheType: CacheType = "response";
    const cacheKey = aiCache.generateCacheKey(cacheType, query, userId ? { userId } : undefined);
    
    // L1/L2: Check in-memory cache first
    const cached = aiCache.get<string>(cacheKey, spyPrice);
    if (cached) {
      return { hit: true, data: cached, cacheKey };
    }

    // L3: Check database cache for cross-session persistence
    try {
      const dbCached = await storage.getAiCache(cacheKey);
      if (dbCached) {
        // Check if cache is still valid (not expired and SPY price hasn't drifted too much)
        const now = new Date();
        if (dbCached.expiresAt && dbCached.expiresAt > now) {
          // Check SPY price drift for market-sensitive entries
          if (dbCached.marketSensitive && dbCached.spyPriceAtCache && spyPrice) {
            const drift = Math.abs(spyPrice - dbCached.spyPriceAtCache) / dbCached.spyPriceAtCache;
            if (drift > 0.005) {
              // 0.5% drift threshold exceeded, skip cache
              return { hit: false, cacheKey };
            }
          }
          
          const response = (dbCached.payload as { response?: string })?.response || String(dbCached.payload);
          
          // Promote to L1/L2 for faster subsequent access
          aiCache.set(cacheKey, response, {
            type: cacheType,
            marketSensitive: dbCached.marketSensitive ?? false,
            spyPrice: dbCached.spyPriceAtCache ?? undefined,
          });
          
          // Update hit count
          await storage.updateAiCacheHit(cacheKey);
          
          return { hit: true, data: response, cacheKey };
        }
      }
    } catch (error) {
      console.error("[Cache] L3 database lookup failed:", error);
    }

    return { hit: false, cacheKey };
  }

  async setCacheResponse(
    query: string,
    response: string,
    userId: string | null,
    spyPrice?: number,
    isMarketSensitive: boolean = false
  ): Promise<void> {
    if (!this.config.enableCache) return;

    const cacheType: CacheType = "response";
    const cacheKey = aiCache.generateCacheKey(cacheType, query, userId ? { userId } : undefined);
    
    // L1/L2: Set in-memory cache
    aiCache.set(cacheKey, response, {
      type: cacheType,
      marketSensitive: isMarketSensitive,
      spyPrice,
    });
    
    // L3: Persist to database for cross-session caching
    try {
      const ttlMinutes = isMarketSensitive ? 1 : 5;
      const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);
      const tokenCount = Math.ceil(response.length / 4); // Rough token estimate
      
      await storage.setAiCache({
        cacheKey,
        cacheType,
        payload: { response, query: query.substring(0, 200), userId },
        tokenCount,
        expiresAt,
        marketSensitive: isMarketSensitive,
        spyPriceAtCache: spyPrice ?? null,
      });
    } catch (error) {
      console.error("[Cache] L3 database persistence failed:", error);
    }
  }

  async getRAGContext(
    query: string,
    categories?: string[]
  ): Promise<RAGContext> {
    if (!this.config.enableRAG) {
      return {
        documents: [],
        totalTokens: 0,
        queryTokens: 0,
      };
    }

    try {
      const knowledgeDocs = await storage.getKnowledgeDocumentsWithEmbeddings();
      
      if (knowledgeDocs.length === 0) {
        return {
          documents: [],
          totalTokens: 0,
          queryTokens: 0,
        };
      }

      // Apply 75% token budget allocation for RAG context
      const ragBudget = Math.floor(this.config.maxContextTokens * 0.20); // 20% of context for RAG
      const searchOptions: RAGSearchOptions = {
        topK: this.config.ragTopK,
        minScore: 0.4,
        categories,
        maxTokens: ragBudget,
        contextBudgetPercent: 0.75, // Use 75% of allocated budget
      };

      const result = await searchKnowledgeBase(query, knowledgeDocs, searchOptions);

      return {
        documents: result.chunks,
        totalTokens: result.totalTokens,
        queryTokens: result.queryEmbedding.length,
      };
    } catch (error) {
      console.error("[RAG] Error retrieving context:", error);
      return {
        documents: [],
        totalTokens: 0,
        queryTokens: 0,
      };
    }
  }

  async getConversationMemory(
    conversationId: string,
    allMessages: ChatMessage[]
  ): Promise<ConversationMemory> {
    const recentMessages = allMessages.slice(-this.config.maxRecentMessages);

    let rollingSummary: string | null = null;
    let keyTopics: string[] = [];
    let tradingContext: Record<string, unknown> | null = null;
    let summaryTokens = 0;

    if (this.config.enableSummarization) {
      const existingSummary = await storage.getConversationSummary(conversationId);

      if (existingSummary) {
        rollingSummary = existingSummary.summary;
        keyTopics = existingSummary.keyTopics || [];
        tradingContext = existingSummary.tradingContext as Record<string, unknown> | null;
        summaryTokens = existingSummary.tokenCount || 0;
      }

      if (allMessages.length >= this.config.summaryThreshold && !existingSummary) {
        const messagesToSummarize = allMessages.slice(0, -this.config.maxRecentMessages);
        if (messagesToSummarize.length > 0) {
          const summary = await this.generateSummary(messagesToSummarize);
          rollingSummary = summary.text;
          keyTopics = summary.topics;
          summaryTokens = summary.tokenCount;

          await storage.createConversationSummary({
            conversationId,
            userId: null,
            summary: rollingSummary,
            keyTopics,
            tradingContext: null,
            messageRangeStart: 0,
            messageRangeEnd: messagesToSummarize.length,
            tokenCount: summaryTokens,
          });
        }
      }
    }

    return {
      summaryTokens,
      recentMessages,
      rollingSummary,
      keyTopics,
      tradingContext,
    };
  }

  private async generateSummary(messages: ChatMessage[]): Promise<{
    text: string;
    topics: string[];
    tokenCount: number;
  }> {
    const tradingTopics = this.extractTradingTopics(messages);

    const summaryText = `Conversation summary: User discussed ${tradingTopics.join(", ") || "general topics"}. ` +
      `Key points covered over ${messages.length} messages.`;

    return {
      text: summaryText,
      topics: tradingTopics,
      tokenCount: Math.ceil(summaryText.length / 4),
    };
  }

  private extractTradingTopics(messages: ChatMessage[]): string[] {
    const topics = new Set<string>();
    const patterns = {
      symbols: /\b([A-Z]{1,5})\b/g,
      buyIntents: /\b(buy|purchase|acquire|add)\b/gi,
      sellIntents: /\b(sell|exit|close|reduce)\b/gi,
      analysisTypes: /\b(technical|fundamental|options|earnings|chart)\b/gi,
    };

    for (const msg of messages) {
      const content = msg.content;

      const symbols = content.match(patterns.symbols) || [];
      symbols.forEach((s) => {
        if (["SPY", "AAPL", "TSLA", "NVDA", "MSFT", "AMZN", "META", "GOOGL", "AMD", "QQQ"].includes(s)) {
          topics.add(s);
        }
      });

      if (patterns.buyIntents.test(content)) topics.add("buying");
      if (patterns.sellIntents.test(content)) topics.add("selling");
      if (patterns.analysisTypes.test(content)) {
        const matches = content.match(patterns.analysisTypes) || [];
        matches.forEach((m) => topics.add(m.toLowerCase() + " analysis"));
      }
    }

    return Array.from(topics).slice(0, 10);
  }

  async prepareContext(
    query: string,
    conversationId: string,
    messages: ChatMessage[],
    options: {
      userId?: string;
      portfolio?: PortfolioContext;
      market?: MarketContext;
      categories?: string[];
    } = {}
  ): Promise<ContextInjectionResult> {
    const [ragContext, memory] = await Promise.all([
      this.getRAGContext(query, options.categories),
      this.getConversationMemory(conversationId, messages),
    ]);

    const ragTokens = ragContext.totalTokens;
    const memoryTokens = memory.summaryTokens + (memory.recentMessages.length * 50);
    const totalTokens = ragTokens + memoryTokens;

    const budgetUsed = totalTokens / this.config.maxContextTokens;

    return {
      ragContext,
      memory,
      totalTokens,
      budgetUsed,
    };
  }

  buildEnhancedSystemPrompt(
    basePrompt: string,
    context: ContextInjectionResult
  ): string {
    let enhancedPrompt = basePrompt;

    if (context.ragContext.documents.length > 0) {
      const ragSection = context.ragContext.documents
        .map((doc: RAGChunk) => `[${doc.category}] ${doc.content}`)
        .join("\n\n");

      enhancedPrompt += `\n\n## KNOWLEDGE BASE CONTEXT\nThe following verified information is relevant to this conversation:\n\n${ragSection}`;
    }

    if (context.memory.rollingSummary) {
      enhancedPrompt += `\n\n## CONVERSATION HISTORY SUMMARY\n${context.memory.rollingSummary}`;

      if (context.memory.keyTopics.length > 0) {
        enhancedPrompt += `\nKey topics discussed: ${context.memory.keyTopics.join(", ")}`;
      }
    }

    return enhancedPrompt;
  }

  async updateSummary(
    conversationId: string,
    messages: ChatMessage[],
    userId?: string
  ): Promise<void> {
    if (!this.config.enableSummarization) return;
    if (messages.length < this.config.summaryThreshold) return;

    const existing = await storage.getConversationSummary(conversationId);
    const lastSummarizedIndex = existing?.messageRangeEnd || 0;

    const messagesToAdd = messages.slice(lastSummarizedIndex, -this.config.maxRecentMessages);
    if (messagesToAdd.length < 5) return;

    const newSummary = await this.generateSummary(messagesToAdd);

    const combinedSummary = existing?.summary
      ? `${existing.summary}\n\nUpdate: ${newSummary.text}`
      : newSummary.text;

    const combinedTopics = [
      ...(existing?.keyTopics || []),
      ...newSummary.topics,
    ].filter((v, i, a) => a.indexOf(v) === i).slice(0, 15);

    if (existing) {
      await storage.updateConversationSummary(conversationId, {
        summary: combinedSummary,
        keyTopics: combinedTopics,
        messageRangeEnd: messages.length - this.config.maxRecentMessages,
        tokenCount: Math.ceil(combinedSummary.length / 4),
      });
    } else {
      await storage.createConversationSummary({
        conversationId,
        userId: userId || null,
        summary: combinedSummary,
        keyTopics: combinedTopics,
        tradingContext: null,
        messageRangeStart: 0,
        messageRangeEnd: messages.length - this.config.maxRecentMessages,
        tokenCount: Math.ceil(combinedSummary.length / 4),
      });
    }
  }

  async cleanupExpiredCache(): Promise<number> {
    return await storage.deleteExpiredAiCache();
  }

  getConfig(): PipelineConfig {
    return { ...this.config };
  }

  updateConfig(updates: Partial<PipelineConfig>): void {
    this.config = { ...this.config, ...updates };
  }
}

export const contextPipeline = new AIContextPipeline();

export function isMarketSensitiveQuery(query: string): boolean {
  const marketPatterns = [
    /\b(price|quote|current|live|real.?time)\b/i,
    /\b(buy|sell|trade|execute|order)\b/i,
    /\b(today|now|currently|at the moment)\b/i,
    /\$([\d,]+\.?\d*)/,
    /\b(SPY|QQQ|VIX|DIA|IWM)\b/,
    /\b(market|trading|session)\s+(open|close|hours)/i,
  ];

  return marketPatterns.some((p) => p.test(query));
}

export function extractQuerySymbols(query: string): string[] {
  const symbolPattern = /\b([A-Z]{1,5})\b/g;
  const knownSymbols = new Set([
    "AAPL", "TSLA", "NVDA", "MSFT", "AMZN", "META", "GOOGL", "GOOG",
    "AMD", "INTC", "SPY", "QQQ", "IWM", "DIA", "VIX", "NFLX",
    "COIN", "PLTR", "SNOW", "UBER", "SHOP", "SQ", "PYPL",
    "JPM", "BAC", "GS", "MS", "WFC", "C", "V", "MA",
    "XOM", "CVX", "COP", "OXY", "SLB",
    "JNJ", "PFE", "UNH", "MRK", "ABBV", "LLY",
  ]);

  const matches = query.match(symbolPattern) || [];
  return matches.filter((s) => knownSymbols.has(s));
}
