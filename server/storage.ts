import {
  type Strategy,
  type InsertStrategy,
  type OptionsLeg,
  type InsertOptionsLeg,
  type WatchlistItem,
  type InsertWatchlistItem,
  type StrategyRun,
  type InsertStrategyRun,
  type KnowledgeBase,
  type InsertKnowledgeBase,
  type Trade,
  type InsertTrade,
  type PsychologyEntry,
  type InsertPsychologyEntry,
  type Conversation,
  type InsertConversation,
  type Message,
  type InsertMessage,
  type MarketSnapshot,
  type InsertMarketSnapshot,
  type AiPrediction,
  type InsertAiPrediction,
  type PriceAlert,
  type InsertPriceAlert,
  notifications,
  type Notification,
  type InsertNotification,
  type AiRecommendation,
  type InsertAiRecommendation,
  type User,
  type UpsertUser,
  type AiCache,
  type InsertAiCache,
  type ConversationSummary,
  type InsertConversationSummary,
  type AiStrategyRecommendation,
  type InsertAiStrategyRecommendation,
  type ConfirmationToken,
  type OptionPosition,
  type InsertOptionPosition,
  type MarketDataAuditLog,
  type InsertMarketDataAuditLog,
  strategies,
  optionsLegs,
  watchlist,
  strategyRuns,
  knowledgeBase,
  trades,
  psychologyEntries,
  conversations,
  messages,
  marketSnapshots,
  aiPredictions,
  priceAlerts,
  aiRecommendations,
  users,
  aiCache,
  conversationSummaries,
  aiStrategyRecommendations,
  confirmationTokens,
  optionPositions,
  marketDataAuditLog,
} from "@shared/schema";
import { randomUUID } from "crypto";
import { db } from "./db";
import { eq, and, desc, gte, lt, or, sql, inArray } from "drizzle-orm";

export interface IStorage {
  // Users (for authentication)
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  createUser(user: UpsertUser): Promise<User>;
  updateUser(id: string, data: Partial<UpsertUser>): Promise<User | undefined>;

  // Strategies (user-scoped)
  getStrategy(id: string): Promise<Strategy | undefined>;
  getStrategiesForUser(userId: string): Promise<Strategy[]>;
  createStrategy(strategy: InsertStrategy): Promise<Strategy>;
  updateStrategy(id: string, data: Partial<InsertStrategy>): Promise<Strategy | undefined>;
  deleteStrategy(id: string): Promise<void>;

  // Strategy Runs (live auto-trade engine)
  createStrategyRun(run: InsertStrategyRun): Promise<StrategyRun>;
  getStrategyRunsForUser(userId: string): Promise<StrategyRun[]>;
  getStrategyRun(id: string): Promise<StrategyRun | undefined>;
  updateStrategyRun(id: string, patch: Partial<InsertStrategyRun>): Promise<StrategyRun | undefined>;
  // Atomic compare-and-set: only transitions the run when its status still equals
  // `fromStatus`. Returns the updated run on success, or undefined if another
  // path already moved it. Used to claim an exclusive lock before placing a live
  // broker order so concurrent paths (tick vs. user stop) can't double-order.
  tryTransitionStrategyRun(
    id: string,
    fromStatus: string,
    patch: Partial<InsertStrategyRun>,
  ): Promise<StrategyRun | undefined>;
  getActiveStrategyRuns(): Promise<StrategyRun[]>;

  // Options Legs
  getLegsForStrategy(strategyId: string): Promise<OptionsLeg[]>;
  createOptionsLeg(leg: InsertOptionsLeg): Promise<OptionsLeg>;
  deleteLegsForStrategy(strategyId: string): Promise<void>;

  // Watchlist (user-scoped)
  getWatchlistForUser(userId: string): Promise<WatchlistItem[]>;
  getWatchlistItem(id: string): Promise<WatchlistItem | undefined>;
  addToWatchlist(item: InsertWatchlistItem): Promise<WatchlistItem>;
  updateWatchlistItem(id: string, data: Partial<InsertWatchlistItem>): Promise<WatchlistItem | undefined>;
  removeFromWatchlist(id: string): Promise<void>;
  findWatchlistBySymbolForUser(userId: string, symbol: string): Promise<WatchlistItem | undefined>;
  findWatchlistBySymbol(symbol: string): Promise<WatchlistItem | undefined>;

  // Knowledge Base
  getKnowledgeDocument(documentId: string): Promise<KnowledgeBase | undefined>;
  getAllKnowledgeDocuments(): Promise<KnowledgeBase[]>;
  createKnowledgeDocument(doc: InsertKnowledgeBase): Promise<KnowledgeBase>;
  deleteKnowledgeDocument(documentId: string): Promise<void>;

  // Trade Journal (user-scoped)
  getTrade(id: string): Promise<Trade | undefined>;
  getTradesForUser(userId: string): Promise<Trade[]>;
  createTrade(trade: InsertTrade): Promise<Trade>;
  updateTrade(id: string, trade: Partial<InsertTrade>): Promise<Trade | undefined>;
  deleteTrade(id: string): Promise<void>;

  // Psychology Tracker (user-scoped)
  createPsychologyEntry(entry: InsertPsychologyEntry): Promise<PsychologyEntry>;
  getPsychologyEntriesForUser(userId: string): Promise<PsychologyEntry[]>;

  // Conversations (user-scoped)
  getConversation(id: string): Promise<Conversation | undefined>;
  getConversationsForUser(userId: string): Promise<Conversation[]>;
  createConversation(conversation: InsertConversation): Promise<Conversation>;
  updateConversation(id: string, data: Partial<InsertConversation>): Promise<Conversation | undefined>;
  deleteConversation(id: string): Promise<void>;

  // Messages
  getMessage(id: string): Promise<Message | undefined>;
  getMessagesForConversation(conversationId: string, limit?: number, offset?: number): Promise<Message[]>;
  getMessageCountForConversation(conversationId: string): Promise<number>;
  getConversationsWithMessageCount(userId: string, limit?: number, offset?: number): Promise<Array<Conversation & { messageCount: number }>>;
  createMessage(message: InsertMessage): Promise<Message>;
  updateMessage(id: string, data: Partial<InsertMessage>): Promise<Message | undefined>;
  deleteMessagesForConversation(conversationId: string): Promise<void>;

  // Market Snapshots
  getRecentSnapshots(symbol: string, limit: number): Promise<MarketSnapshot[]>;
  createMarketSnapshot(snapshot: InsertMarketSnapshot): Promise<MarketSnapshot>;

  // AI Predictions
  getAiPrediction(id: string): Promise<AiPrediction | undefined>;
  getAiPredictionsForSymbol(symbol: string, limit?: number): Promise<AiPrediction[]>;
  getRecentAiPredictions(limit?: number): Promise<AiPrediction[]>;
  createAiPrediction(prediction: InsertAiPrediction): Promise<AiPrediction>;

  // Price Alerts (user-scoped)
  getPriceAlert(id: string): Promise<PriceAlert | undefined>;
  getPriceAlertsForUser(userId: string): Promise<PriceAlert[]>;
  getActivePriceAlertsForUser(userId: string): Promise<PriceAlert[]>;
  getActivePriceAlerts(): Promise<PriceAlert[]>;
  getPriceAlertsForSymbol(symbol: string): Promise<PriceAlert[]>;
  createPriceAlert(alert: InsertPriceAlert): Promise<PriceAlert>;
  updatePriceAlert(id: string, data: Partial<InsertPriceAlert>): Promise<PriceAlert | undefined>;
  triggerPriceAlert(id: string, triggeredPrice: number, aiInsight?: string): Promise<PriceAlert | undefined>;
  deletePriceAlert(id: string): Promise<void>;

  // Notifications (unified feed, user-scoped). createNotification dedupes on
  // (userId, dedupeKey) and returns undefined when the event already exists.
  createNotification(notification: InsertNotification): Promise<Notification | undefined>;
  getNotificationsForUser(userId: string, limit?: number): Promise<Notification[]>;
  markNotificationRead(id: string, userId: string): Promise<Notification | undefined>;
  markAllNotificationsRead(userId: string): Promise<number>;

  // AI Recommendations (user-scoped, audit trail)
  getAiRecommendation(id: string): Promise<AiRecommendation | undefined>;
  getAiRecommendationsForUser(userId: string, limit?: number): Promise<AiRecommendation[]>;
  createAiRecommendation(recommendation: InsertAiRecommendation): Promise<AiRecommendation>;
  updateAiRecommendation(id: string, data: Partial<InsertAiRecommendation>): Promise<AiRecommendation | undefined>;

  // AI Cache (multi-tier response caching)
  getAiCache(cacheKey: string): Promise<AiCache | undefined>;
  setAiCache(cache: InsertAiCache): Promise<AiCache>;
  updateAiCacheHit(cacheKey: string): Promise<void>;
  deleteExpiredAiCache(): Promise<number>;
  invalidateAiCacheByType(cacheType: string): Promise<void>;

  // Conversation Summaries (memory optimization)
  getConversationSummary(conversationId: string): Promise<ConversationSummary | undefined>;
  createConversationSummary(summary: InsertConversationSummary): Promise<ConversationSummary>;
  updateConversationSummary(conversationId: string, data: Partial<InsertConversationSummary>): Promise<ConversationSummary | undefined>;

  // Knowledge Base with Embeddings (RAG)
  updateKnowledgeDocumentEmbedding(documentId: string, embedding: number[], model: string, tokenCount: number): Promise<KnowledgeBase | undefined>;
  getKnowledgeDocumentsByCategory(category: string): Promise<KnowledgeBase[]>;
  getKnowledgeDocumentsWithEmbeddings(): Promise<KnowledgeBase[]>;

  // AI Strategy Recommendations (market-driven trading suggestions)
  getAiStrategyRecommendation(id: string): Promise<AiStrategyRecommendation | undefined>;
  getAiStrategyRecommendationsForUser(userId: string | null, limit?: number): Promise<AiStrategyRecommendation[]>;
  getActiveAiStrategyRecommendations(userId: string | null): Promise<AiStrategyRecommendation[]>;
  createAiStrategyRecommendation(recommendation: InsertAiStrategyRecommendation): Promise<AiStrategyRecommendation>;
  updateAiStrategyRecommendationStatus(id: string, status: string, userAction?: string, executedTradeId?: string): Promise<AiStrategyRecommendation | undefined>;
  expireOldAiStrategyRecommendations(): Promise<number>;

  // Confirmation Tokens (order confirmation persistence)
  createConfirmationToken(token: string, orderId: string, expiresAt: Date): Promise<ConfirmationToken>;
  getConfirmationToken(token: string): Promise<ConfirmationToken | undefined>;
  deleteConfirmationToken(token: string): Promise<void>;
  cleanupExpiredTokens(): Promise<number>;

  // Option Positions (user-scoped tracked positions)
  getOptionPosition(id: string): Promise<OptionPosition | undefined>;
  getOptionPositionsForUser(userId: string): Promise<OptionPosition[]>;
  getActiveOptionPositionsForUser(userId: string): Promise<OptionPosition[]>;
  getOptionPositionBySymbol(userId: string, optionSymbol: string): Promise<OptionPosition | undefined>;
  createOptionPosition(position: InsertOptionPosition): Promise<OptionPosition>;
  updateOptionPosition(id: string, data: Partial<InsertOptionPosition>): Promise<OptionPosition | undefined>;
  closeOptionPosition(id: string): Promise<OptionPosition | undefined>;
  deleteOptionPosition(id: string): Promise<void>;

  // Market Data Audit Log (provider & cache event tracking)
  insertMarketAuditLog(entry: InsertMarketDataAuditLog): Promise<MarketDataAuditLog>;
  queryMarketAuditLogs(filters: {
    symbol?: string;
    provider?: string;
    eventType?: string;
    from?: Date;
    to?: Date;
    limit?: number;
    offset?: number;
  }): Promise<{ entries: MarketDataAuditLog[]; total: number }>;
}

export class MemStorage implements IStorage {
  private strategies: Map<string, Strategy>;
  private optionsLegs: Map<string, OptionsLeg>;
  private watchlist: Map<string, WatchlistItem>;
  private knowledgeBase: Map<string, KnowledgeBase>;
  private trades: Map<string, Trade>;
  private psychologyEntriesMap: Map<string, PsychologyEntry>;
  private conversationsMap: Map<string, Conversation>;
  private messagesMap: Map<string, Message>;
  private marketSnapshotsMap: Map<string, MarketSnapshot>;
  private usersMap: Map<string, User>;
  private aiCacheMap: Map<string, AiCache>;
  private conversationSummariesMap: Map<string, ConversationSummary>;
  private optionPositionsMap: Map<string, OptionPosition>;
  private strategyRunsMap: Map<string, StrategyRun>;

  constructor() {
    this.strategies = new Map();
    this.optionsLegs = new Map();
    this.watchlist = new Map();
    this.knowledgeBase = new Map();
    this.trades = new Map();
    this.psychologyEntriesMap = new Map();
    this.conversationsMap = new Map();
    this.messagesMap = new Map();
    this.marketSnapshotsMap = new Map();
    this.usersMap = new Map();
    this.aiCacheMap = new Map();
    this.conversationSummariesMap = new Map();
    this.optionPositionsMap = new Map();
    this.strategyRunsMap = new Map();
  }

  // Users (for authentication - stub for MemStorage)
  async getUser(id: string): Promise<User | undefined> {
    return this.usersMap.get(id);
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    return Array.from(this.usersMap.values()).find(
      (user) => user.email?.toLowerCase() === email.toLowerCase()
    );
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const existing = this.usersMap.get(userData.id!);
    const user: User = {
      id: userData.id!,
      email: userData.email ?? null,
      passwordHash: userData.passwordHash ?? existing?.passwordHash ?? null,
      firstName: userData.firstName ?? null,
      lastName: userData.lastName ?? null,
      profileImageUrl: userData.profileImageUrl ?? null,
      onboardingCompleted: userData.onboardingCompleted ?? existing?.onboardingCompleted ?? false,
      createdAt: existing?.createdAt ?? new Date(),
      updatedAt: new Date(),
    };
    this.usersMap.set(user.id, user);
    return user;
  }

  async createUser(userData: UpsertUser): Promise<User> {
    const id = userData.id ?? randomUUID();
    const user: User = {
      id,
      email: userData.email ?? null,
      passwordHash: userData.passwordHash ?? null,
      firstName: userData.firstName ?? null,
      lastName: userData.lastName ?? null,
      profileImageUrl: userData.profileImageUrl ?? null,
      onboardingCompleted: userData.onboardingCompleted ?? false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.usersMap.set(id, user);
    return user;
  }

  async updateUser(id: string, data: Partial<UpsertUser>): Promise<User | undefined> {
    const existing = this.usersMap.get(id);
    if (!existing) return undefined;
    const updated: User = { ...existing, ...data, updatedAt: new Date() };
    this.usersMap.set(id, updated);
    return updated;
  }

  // Strategies
  async getStrategy(id: string): Promise<Strategy | undefined> {
    return this.strategies.get(id);
  }

  async getStrategiesForUser(userId: string): Promise<Strategy[]> {
    return Array.from(this.strategies.values()).filter(
      (strategy) => strategy.userId === userId
    );
  }

  async createStrategy(insertStrategy: InsertStrategy): Promise<Strategy> {
    const id = randomUUID();
    const strategy: Strategy = {
      ...insertStrategy,
      description: insertStrategy.description ?? null,
      stopLossPercent: insertStrategy.stopLossPercent ?? null,
      profitTargetPercent: insertStrategy.profitTargetPercent ?? null,
      timeStopMinutes: insertStrategy.timeStopMinutes ?? null,
      useTrailingStop: insertStrategy.useTrailingStop ?? null,
      status: insertStrategy.status ?? "draft",
      activatedAt: insertStrategy.activatedAt ?? null,
      linkedPositions: insertStrategy.linkedPositions ?? [],
      id,
      createdAt: new Date(),
    };
    this.strategies.set(id, strategy);
    return strategy;
  }

  async updateStrategy(id: string, data: Partial<InsertStrategy>): Promise<Strategy | undefined> {
    const existing = this.strategies.get(id);
    if (!existing) {
      return undefined;
    }
    const updated: Strategy = { ...existing, ...data };
    this.strategies.set(id, updated);
    return updated;
  }

  // Strategy Runs
  async createStrategyRun(insert: InsertStrategyRun): Promise<StrategyRun> {
    const id = randomUUID();
    const run: StrategyRun = {
      id,
      userId: insert.userId,
      agentSessionId: insert.agentSessionId ?? null,
      templateId: insert.templateId,
      templateName: insert.templateName,
      symbol: insert.symbol,
      direction: insert.direction,
      assetMode: insert.assetMode ?? "equity",
      mode: insert.mode ?? "paper",
      quantity: insert.quantity,
      entryTriggerType: insert.entryTriggerType,
      entryThresholdPct: insert.entryThresholdPct ?? null,
      stopLossPercent: insert.stopLossPercent,
      profitTargetPercent: insert.profitTargetPercent,
      timeStopMinutes: insert.timeStopMinutes ?? null,
      useTrailingStop: insert.useTrailingStop ?? false,
      trailingStopPercent: insert.trailingStopPercent ?? null,
      referencePrice: insert.referencePrice ?? null,
      entryPrice: insert.entryPrice ?? null,
      peakPrice: insert.peakPrice ?? null,
      currentPrice: insert.currentPrice ?? null,
      pnlPercent: insert.pnlPercent ?? null,
      status: insert.status ?? "watching",
      exitReason: insert.exitReason ?? null,
      entryOrderId: insert.entryOrderId ?? null,
      exitOrderId: insert.exitOrderId ?? null,
      lastMessage: insert.lastMessage ?? null,
      createdAt: new Date(),
      enteredAt: insert.enteredAt ?? null,
      closedAt: insert.closedAt ?? null,
      lastCheckedAt: insert.lastCheckedAt ?? null,
    };
    this.strategyRunsMap.set(id, run);
    return run;
  }

  async getStrategyRunsForUser(userId: string): Promise<StrategyRun[]> {
    return Array.from(this.strategyRunsMap.values())
      .filter((r) => r.userId === userId)
      .sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0));
  }

  async getStrategyRun(id: string): Promise<StrategyRun | undefined> {
    return this.strategyRunsMap.get(id);
  }

  async updateStrategyRun(
    id: string,
    patch: Partial<InsertStrategyRun>,
  ): Promise<StrategyRun | undefined> {
    const existing = this.strategyRunsMap.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...patch } as StrategyRun;
    this.strategyRunsMap.set(id, updated);
    return updated;
  }

  async tryTransitionStrategyRun(
    id: string,
    fromStatus: string,
    patch: Partial<InsertStrategyRun>,
  ): Promise<StrategyRun | undefined> {
    // Single-threaded JS: this read-check-write runs without interleaving, so it
    // is atomic by construction (mirrors the DB conditional UPDATE).
    const existing = this.strategyRunsMap.get(id);
    if (!existing || existing.status !== fromStatus) return undefined;
    const updated = { ...existing, ...patch } as StrategyRun;
    this.strategyRunsMap.set(id, updated);
    return updated;
  }

  async getActiveStrategyRuns(): Promise<StrategyRun[]> {
    const active = new Set(["watching", "entering", "in_position", "exiting"]);
    return Array.from(this.strategyRunsMap.values()).filter((r) => active.has(r.status));
  }
  async deleteStrategy(id: string): Promise<void> {
    this.strategies.delete(id);
    await this.deleteLegsForStrategy(id);
  }

  // Options Legs
  async getLegsForStrategy(strategyId: string): Promise<OptionsLeg[]> {
    return Array.from(this.optionsLegs.values()).filter(
      (leg) => leg.strategyId === strategyId
    );
  }

  async createOptionsLeg(insertLeg: InsertOptionsLeg): Promise<OptionsLeg> {
    const id = randomUUID();
    const leg: OptionsLeg = { ...insertLeg, id };
    this.optionsLegs.set(id, leg);
    return leg;
  }

  async deleteLegsForStrategy(strategyId: string): Promise<void> {
    const legs = await this.getLegsForStrategy(strategyId);
    for (const leg of legs) {
      this.optionsLegs.delete(leg.id);
    }
  }

  // Watchlist
  async getWatchlistItem(id: string): Promise<WatchlistItem | undefined> {
    return this.watchlist.get(id);
  }

  async addToWatchlist(
    insertItem: InsertWatchlistItem
  ): Promise<WatchlistItem> {
    const id = randomUUID();
    const item: WatchlistItem = {
      ...insertItem,
      id,
      addedAt: new Date(),
    };
    this.watchlist.set(id, item);
    return item;
  }

  async updateWatchlistItem(id: string, data: Partial<InsertWatchlistItem>): Promise<WatchlistItem | undefined> {
    const item = this.watchlist.get(id);
    if (!item) {
      return undefined;
    }
    const updated = { ...item, ...data };
    this.watchlist.set(id, updated);
    return updated;
  }

  async removeFromWatchlist(id: string): Promise<void> {
    this.watchlist.delete(id);
  }

  async findWatchlistBySymbol(symbol: string): Promise<WatchlistItem | undefined> {
    return Array.from(this.watchlist.values()).find(
      (item) => item.symbol === symbol
    );
  }

  async getWatchlistForUser(userId: string): Promise<WatchlistItem[]> {
    return Array.from(this.watchlist.values()).filter(
      (item) => item.userId === userId
    );
  }

  async findWatchlistBySymbolForUser(userId: string, symbol: string): Promise<WatchlistItem | undefined> {
    return Array.from(this.watchlist.values()).find(
      (item) => item.userId === userId && item.symbol === symbol
    );
  }

  // Knowledge Base
  async getKnowledgeDocument(documentId: string): Promise<KnowledgeBase | undefined> {
    return Array.from(this.knowledgeBase.values()).find(
      (doc) => doc.documentId === documentId
    );
  }

  async getAllKnowledgeDocuments(): Promise<KnowledgeBase[]> {
    return Array.from(this.knowledgeBase.values());
  }

  async createKnowledgeDocument(insertDoc: InsertKnowledgeBase): Promise<KnowledgeBase> {
    const id = randomUUID();
    const doc: KnowledgeBase = {
      ...insertDoc,
      sourceAuthor: insertDoc.sourceAuthor ?? null,
      embedding: insertDoc.embedding ?? null,
      embeddingModel: insertDoc.embeddingModel ?? null,
      chunkIndex: insertDoc.chunkIndex ?? 0,
      tokenCount: insertDoc.tokenCount ?? null,
      id,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.knowledgeBase.set(id, doc);
    return doc;
  }

  async deleteKnowledgeDocument(documentId: string): Promise<void> {
    const doc = await this.getKnowledgeDocument(documentId);
    if (doc) {
      this.knowledgeBase.delete(doc.id);
    }
  }

  // Trade Journal
  async getTrade(id: string): Promise<Trade | undefined> {
    return this.trades.get(id);
  }

  async getTradesForUser(userId: string): Promise<Trade[]> {
    return Array.from(this.trades.values())
      .filter((trade) => trade.userId === userId)
      .sort((a, b) => {
        const aTime = a.createdAt?.getTime() ?? 0;
        const bTime = b.createdAt?.getTime() ?? 0;
        return bTime - aTime;
      });
  }

  async createTrade(insertTrade: InsertTrade): Promise<Trade> {
    const id = randomUUID();
    const trade: Trade = {
      ...insertTrade,
      strategyId: insertTrade.strategyId ?? null,
      exitDate: insertTrade.exitDate ?? null,
      exitPrice: insertTrade.exitPrice ?? null,
      profitLoss: insertTrade.profitLoss ?? null,
      profitLossPercent: insertTrade.profitLossPercent ?? null,
      emotion: insertTrade.emotion ?? null,
      ruleAdherence: insertTrade.ruleAdherence ?? null,
      notes: insertTrade.notes ?? null,
      mistakes: insertTrade.mistakes ?? null,
      id,
      createdAt: new Date(),
    };
    this.trades.set(id, trade);
    return trade;
  }

  async updateTrade(id: string, partial: Partial<InsertTrade>): Promise<Trade | undefined> {
    const existing = this.trades.get(id);
    if (!existing) {
      return undefined;
    }

    const updated: Trade = {
      ...existing,
      ...partial,
      strategyId: partial.strategyId !== undefined ? (partial.strategyId ?? null) : existing.strategyId,
      exitDate: partial.exitDate !== undefined ? (partial.exitDate ?? null) : existing.exitDate,
      exitPrice: partial.exitPrice !== undefined ? (partial.exitPrice ?? null) : existing.exitPrice,
      profitLoss: partial.profitLoss !== undefined ? (partial.profitLoss ?? null) : existing.profitLoss,
      profitLossPercent: partial.profitLossPercent !== undefined ? (partial.profitLossPercent ?? null) : existing.profitLossPercent,
      emotion: partial.emotion !== undefined ? (partial.emotion ?? null) : existing.emotion,
      ruleAdherence: partial.ruleAdherence !== undefined ? (partial.ruleAdherence ?? null) : existing.ruleAdherence,
      notes: partial.notes !== undefined ? (partial.notes ?? null) : existing.notes,
      mistakes: partial.mistakes !== undefined ? (partial.mistakes ?? null) : existing.mistakes,
    };

    this.trades.set(id, updated);
    return updated;
  }

  async deleteTrade(id: string): Promise<void> {
    this.trades.delete(id);
  }

  // Psychology Tracker
  async createPsychologyEntry(insertEntry: InsertPsychologyEntry): Promise<PsychologyEntry> {
    const id = randomUUID();
    const entry: PsychologyEntry = {
      ...insertEntry,
      emotion: insertEntry.emotion ?? null,
      notes: insertEntry.notes ?? null,
      mistakes: insertEntry.mistakes ?? null,
      id,
      createdAt: new Date(),
    };
    this.psychologyEntriesMap.set(id, entry);
    return entry;
  }

  async getPsychologyEntriesForUser(userId: string): Promise<PsychologyEntry[]> {
    return Array.from(this.psychologyEntriesMap.values())
      .filter((entry) => entry.userId === userId)
      .sort((a, b) => {
        const aTime = a.createdAt?.getTime() ?? 0;
        const bTime = b.createdAt?.getTime() ?? 0;
        return bTime - aTime;
      });
  }

  // Conversations (stubs - use DatabaseStorage for full implementation)
  async getConversation(id: string): Promise<Conversation | undefined> {
    return this.conversationsMap.get(id);
  }

  async getConversationsForUser(userId: string): Promise<Conversation[]> {
    return Array.from(this.conversationsMap.values()).filter(c => c.userId === userId);
  }

  async createConversation(insertConversation: InsertConversation): Promise<Conversation> {
    const id = randomUUID();
    const conversation: Conversation = {
      ...insertConversation,
      userId: insertConversation.userId,
      title: insertConversation.title ?? "New Chat",
      id,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.conversationsMap.set(id, conversation);
    return conversation;
  }

  async updateConversation(id: string, data: Partial<InsertConversation>): Promise<Conversation | undefined> {
    const existing = this.conversationsMap.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...data, updatedAt: new Date() };
    this.conversationsMap.set(id, updated);
    return updated;
  }

  async deleteConversation(id: string): Promise<void> {
    this.conversationsMap.delete(id);
    await this.deleteMessagesForConversation(id);
  }

  // Messages
  async getMessage(id: string): Promise<Message | undefined> {
    return this.messagesMap.get(id);
  }

  async getMessagesForConversation(conversationId: string, limit?: number, offset?: number): Promise<Message[]> {
    let result = Array.from(this.messagesMap.values())
      .filter(m => m.conversationId === conversationId)
      .sort((a, b) => (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0));
    
    if (offset !== undefined) {
      result = result.slice(offset);
    }
    if (limit !== undefined) {
      result = result.slice(0, limit);
    }
    
    return result;
  }

  async getMessageCountForConversation(conversationId: string): Promise<number> {
    return Array.from(this.messagesMap.values()).filter(m => m.conversationId === conversationId).length;
  }

  async getConversationsWithMessageCount(userId: string, limit?: number, offset?: number): Promise<Array<Conversation & { messageCount: number }>> {
    let userConversations = Array.from(this.conversationsMap.values())
      .filter(c => c.userId === userId)
      .sort((a, b) => (b.updatedAt?.getTime() ?? 0) - (a.updatedAt?.getTime() ?? 0));
    
    if (offset !== undefined) {
      userConversations = userConversations.slice(offset);
    }
    if (limit !== undefined) {
      userConversations = userConversations.slice(0, limit);
    }
    
    // Single pass over messages instead of one full scan per conversation.
    const counts = new Map<string, number>();
    for (const m of Array.from(this.messagesMap.values())) {
      counts.set(m.conversationId, (counts.get(m.conversationId) ?? 0) + 1);
    }
    return userConversations.map(conv => ({
      ...conv,
      messageCount: counts.get(conv.id) ?? 0,
    }));
  }

  async createMessage(insertMessage: InsertMessage): Promise<Message> {
    const id = randomUUID();
    const message: Message = {
      ...insertMessage,
      status: insertMessage.status ?? "complete",
      metadata: insertMessage.metadata ?? null,
      id,
      createdAt: new Date(),
    };
    this.messagesMap.set(id, message);
    return message;
  }

  async updateMessage(id: string, data: Partial<InsertMessage>): Promise<Message | undefined> {
    const existing = this.messagesMap.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...data };
    this.messagesMap.set(id, updated);
    return updated;
  }

  async deleteMessagesForConversation(conversationId: string): Promise<void> {
    const msgs = await this.getMessagesForConversation(conversationId);
    for (const msg of msgs) {
      this.messagesMap.delete(msg.id);
    }
  }

  // Market Snapshots
  async getRecentSnapshots(symbol: string, limit: number): Promise<MarketSnapshot[]> {
    return Array.from(this.marketSnapshotsMap.values())
      .filter(s => s.symbol === symbol)
      .sort((a, b) => (b.timestamp?.getTime() ?? 0) - (a.timestamp?.getTime() ?? 0))
      .slice(0, limit);
  }

  async createMarketSnapshot(insertSnapshot: InsertMarketSnapshot): Promise<MarketSnapshot> {
    const id = randomUUID();
    const snapshot: MarketSnapshot = {
      ...insertSnapshot,
      open: insertSnapshot.open ?? null,
      high: insertSnapshot.high ?? null,
      low: insertSnapshot.low ?? null,
      volume: insertSnapshot.volume ?? null,
      timestamp: insertSnapshot.timestamp ?? new Date(),
      id,
    };
    this.marketSnapshotsMap.set(id, snapshot);
    return snapshot;
  }

  // AI Predictions (in-memory stub)
  private aiPredictionsMap = new Map<string, AiPrediction>();

  async getAiPrediction(id: string): Promise<AiPrediction | undefined> {
    return this.aiPredictionsMap.get(id);
  }

  async getAiPredictionsForSymbol(symbol: string, limit = 50): Promise<AiPrediction[]> {
    return Array.from(this.aiPredictionsMap.values())
      .filter(p => p.symbol === symbol)
      .sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0))
      .slice(0, limit);
  }

  async getRecentAiPredictions(limit = 50): Promise<AiPrediction[]> {
    return Array.from(this.aiPredictionsMap.values())
      .sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0))
      .slice(0, limit);
  }

  async createAiPrediction(insertPrediction: InsertAiPrediction): Promise<AiPrediction> {
    const id = randomUUID();
    const prediction: AiPrediction = {
      ...insertPrediction,
      id,
      technicalSignal: insertPrediction.technicalSignal ?? null,
      sentimentSignal: insertPrediction.sentimentSignal ?? null,
      fundamentalSignal: insertPrediction.fundamentalSignal ?? null,
      marketRegime: insertPrediction.marketRegime ?? null,
      bullBearWinner: insertPrediction.bullBearWinner ?? null,
      priceAtPrediction: insertPrediction.priceAtPrediction ?? null,
      priceAfter1Day: insertPrediction.priceAfter1Day ?? null,
      priceAfter5Days: insertPrediction.priceAfter5Days ?? null,
      wasAccurate: insertPrediction.wasAccurate ?? null,
      analysisData: insertPrediction.analysisData ?? null,
      createdAt: new Date(),
    };
    this.aiPredictionsMap.set(id, prediction);
    return prediction;
  }

  // Price Alerts (in-memory stub)
  private priceAlertsMap = new Map<string, PriceAlert>();

  async getPriceAlert(id: string): Promise<PriceAlert | undefined> {
    return this.priceAlertsMap.get(id);
  }

  async getActivePriceAlerts(): Promise<PriceAlert[]> {
    return Array.from(this.priceAlertsMap.values())
      .filter(a => a.status === "active")
      .sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0));
  }

  async getPriceAlertsForUser(userId: string): Promise<PriceAlert[]> {
    return Array.from(this.priceAlertsMap.values())
      .filter(a => a.userId === userId)
      .sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0));
  }

  async getActivePriceAlertsForUser(userId: string): Promise<PriceAlert[]> {
    return Array.from(this.priceAlertsMap.values())
      .filter(a => a.userId === userId && a.status === "active")
      .sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0));
  }

  async getPriceAlertsForSymbol(symbol: string): Promise<PriceAlert[]> {
    return Array.from(this.priceAlertsMap.values())
      .filter(a => a.symbol === symbol.toUpperCase())
      .sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0));
  }

  async createPriceAlert(insertAlert: InsertPriceAlert): Promise<PriceAlert> {
    const id = randomUUID();
    const alert: PriceAlert = {
      ...insertAlert,
      id,
      symbol: insertAlert.symbol.toUpperCase(),
      status: insertAlert.status ?? "active",
      currentPriceAtCreation: insertAlert.currentPriceAtCreation ?? null,
      triggeredAt: null,
      triggeredPrice: null,
      aiInsight: null,
      note: insertAlert.note ?? null,
      expiresAt: insertAlert.expiresAt ?? null,
      createdAt: new Date(),
    };
    this.priceAlertsMap.set(id, alert);
    return alert;
  }

  async updatePriceAlert(id: string, data: Partial<InsertPriceAlert>): Promise<PriceAlert | undefined> {
    const existing = this.priceAlertsMap.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...data };
    this.priceAlertsMap.set(id, updated);
    return updated;
  }

  async triggerPriceAlert(id: string, triggeredPrice: number, aiInsight?: string): Promise<PriceAlert | undefined> {
    const existing = this.priceAlertsMap.get(id);
    if (!existing) return undefined;
    const updated: PriceAlert = {
      ...existing,
      status: "triggered",
      triggeredAt: new Date(),
      triggeredPrice,
      aiInsight: aiInsight ?? null,
    };
    this.priceAlertsMap.set(id, updated);
    return updated;
  }

  async deletePriceAlert(id: string): Promise<void> {
    this.priceAlertsMap.delete(id);
  }

  // Notifications (in-memory)
  private notificationsMap = new Map<string, Notification>();

  async createNotification(notification: InsertNotification): Promise<Notification | undefined> {
    // Dedupe on (userId, dedupeKey) — mirrors the DB unique index.
    const duplicate = Array.from(this.notificationsMap.values()).some(
      n => n.userId === notification.userId && n.dedupeKey === notification.dedupeKey,
    );
    if (duplicate) return undefined;
    const id = randomUUID();
    const row: Notification = {
      id,
      userId: notification.userId,
      type: notification.type,
      title: notification.title,
      message: notification.message,
      symbol: notification.symbol ?? null,
      relatedId: notification.relatedId ?? null,
      dedupeKey: notification.dedupeKey,
      read: false,
      createdAt: new Date(),
    };
    this.notificationsMap.set(id, row);
    return row;
  }

  async getNotificationsForUser(userId: string, limit = 50): Promise<Notification[]> {
    return Array.from(this.notificationsMap.values())
      .filter(n => n.userId === userId)
      .sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0))
      .slice(0, limit);
  }

  async markNotificationRead(id: string, userId: string): Promise<Notification | undefined> {
    const existing = this.notificationsMap.get(id);
    if (!existing || existing.userId !== userId) return undefined;
    const updated = { ...existing, read: true };
    this.notificationsMap.set(id, updated);
    return updated;
  }

  async markAllNotificationsRead(userId: string): Promise<number> {
    let count = 0;
    Array.from(this.notificationsMap.entries()).forEach(([id, n]) => {
      if (n.userId === userId && !n.read) {
        this.notificationsMap.set(id, { ...n, read: true });
        count++;
      }
    });
    return count;
  }

  // AI Recommendations (in-memory stub)
  private aiRecommendationsMap = new Map<string, AiRecommendation>();

  async getAiRecommendation(id: string): Promise<AiRecommendation | undefined> {
    return this.aiRecommendationsMap.get(id);
  }

  async getAiRecommendationsForUser(userId: string, limit = 50): Promise<AiRecommendation[]> {
    return Array.from(this.aiRecommendationsMap.values())
      .filter(r => r.userId === userId)
      .sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0))
      .slice(0, limit);
  }

  async createAiRecommendation(insertRecommendation: InsertAiRecommendation): Promise<AiRecommendation> {
    const id = randomUUID();
    const recommendation: AiRecommendation = {
      ...insertRecommendation,
      id,
      conversationId: insertRecommendation.conversationId ?? null,
      action: insertRecommendation.action ?? null,
      quantity: insertRecommendation.quantity ?? null,
      price: insertRecommendation.price ?? null,
      confidenceLevel: insertRecommendation.confidenceLevel ?? null,
      reasoning: insertRecommendation.reasoning ?? null,
      chainOfThought: insertRecommendation.chainOfThought ?? null,
      marketDataSnapshot: insertRecommendation.marketDataSnapshot ?? null,
      validationSummary: insertRecommendation.validationSummary ?? null,
      userAction: insertRecommendation.userAction ?? null,
      orderId: insertRecommendation.orderId ?? null,
      createdAt: new Date(),
    };
    this.aiRecommendationsMap.set(id, recommendation);
    return recommendation;
  }

  async updateAiRecommendation(id: string, data: Partial<InsertAiRecommendation>): Promise<AiRecommendation | undefined> {
    const existing = this.aiRecommendationsMap.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...data };
    this.aiRecommendationsMap.set(id, updated);
    return updated;
  }

  // AI Cache (multi-tier response caching)
  async getAiCache(cacheKey: string): Promise<AiCache | undefined> {
    const cached = this.aiCacheMap.get(cacheKey);
    if (cached && new Date() < cached.expiresAt) {
      return cached;
    }
    return undefined;
  }

  async setAiCache(cache: InsertAiCache): Promise<AiCache> {
    const id = randomUUID();
    const entry: AiCache = {
      id,
      cacheKey: cache.cacheKey,
      cacheType: cache.cacheType,
      payload: cache.payload,
      tokenCount: cache.tokenCount ?? null,
      hitCount: 0,
      lastAccessedAt: new Date(),
      expiresAt: cache.expiresAt,
      marketSensitive: cache.marketSensitive ?? false,
      spyPriceAtCache: cache.spyPriceAtCache ?? null,
      createdAt: new Date(),
    };
    this.aiCacheMap.set(cache.cacheKey, entry);
    return entry;
  }

  async updateAiCacheHit(cacheKey: string): Promise<void> {
    const cached = this.aiCacheMap.get(cacheKey);
    if (cached) {
      cached.hitCount = (cached.hitCount ?? 0) + 1;
      cached.lastAccessedAt = new Date();
      this.aiCacheMap.set(cacheKey, cached);
    }
  }

  async deleteExpiredAiCache(): Promise<number> {
    const now = new Date();
    let deleted = 0;
    Array.from(this.aiCacheMap.entries()).forEach(([key, entry]) => {
      if (entry.expiresAt < now) {
        this.aiCacheMap.delete(key);
        deleted++;
      }
    });
    return deleted;
  }

  async invalidateAiCacheByType(cacheType: string): Promise<void> {
    Array.from(this.aiCacheMap.entries()).forEach(([key, entry]) => {
      if (entry.cacheType === cacheType) {
        this.aiCacheMap.delete(key);
      }
    });
  }

  // Conversation Summaries (memory optimization)
  async getConversationSummary(conversationId: string): Promise<ConversationSummary | undefined> {
    return Array.from(this.conversationSummariesMap.values()).find(
      s => s.conversationId === conversationId
    );
  }

  async createConversationSummary(summary: InsertConversationSummary): Promise<ConversationSummary> {
    const id = randomUUID();
    const entry: ConversationSummary = {
      id,
      conversationId: summary.conversationId,
      userId: summary.userId ?? null,
      summary: summary.summary,
      keyTopics: summary.keyTopics ?? null,
      tradingContext: summary.tradingContext ?? null,
      messageRangeStart: summary.messageRangeStart,
      messageRangeEnd: summary.messageRangeEnd,
      tokenCount: summary.tokenCount ?? null,
      createdAt: new Date(),
    };
    this.conversationSummariesMap.set(summary.conversationId, entry);
    return entry;
  }

  async updateConversationSummary(conversationId: string, data: Partial<InsertConversationSummary>): Promise<ConversationSummary | undefined> {
    const existing = await this.getConversationSummary(conversationId);
    if (!existing) return undefined;
    const updated: ConversationSummary = {
      ...existing,
      ...data,
    };
    this.conversationSummariesMap.set(conversationId, updated);
    return updated;
  }

  // Knowledge Base with Embeddings (RAG)
  async updateKnowledgeDocumentEmbedding(
    documentId: string,
    embedding: number[],
    model: string,
    tokenCount: number
  ): Promise<KnowledgeBase | undefined> {
    const doc = await this.getKnowledgeDocument(documentId);
    if (!doc) return undefined;
    const updated: KnowledgeBase = {
      ...doc,
      embedding,
      embeddingModel: model,
      tokenCount,
      updatedAt: new Date(),
    };
    this.knowledgeBase.set(doc.id, updated);
    return updated;
  }

  async getKnowledgeDocumentsByCategory(category: string): Promise<KnowledgeBase[]> {
    return Array.from(this.knowledgeBase.values()).filter(
      doc => doc.category === category
    );
  }

  async getKnowledgeDocumentsWithEmbeddings(): Promise<KnowledgeBase[]> {
    return Array.from(this.knowledgeBase.values()).filter(
      doc => doc.embedding !== null && doc.embedding !== undefined
    );
  }

  // AI Strategy Recommendations (stubs for MemStorage)
  private aiStrategyRecsMap: Map<string, AiStrategyRecommendation> = new Map();

  async getAiStrategyRecommendation(id: string): Promise<AiStrategyRecommendation | undefined> {
    return this.aiStrategyRecsMap.get(id);
  }

  async getAiStrategyRecommendationsForUser(userId: string | null, limit = 50): Promise<AiStrategyRecommendation[]> {
    const recs = Array.from(this.aiStrategyRecsMap.values())
      .filter(r => r.userId === userId)
      .sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0));
    return recs.slice(0, limit);
  }

  async getActiveAiStrategyRecommendations(userId: string | null): Promise<AiStrategyRecommendation[]> {
    return Array.from(this.aiStrategyRecsMap.values())
      .filter(r => r.userId === userId && r.status === 'active')
      .sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0));
  }

  async createAiStrategyRecommendation(recommendation: InsertAiStrategyRecommendation): Promise<AiStrategyRecommendation> {
    const entry: AiStrategyRecommendation = {
      id: randomUUID(),
      userId: recommendation.userId ?? null,
      title: recommendation.title,
      thesis: recommendation.thesis,
      strategyType: recommendation.strategyType,
      riskProfile: recommendation.riskProfile,
      primarySymbol: recommendation.primarySymbol,
      relatedSymbols: recommendation.relatedSymbols ?? null,
      action: recommendation.action,
      direction: recommendation.direction,
      timeHorizon: recommendation.timeHorizon,
      legs: recommendation.legs ?? null,
      suggestedQuantity: recommendation.suggestedQuantity ?? null,
      suggestedEntryPrice: recommendation.suggestedEntryPrice ?? null,
      stopLossPrice: recommendation.stopLossPrice ?? null,
      stopLossPercent: recommendation.stopLossPercent ?? null,
      profitTargetPrice: recommendation.profitTargetPrice ?? null,
      profitTargetPercent: recommendation.profitTargetPercent ?? null,
      maxRisk: recommendation.maxRisk ?? null,
      riskRewardRatio: recommendation.riskRewardRatio ?? null,
      confidenceScore: recommendation.confidenceScore,
      technicalSignal: recommendation.technicalSignal ?? null,
      sentimentSignal: recommendation.sentimentSignal ?? null,
      fundamentalSignal: recommendation.fundamentalSignal ?? null,
      reasoning: recommendation.reasoning,
      keyFactors: recommendation.keyFactors ?? null,
      newsReferences: recommendation.newsReferences ?? null,
      marketSnapshot: recommendation.marketSnapshot,
      status: recommendation.status ?? 'active',
      expiresAt: recommendation.expiresAt ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
      userAction: null,
      userActionAt: null,
      executedTradeId: null,
    };
    this.aiStrategyRecsMap.set(entry.id, entry);
    return entry;
  }

  async updateAiStrategyRecommendationStatus(
    id: string,
    status: string,
    userAction?: string,
    executedTradeId?: string
  ): Promise<AiStrategyRecommendation | undefined> {
    const rec = this.aiStrategyRecsMap.get(id);
    if (!rec) return undefined;
    const updated: AiStrategyRecommendation = {
      ...rec,
      status,
      userAction: userAction ?? rec.userAction,
      userActionAt: userAction ? new Date() : rec.userActionAt,
      executedTradeId: executedTradeId ?? rec.executedTradeId,
      updatedAt: new Date(),
    };
    this.aiStrategyRecsMap.set(id, updated);
    return updated;
  }

  async expireOldAiStrategyRecommendations(): Promise<number> {
    const now = new Date();
    let count = 0;
    const entries = Array.from(this.aiStrategyRecsMap.entries());
    for (const [id, rec] of entries) {
      if (rec.status === 'active' && rec.expiresAt && rec.expiresAt < now) {
        this.aiStrategyRecsMap.set(id, { ...rec, status: 'expired', updatedAt: now });
        count++;
      }
    }
    return count;
  }

  // Confirmation Tokens (stub implementation for MemStorage - not used in production)
  private confirmationTokensMap = new Map<string, ConfirmationToken>();

  async createConfirmationToken(token: string, orderId: string, expiresAt: Date): Promise<ConfirmationToken> {
    const entry: ConfirmationToken = {
      id: randomUUID(),
      token,
      orderId,
      expiresAt,
      createdAt: new Date(),
    };
    this.confirmationTokensMap.set(token, entry);
    return entry;
  }

  async getConfirmationToken(token: string): Promise<ConfirmationToken | undefined> {
    return this.confirmationTokensMap.get(token);
  }

  async deleteConfirmationToken(token: string): Promise<void> {
    this.confirmationTokensMap.delete(token);
  }

  async cleanupExpiredTokens(): Promise<number> {
    const now = new Date();
    let count = 0;
    const entries = Array.from(this.confirmationTokensMap.entries());
    for (const [key, entry] of entries) {
      if (entry.expiresAt < now) {
        this.confirmationTokensMap.delete(key);
        count++;
      }
    }
    return count;
  }

  // Option Positions (user-scoped tracked positions)
  async getOptionPosition(id: string): Promise<OptionPosition | undefined> {
    return this.optionPositionsMap.get(id);
  }

  async getOptionPositionsForUser(userId: string): Promise<OptionPosition[]> {
    return Array.from(this.optionPositionsMap.values()).filter(p => p.userId === userId);
  }

  async getActiveOptionPositionsForUser(userId: string): Promise<OptionPosition[]> {
    return Array.from(this.optionPositionsMap.values()).filter(p => p.userId === userId && p.isActive);
  }

  async getOptionPositionBySymbol(userId: string, optionSymbol: string): Promise<OptionPosition | undefined> {
    return Array.from(this.optionPositionsMap.values()).find(
      p => p.userId === userId && p.optionSymbol === optionSymbol && p.isActive
    );
  }

  async createOptionPosition(position: InsertOptionPosition): Promise<OptionPosition> {
    const id = randomUUID();
    const now = new Date();
    const newPosition: OptionPosition = {
      id,
      userId: position.userId,
      underlyingSymbol: position.underlyingSymbol,
      optionSymbol: position.optionSymbol,
      optionType: position.optionType,
      strikePrice: position.strikePrice,
      expirationDate: position.expirationDate,
      contracts: position.contracts,
      averageCost: position.averageCost,
      dateAcquired: position.dateAcquired ?? null,
      notes: position.notes ?? null,
      isActive: position.isActive ?? true,
      createdAt: now,
      updatedAt: now,
    };
    this.optionPositionsMap.set(id, newPosition);
    return newPosition;
  }

  async updateOptionPosition(id: string, data: Partial<InsertOptionPosition>): Promise<OptionPosition | undefined> {
    const existing = this.optionPositionsMap.get(id);
    if (!existing) return undefined;
    const updated: OptionPosition = {
      ...existing,
      ...data,
      updatedAt: new Date(),
    };
    this.optionPositionsMap.set(id, updated);
    return updated;
  }

  async closeOptionPosition(id: string): Promise<OptionPosition | undefined> {
    return this.updateOptionPosition(id, { isActive: false });
  }

  async deleteOptionPosition(id: string): Promise<void> {
    this.optionPositionsMap.delete(id);
  }

  async insertMarketAuditLog(entry: InsertMarketDataAuditLog): Promise<MarketDataAuditLog> {
    const record: MarketDataAuditLog = {
      id: randomUUID(),
      symbol: entry.symbol,
      endpoint: entry.endpoint,
      provider: entry.provider,
      cacheResult: entry.cacheResult ?? null,
      eventType: entry.eventType,
      statusCode: entry.statusCode ?? null,
      latencyMs: entry.latencyMs ?? null,
      errorMessage: entry.errorMessage ?? null,
      metadata: entry.metadata ?? null,
      createdAt: new Date(),
    };
    return record;
  }

  async queryMarketAuditLogs(_filters: {
    symbol?: string;
    provider?: string;
    eventType?: string;
    from?: Date;
    to?: Date;
    limit?: number;
    offset?: number;
  }): Promise<{ entries: MarketDataAuditLog[]; total: number }> {
    return { entries: [], total: 0 };
  }
}

export class DatabaseStorage implements IStorage {
  // Users (for authentication)
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase()));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values({
        ...userData,
        email: userData.email?.toLowerCase(),
      })
      .onConflictDoUpdate({
        target: users.id,
        set: {
          ...userData,
          email: userData.email?.toLowerCase(),
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
  }

  async createUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values({
        ...userData,
        email: userData.email?.toLowerCase(),
      })
      .returning();
    return user;
  }

  async updateUser(id: string, data: Partial<UpsertUser>): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  // Strategies
  async getStrategy(id: string): Promise<Strategy | undefined> {
    const result = await db.select().from(strategies).where(eq(strategies.id, id));
    return result[0];
  }

  async getStrategiesForUser(userId: string): Promise<Strategy[]> {
    return await db.select().from(strategies).where(eq(strategies.userId, userId));
  }

  async createStrategy(insertStrategy: InsertStrategy): Promise<Strategy> {
    const result = await db.insert(strategies).values(insertStrategy).returning();
    return result[0];
  }

  async updateStrategy(id: string, data: Partial<InsertStrategy>): Promise<Strategy | undefined> {
    const [result] = await db.update(strategies)
      .set(data)
      .where(eq(strategies.id, id))
      .returning();
    return result;
  }

  async deleteStrategy(id: string): Promise<void> {
    await this.deleteLegsForStrategy(id);
    await db.delete(strategies).where(eq(strategies.id, id));
  }

  // Strategy Runs
  async createStrategyRun(insert: InsertStrategyRun): Promise<StrategyRun> {
    const result = await db.insert(strategyRuns).values(insert).returning();
    return result[0];
  }

  async getStrategyRunsForUser(userId: string): Promise<StrategyRun[]> {
    return await db
      .select()
      .from(strategyRuns)
      .where(eq(strategyRuns.userId, userId))
      .orderBy(desc(strategyRuns.createdAt));
  }

  async getStrategyRun(id: string): Promise<StrategyRun | undefined> {
    const result = await db.select().from(strategyRuns).where(eq(strategyRuns.id, id));
    return result[0];
  }

  async updateStrategyRun(
    id: string,
    patch: Partial<InsertStrategyRun>,
  ): Promise<StrategyRun | undefined> {
    const result = await db
      .update(strategyRuns)
      .set(patch)
      .where(eq(strategyRuns.id, id))
      .returning();
    return result[0];
  }

  async tryTransitionStrategyRun(
    id: string,
    fromStatus: string,
    patch: Partial<InsertStrategyRun>,
  ): Promise<StrategyRun | undefined> {
    // Conditional UPDATE: the row is only changed if its status still matches
    // `fromStatus`. Postgres makes this atomic, so exactly one concurrent caller
    // wins the lock and may place the live order.
    const result = await db
      .update(strategyRuns)
      .set(patch)
      .where(and(eq(strategyRuns.id, id), eq(strategyRuns.status, fromStatus)))
      .returning();
    return result[0];
  }

  async getActiveStrategyRuns(): Promise<StrategyRun[]> {
    return await db
      .select()
      .from(strategyRuns)
      .where(inArray(strategyRuns.status, ["watching", "entering", "in_position", "exiting"]));
  }

  // Options Legs
  async getLegsForStrategy(strategyId: string): Promise<OptionsLeg[]> {
    return await db.select().from(optionsLegs).where(eq(optionsLegs.strategyId, strategyId));
  }

  async createOptionsLeg(insertLeg: InsertOptionsLeg): Promise<OptionsLeg> {
    const result = await db.insert(optionsLegs).values(insertLeg).returning();
    return result[0];
  }

  async deleteLegsForStrategy(strategyId: string): Promise<void> {
    await db.delete(optionsLegs).where(eq(optionsLegs.strategyId, strategyId));
  }

  // Watchlist
  async getWatchlistItem(id: string): Promise<WatchlistItem | undefined> {
    const result = await db.select().from(watchlist).where(eq(watchlist.id, id));
    return result[0];
  }

  async addToWatchlist(insertItem: InsertWatchlistItem): Promise<WatchlistItem> {
    const result = await db.insert(watchlist).values(insertItem).returning();
    return result[0];
  }

  async updateWatchlistItem(id: string, data: Partial<InsertWatchlistItem>): Promise<WatchlistItem | undefined> {
    const result = await db.update(watchlist)
      .set(data)
      .where(eq(watchlist.id, id))
      .returning();
    return result[0];
  }

  async removeFromWatchlist(id: string): Promise<void> {
    await db.delete(watchlist).where(eq(watchlist.id, id));
  }

  async findWatchlistBySymbol(symbol: string): Promise<WatchlistItem | undefined> {
    const result = await db.select().from(watchlist).where(eq(watchlist.symbol, symbol));
    return result[0];
  }

  async getWatchlistForUser(userId: string): Promise<WatchlistItem[]> {
    return await db.select().from(watchlist).where(eq(watchlist.userId, userId));
  }

  async findWatchlistBySymbolForUser(userId: string, symbol: string): Promise<WatchlistItem | undefined> {
    const result = await db.select().from(watchlist)
      .where(and(eq(watchlist.userId, userId), eq(watchlist.symbol, symbol)));
    return result[0];
  }

  // Knowledge Base
  async getKnowledgeDocument(documentId: string): Promise<KnowledgeBase | undefined> {
    const result = await db.select().from(knowledgeBase).where(eq(knowledgeBase.documentId, documentId));
    return result[0];
  }

  async getAllKnowledgeDocuments(): Promise<KnowledgeBase[]> {
    return await db.select().from(knowledgeBase);
  }

  async createKnowledgeDocument(insertDoc: InsertKnowledgeBase): Promise<KnowledgeBase> {
    const result = await db.insert(knowledgeBase).values(insertDoc).returning();
    return result[0];
  }

  async deleteKnowledgeDocument(documentId: string): Promise<void> {
    await db.delete(knowledgeBase).where(eq(knowledgeBase.documentId, documentId));
  }

  // Trade Journal
  async getTrade(id: string): Promise<Trade | undefined> {
    const result = await db.select().from(trades).where(eq(trades.id, id));
    return result[0];
  }

  async getTradesForUser(userId: string): Promise<Trade[]> {
    return await db.select().from(trades)
      .where(eq(trades.userId, userId))
      .orderBy(desc(trades.createdAt));
  }

  async createTrade(insertTrade: InsertTrade): Promise<Trade> {
    const result = await db.insert(trades).values(insertTrade).returning();
    return result[0];
  }

  async updateTrade(id: string, partial: Partial<InsertTrade>): Promise<Trade | undefined> {
    const result = await db.update(trades)
      .set(partial)
      .where(eq(trades.id, id))
      .returning();
    return result[0];
  }

  async deleteTrade(id: string): Promise<void> {
    await db.delete(trades).where(eq(trades.id, id));
  }

  // Psychology Tracker
  async createPsychologyEntry(insertEntry: InsertPsychologyEntry): Promise<PsychologyEntry> {
    const result = await db.insert(psychologyEntries).values(insertEntry).returning();
    return result[0];
  }

  async getPsychologyEntriesForUser(userId: string): Promise<PsychologyEntry[]> {
    return await db.select().from(psychologyEntries)
      .where(eq(psychologyEntries.userId, userId))
      .orderBy(desc(psychologyEntries.createdAt));
  }

  // Conversations
  async getConversation(id: string): Promise<Conversation | undefined> {
    const result = await db.select().from(conversations).where(eq(conversations.id, id));
    return result[0];
  }

  async getConversationsForUser(userId: string): Promise<Conversation[]> {
    return await db.select().from(conversations)
      .where(eq(conversations.userId, userId))
      .orderBy(desc(conversations.updatedAt));
  }

  async createConversation(insertConversation: InsertConversation): Promise<Conversation> {
    const result = await db.insert(conversations).values(insertConversation).returning();
    return result[0];
  }

  async updateConversation(id: string, data: Partial<InsertConversation>): Promise<Conversation | undefined> {
    const result = await db.update(conversations)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(conversations.id, id))
      .returning();
    return result[0];
  }

  async deleteConversation(id: string): Promise<void> {
    await this.deleteMessagesForConversation(id);
    await db.delete(conversations).where(eq(conversations.id, id));
  }

  // Messages
  async getMessage(id: string): Promise<Message | undefined> {
    const result = await db.select().from(messages).where(eq(messages.id, id));
    return result[0];
  }

  async getMessagesForConversation(conversationId: string, limit?: number, offset?: number): Promise<Message[]> {
    let query = db.select().from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(messages.createdAt);
    
    if (limit !== undefined) {
      query = query.limit(limit) as typeof query;
    }
    if (offset !== undefined) {
      query = query.offset(offset) as typeof query;
    }
    
    return await query;
  }

  async getMessageCountForConversation(conversationId: string): Promise<number> {
    const result = await db.select({ count: sql<number>`count(*)::int` })
      .from(messages)
      .where(eq(messages.conversationId, conversationId));
    return result[0]?.count ?? 0;
  }

  async getConversationsWithMessageCount(userId: string, limit?: number, offset?: number): Promise<Array<Conversation & { messageCount: number }>> {
    let query = db
      .select({
        id: conversations.id,
        userId: conversations.userId,
        title: conversations.title,
        createdAt: conversations.createdAt,
        updatedAt: conversations.updatedAt,
        messageCount: sql<number>`count(${messages.id})::int`,
      })
      .from(conversations)
      .leftJoin(messages, eq(conversations.id, messages.conversationId))
      .where(eq(conversations.userId, userId))
      .groupBy(conversations.id)
      .orderBy(desc(conversations.updatedAt));
    
    if (limit !== undefined) {
      query = query.limit(limit) as typeof query;
    }
    if (offset !== undefined) {
      query = query.offset(offset) as typeof query;
    }
    
    const result = await query;
    
    return result.map(row => ({
      id: row.id,
      userId: row.userId,
      title: row.title,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      messageCount: row.messageCount ?? 0,
    }));
  }

  async createMessage(insertMessage: InsertMessage): Promise<Message> {
    const result = await db.insert(messages).values(insertMessage).returning();
    return result[0];
  }

  async updateMessage(id: string, data: Partial<InsertMessage>): Promise<Message | undefined> {
    const result = await db.update(messages)
      .set(data)
      .where(eq(messages.id, id))
      .returning();
    return result[0];
  }

  async deleteMessagesForConversation(conversationId: string): Promise<void> {
    await db.delete(messages).where(eq(messages.conversationId, conversationId));
  }

  // Market Snapshots
  async getRecentSnapshots(symbol: string, limit: number): Promise<MarketSnapshot[]> {
    return await db.select().from(marketSnapshots)
      .where(eq(marketSnapshots.symbol, symbol))
      .orderBy(desc(marketSnapshots.timestamp))
      .limit(limit);
  }

  async createMarketSnapshot(insertSnapshot: InsertMarketSnapshot): Promise<MarketSnapshot> {
    const result = await db.insert(marketSnapshots).values(insertSnapshot).returning();
    return result[0];
  }

  // AI Predictions
  async getAiPrediction(id: string): Promise<AiPrediction | undefined> {
    const result = await db.select().from(aiPredictions).where(eq(aiPredictions.id, id));
    return result[0];
  }

  async getAiPredictionsForSymbol(symbol: string, limit = 50): Promise<AiPrediction[]> {
    return await db.select().from(aiPredictions)
      .where(eq(aiPredictions.symbol, symbol))
      .orderBy(desc(aiPredictions.createdAt))
      .limit(limit);
  }

  async getRecentAiPredictions(limit = 50): Promise<AiPrediction[]> {
    return await db.select().from(aiPredictions)
      .orderBy(desc(aiPredictions.createdAt))
      .limit(limit);
  }

  async createAiPrediction(insertPrediction: InsertAiPrediction): Promise<AiPrediction> {
    const result = await db.insert(aiPredictions).values(insertPrediction).returning();
    return result[0];
  }

  // Price Alerts
  async getPriceAlert(id: string): Promise<PriceAlert | undefined> {
    const result = await db.select().from(priceAlerts).where(eq(priceAlerts.id, id));
    return result[0];
  }

  async getActivePriceAlerts(): Promise<PriceAlert[]> {
    return await db.select().from(priceAlerts)
      .where(eq(priceAlerts.status, "active"))
      .orderBy(desc(priceAlerts.createdAt));
  }

  async getPriceAlertsForUser(userId: string): Promise<PriceAlert[]> {
    return await db.select().from(priceAlerts)
      .where(eq(priceAlerts.userId, userId))
      .orderBy(desc(priceAlerts.createdAt));
  }

  async getActivePriceAlertsForUser(userId: string): Promise<PriceAlert[]> {
    return await db.select().from(priceAlerts)
      .where(and(eq(priceAlerts.userId, userId), eq(priceAlerts.status, "active")))
      .orderBy(desc(priceAlerts.createdAt));
  }

  async getPriceAlertsForSymbol(symbol: string): Promise<PriceAlert[]> {
    return await db.select().from(priceAlerts)
      .where(eq(priceAlerts.symbol, symbol.toUpperCase()))
      .orderBy(desc(priceAlerts.createdAt));
  }

  async createPriceAlert(insertAlert: InsertPriceAlert): Promise<PriceAlert> {
    const result = await db.insert(priceAlerts).values({
      ...insertAlert,
      symbol: insertAlert.symbol.toUpperCase(),
    }).returning();
    return result[0];
  }

  async updatePriceAlert(id: string, data: Partial<InsertPriceAlert>): Promise<PriceAlert | undefined> {
    const result = await db.update(priceAlerts)
      .set(data)
      .where(eq(priceAlerts.id, id))
      .returning();
    return result[0];
  }

  async triggerPriceAlert(id: string, triggeredPrice: number, aiInsight?: string): Promise<PriceAlert | undefined> {
    const result = await db.update(priceAlerts)
      .set({
        status: "triggered",
        triggeredAt: new Date(),
        triggeredPrice,
        aiInsight,
      })
      .where(eq(priceAlerts.id, id))
      .returning();
    return result[0];
  }

  async deletePriceAlert(id: string): Promise<void> {
    await db.delete(priceAlerts).where(eq(priceAlerts.id, id));
  }

  // Notifications (unified feed, user-scoped)
  async createNotification(notification: InsertNotification): Promise<Notification | undefined> {
    // Dedupe on (userId, dedupeKey): the unique index makes overlapping monitor
    // ticks / reloads / multi-tab idempotent. Returns undefined on conflict.
    const result = await db.insert(notifications)
      .values(notification)
      .onConflictDoNothing({ target: [notifications.userId, notifications.dedupeKey] })
      .returning();
    return result[0];
  }

  async getNotificationsForUser(userId: string, limit = 50): Promise<Notification[]> {
    return await db.select().from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt))
      .limit(limit);
  }

  async markNotificationRead(id: string, userId: string): Promise<Notification | undefined> {
    const result = await db.update(notifications)
      .set({ read: true })
      .where(and(eq(notifications.id, id), eq(notifications.userId, userId)))
      .returning();
    return result[0];
  }

  async markAllNotificationsRead(userId: string): Promise<number> {
    const result = await db.update(notifications)
      .set({ read: true })
      .where(and(eq(notifications.userId, userId), eq(notifications.read, false)))
      .returning();
    return result.length;
  }

  // AI Recommendations (user-scoped, audit trail)
  async getAiRecommendation(id: string): Promise<AiRecommendation | undefined> {
    const result = await db.select().from(aiRecommendations).where(eq(aiRecommendations.id, id));
    return result[0];
  }

  async getAiRecommendationsForUser(userId: string, limit = 50): Promise<AiRecommendation[]> {
    return await db.select().from(aiRecommendations)
      .where(eq(aiRecommendations.userId, userId))
      .orderBy(desc(aiRecommendations.createdAt))
      .limit(limit);
  }

  async createAiRecommendation(insertRecommendation: InsertAiRecommendation): Promise<AiRecommendation> {
    const result = await db.insert(aiRecommendations).values(insertRecommendation).returning();
    return result[0];
  }

  async updateAiRecommendation(id: string, data: Partial<InsertAiRecommendation>): Promise<AiRecommendation | undefined> {
    const result = await db.update(aiRecommendations)
      .set(data)
      .where(eq(aiRecommendations.id, id))
      .returning();
    return result[0];
  }

  // AI Cache (multi-tier response caching)
  async getAiCache(cacheKey: string): Promise<AiCache | undefined> {
    const [result] = await db.select().from(aiCache)
      .where(eq(aiCache.cacheKey, cacheKey));
    if (result && new Date() < result.expiresAt) {
      return result;
    }
    return undefined;
  }

  async setAiCache(cache: InsertAiCache): Promise<AiCache> {
    const [result] = await db.insert(aiCache)
      .values(cache)
      .onConflictDoUpdate({
        target: aiCache.cacheKey,
        set: {
          payload: cache.payload,
          tokenCount: cache.tokenCount,
          expiresAt: cache.expiresAt,
          marketSensitive: cache.marketSensitive,
          spyPriceAtCache: cache.spyPriceAtCache,
          lastAccessedAt: new Date(),
        },
      })
      .returning();
    return result;
  }

  async updateAiCacheHit(cacheKey: string): Promise<void> {
    await db.update(aiCache)
      .set({
        hitCount: sql`${aiCache.hitCount} + 1`,
        lastAccessedAt: new Date(),
      })
      .where(eq(aiCache.cacheKey, cacheKey));
  }

  async deleteExpiredAiCache(): Promise<number> {
    const result = await db.delete(aiCache)
      .where(sql`${aiCache.expiresAt} < NOW()`)
      .returning();
    return result.length;
  }

  async invalidateAiCacheByType(cacheType: string): Promise<void> {
    await db.delete(aiCache)
      .where(eq(aiCache.cacheType, cacheType));
  }

  // Conversation Summaries (memory optimization)
  async getConversationSummary(conversationId: string): Promise<ConversationSummary | undefined> {
    const [result] = await db.select().from(conversationSummaries)
      .where(eq(conversationSummaries.conversationId, conversationId))
      .orderBy(desc(conversationSummaries.createdAt))
      .limit(1);
    return result;
  }

  async createConversationSummary(summary: InsertConversationSummary): Promise<ConversationSummary> {
    const [result] = await db.insert(conversationSummaries)
      .values(summary)
      .returning();
    return result;
  }

  async updateConversationSummary(conversationId: string, data: Partial<InsertConversationSummary>): Promise<ConversationSummary | undefined> {
    const [result] = await db.update(conversationSummaries)
      .set(data)
      .where(eq(conversationSummaries.conversationId, conversationId))
      .returning();
    return result;
  }

  // Knowledge Base with Embeddings (RAG)
  async updateKnowledgeDocumentEmbedding(
    documentId: string,
    embedding: number[],
    model: string,
    tokenCount: number
  ): Promise<KnowledgeBase | undefined> {
    const [result] = await db.update(knowledgeBase)
      .set({
        embedding,
        embeddingModel: model,
        tokenCount,
        updatedAt: new Date(),
      })
      .where(eq(knowledgeBase.documentId, documentId))
      .returning();
    return result;
  }

  async getKnowledgeDocumentsByCategory(category: string): Promise<KnowledgeBase[]> {
    return await db.select().from(knowledgeBase)
      .where(eq(knowledgeBase.category, category));
  }

  async getKnowledgeDocumentsWithEmbeddings(): Promise<KnowledgeBase[]> {
    return await db.select().from(knowledgeBase)
      .where(sql`${knowledgeBase.embedding} IS NOT NULL`);
  }

  // AI Strategy Recommendations (market-driven trading suggestions)
  async getAiStrategyRecommendation(id: string): Promise<AiStrategyRecommendation | undefined> {
    const [result] = await db.select().from(aiStrategyRecommendations)
      .where(eq(aiStrategyRecommendations.id, id));
    return result;
  }

  async getAiStrategyRecommendationsForUser(userId: string | null, limit = 50): Promise<AiStrategyRecommendation[]> {
    if (userId === null) {
      return await db.select().from(aiStrategyRecommendations)
        .where(sql`${aiStrategyRecommendations.userId} IS NULL`)
        .orderBy(desc(aiStrategyRecommendations.createdAt))
        .limit(limit);
    }
    return await db.select().from(aiStrategyRecommendations)
      .where(eq(aiStrategyRecommendations.userId, userId))
      .orderBy(desc(aiStrategyRecommendations.createdAt))
      .limit(limit);
  }

  async getActiveAiStrategyRecommendations(userId: string | null): Promise<AiStrategyRecommendation[]> {
    if (userId === null) {
      return await db.select().from(aiStrategyRecommendations)
        .where(and(
          sql`${aiStrategyRecommendations.userId} IS NULL`,
          eq(aiStrategyRecommendations.status, 'active')
        ))
        .orderBy(desc(aiStrategyRecommendations.createdAt));
    }
    return await db.select().from(aiStrategyRecommendations)
      .where(and(
        eq(aiStrategyRecommendations.userId, userId),
        eq(aiStrategyRecommendations.status, 'active')
      ))
      .orderBy(desc(aiStrategyRecommendations.createdAt));
  }

  async createAiStrategyRecommendation(recommendation: InsertAiStrategyRecommendation): Promise<AiStrategyRecommendation> {
    const [result] = await db.insert(aiStrategyRecommendations)
      .values(recommendation)
      .returning();
    return result;
  }

  async updateAiStrategyRecommendationStatus(
    id: string,
    status: string,
    userAction?: string,
    executedTradeId?: string
  ): Promise<AiStrategyRecommendation | undefined> {
    const updateData: Record<string, unknown> = {
      status,
      updatedAt: new Date(),
    };
    if (userAction !== undefined) {
      updateData.userAction = userAction;
      updateData.userActionAt = new Date();
    }
    if (executedTradeId !== undefined) {
      updateData.executedTradeId = executedTradeId;
    }
    const [result] = await db.update(aiStrategyRecommendations)
      .set(updateData)
      .where(eq(aiStrategyRecommendations.id, id))
      .returning();
    return result;
  }

  async expireOldAiStrategyRecommendations(): Promise<number> {
    const result = await db.update(aiStrategyRecommendations)
      .set({ status: 'expired', updatedAt: new Date() })
      .where(and(
        eq(aiStrategyRecommendations.status, 'active'),
        sql`${aiStrategyRecommendations.expiresAt} < NOW()`
      ))
      .returning();
    return result.length;
  }

  // Confirmation Tokens (order confirmation persistence)
  async createConfirmationToken(token: string, orderId: string, expiresAt: Date): Promise<ConfirmationToken> {
    const [result] = await db.insert(confirmationTokens)
      .values({ token, orderId, expiresAt })
      .returning();
    return result;
  }

  async getConfirmationToken(token: string): Promise<ConfirmationToken | undefined> {
    const [result] = await db.select().from(confirmationTokens)
      .where(eq(confirmationTokens.token, token));
    return result;
  }

  async deleteConfirmationToken(token: string): Promise<void> {
    await db.delete(confirmationTokens)
      .where(eq(confirmationTokens.token, token));
  }

  async cleanupExpiredTokens(): Promise<number> {
    const result = await db.delete(confirmationTokens)
      .where(sql`${confirmationTokens.expiresAt} < NOW()`)
      .returning();
    return result.length;
  }

  // Option Positions (user-scoped tracked positions)
  async getOptionPosition(id: string): Promise<OptionPosition | undefined> {
    const [result] = await db.select().from(optionPositions)
      .where(eq(optionPositions.id, id));
    return result;
  }

  async getOptionPositionsForUser(userId: string): Promise<OptionPosition[]> {
    return await db.select().from(optionPositions)
      .where(eq(optionPositions.userId, userId))
      .orderBy(desc(optionPositions.createdAt));
  }

  async getActiveOptionPositionsForUser(userId: string): Promise<OptionPosition[]> {
    return await db.select().from(optionPositions)
      .where(and(
        eq(optionPositions.userId, userId),
        eq(optionPositions.isActive, true)
      ))
      .orderBy(desc(optionPositions.createdAt));
  }

  async getOptionPositionBySymbol(userId: string, optionSymbol: string): Promise<OptionPosition | undefined> {
    const [result] = await db.select().from(optionPositions)
      .where(and(
        eq(optionPositions.userId, userId),
        eq(optionPositions.optionSymbol, optionSymbol),
        eq(optionPositions.isActive, true)
      ));
    return result;
  }

  async createOptionPosition(position: InsertOptionPosition): Promise<OptionPosition> {
    const [result] = await db.insert(optionPositions)
      .values(position)
      .returning();
    return result;
  }

  async updateOptionPosition(id: string, data: Partial<InsertOptionPosition>): Promise<OptionPosition | undefined> {
    const [result] = await db.update(optionPositions)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(optionPositions.id, id))
      .returning();
    return result;
  }

  async closeOptionPosition(id: string): Promise<OptionPosition | undefined> {
    return this.updateOptionPosition(id, { isActive: false });
  }

  async deleteOptionPosition(id: string): Promise<void> {
    await db.delete(optionPositions)
      .where(eq(optionPositions.id, id));
  }

  async insertMarketAuditLog(entry: InsertMarketDataAuditLog): Promise<MarketDataAuditLog> {
    const [result] = await db.insert(marketDataAuditLog).values(entry).returning();
    return result;
  }

  async queryMarketAuditLogs(filters: {
    symbol?: string;
    provider?: string;
    eventType?: string;
    from?: Date;
    to?: Date;
    limit?: number;
    offset?: number;
  }): Promise<{ entries: MarketDataAuditLog[]; total: number }> {
    const { symbol, provider, eventType, from, to, limit = 100, offset = 0 } = filters;

    const conditions = [];
    if (symbol) conditions.push(eq(marketDataAuditLog.symbol, symbol.toUpperCase()));
    if (provider) conditions.push(eq(marketDataAuditLog.provider, provider));
    if (eventType) conditions.push(eq(marketDataAuditLog.eventType, eventType));
    if (from) conditions.push(gte(marketDataAuditLog.createdAt, from));
    if (to) conditions.push(lt(marketDataAuditLog.createdAt, to));

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [entries, countResult] = await Promise.all([
      db.select()
        .from(marketDataAuditLog)
        .where(where)
        .orderBy(desc(marketDataAuditLog.createdAt))
        .limit(limit)
        .offset(offset),
      db.select({ count: sql<number>`count(*)::int` })
        .from(marketDataAuditLog)
        .where(where),
    ]);

    return {
      entries,
      total: countResult[0]?.count ?? 0,
    };
  }
}

export const storage = new DatabaseStorage();
