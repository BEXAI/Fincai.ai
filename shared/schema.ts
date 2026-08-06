import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, real, timestamp, boolean, jsonb, index, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Session storage table for Replit Auth
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// User storage table for authentication
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  passwordHash: varchar("password_hash"),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  // Whether the user has completed/dismissed the first-run onboarding
  // walkthrough. Persisted to the account so it doesn't re-trigger across
  // devices; anonymous users rely on localStorage instead.
  onboardingCompleted: boolean("onboarding_completed").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;

// Robinhood Agentic Trading MCP — persisted OAuth connection state.
// Stores the dynamically-registered client info and OAuth tokens (both
// AES-256-GCM encrypted at rest via SESSION_SECRET) keyed by the agent
// session id, so an authorized agent connection survives server restarts.
export const agentConnections = pgTable("agent_connections", {
  sessionId: text("session_id").primaryKey(),
  clientInfo: text("client_info"), // encrypted JSON (OAuthClientInformationFull)
  tokens: text("tokens"), // encrypted JSON (OAuthTokens)
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type AgentConnection = typeof agentConnections.$inferSelect;

// Per-user (session-keyed) third-party AI provider API keys (OpenAI, Gemini),
// stored AES-256-GCM encrypted at rest via SESSION_SECRET — the same mechanism
// that protects the Robinhood agent OAuth tokens. Lets users "bring their own
// key" so the multi-agent system can call models beyond the built-in Claude
// provider. `keyHint` is a masked preview (e.g. "sk-1...AB12") safe to surface
// in the UI; the full key is never returned to the client.
export const aiProviderConnections = pgTable(
  "ai_provider_connections",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    sessionId: text("session_id").notNull(),
    provider: text("provider").notNull(), // 'openai' | 'gemini'
    encryptedKey: text("encrypted_key").notNull(),
    keyHint: text("key_hint").notNull(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [
    uniqueIndex("ai_provider_session_provider_idx").on(
      table.sessionId,
      table.provider,
    ),
  ],
);

export type AiProviderConnection = typeof aiProviderConnections.$inferSelect;

export const AI_PROVIDERS = ["openai", "gemini"] as const;
export type AiProvider = (typeof AI_PROVIDERS)[number];

// Per-session selection of which AI model powers the multi-agent ANALYSIS
// (technical / sentiment / fundamental / bull-bear agents). Built-in Claude is
// the default whenever no row exists. Keyed by the same server-issued agent
// session id as the provider keys above. This only affects the analysis agents;
// the tool-calling chat assistant always runs on the built-in Claude provider.
export const aiAnalysisPreferences = pgTable("ai_analysis_preferences", {
  sessionId: text("session_id").primaryKey(),
  provider: text("provider").notNull(), // 'claude' | 'openai' | 'gemini'
  model: text("model"), // null for built-in Claude
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type AiAnalysisPreference = typeof aiAnalysisPreferences.$inferSelect;

// Providers that can power the multi-agent analysis. 'claude' is the built-in
// default (no user key required); the others are bring-your-own-key.
export const ANALYSIS_PROVIDERS = ["claude", "openai", "gemini"] as const;
export type AnalysisProvider = (typeof ANALYSIS_PROVIDERS)[number];

// Curated, allow-listed models per BYO provider. Non-technical users pick from
// these rather than typing raw model ids; `default` is used when none is chosen.
export const PROVIDER_MODELS: Record<
  AiProvider,
  { default: string; options: string[] }
> = {
  openai: { default: "gpt-4o-mini", options: ["gpt-4o-mini", "gpt-4o"] },
  gemini: {
    default: "gemini-1.5-flash",
    options: ["gemini-1.5-flash", "gemini-1.5-pro"],
  },
};

export function isAllowedModel(provider: AiProvider, model: string): boolean {
  return PROVIDER_MODELS[provider]?.options.includes(model) ?? false;
}

// ---------------------------------------------------------------------------
// PERSONALIZATION_LEVEL — regulatory control (compliance spec FIN-003).
//
// Governs how much of a specific user's situation the analysis/agent layer is
// allowed to take into account. Intake of a user's financial circumstances
// (a suitability questionnaire, risk-tolerance or goal-based intake) is one of
// the clearest markers of PERSONALIZED investment advice, which is exactly the
// posture that can pull a product inside the Investment Advisers Act definition.
//
// Ordered least → most personal. The system is CAPPED at PORTFOLIO: nothing at
// PROFILE (financial-suitability intake) may ship until a licensed securities
// attorney has weighed in (HD-10). This constant is the single enforcement
// point — gate any new personalization feature behind it.
export const PERSONALIZATION_LEVELS = [
  "NONE", // no user context; generic market analysis only
  "WATCHLIST", // may consider symbols the user is watching
  "PORTFOLIO", // may consider the user's current holdings / positions
  "PROFILE", // financial-suitability intake — NOT shippable pre-counsel
] as const;
export type PersonalizationLevel = (typeof PERSONALIZATION_LEVELS)[number];

/** Default level the product operates at today. */
export const PERSONALIZATION_LEVEL_DEFAULT: PersonalizationLevel = "PORTFOLIO";

/** Hard ceiling: no level beyond this may ship until counsel approves (HD-10). */
export const PERSONALIZATION_LEVEL_MAX_SHIPPABLE: PersonalizationLevel =
  "PORTFOLIO";

/** True only for levels at or below the shippable ceiling. */
export function isPersonalizationLevelShippable(
  level: PersonalizationLevel,
): boolean {
  return (
    PERSONALIZATION_LEVELS.indexOf(level) <=
    PERSONALIZATION_LEVELS.indexOf(PERSONALIZATION_LEVEL_MAX_SHIPPABLE)
  );
}

/**
 * Throws if a personalization level above the shippable ceiling is requested.
 * Call this at any boundary that would introduce financial-suitability intake.
 */
export function assertPersonalizationLevelShippable(
  level: PersonalizationLevel,
): PersonalizationLevel {
  if (!isPersonalizationLevelShippable(level)) {
    throw new Error(
      `PERSONALIZATION_LEVEL "${level}" is not shippable: capped at "${PERSONALIZATION_LEVEL_MAX_SHIPPABLE}" pending legal review (HD-10).`,
    );
  }
  return level;
}

// Input for setting the active analysis model (validated at the route layer).
export const setAnalysisModelSchema = z.object({
  provider: z.enum(ANALYSIS_PROVIDERS),
  model: z.string().trim().min(1).max(60).optional(),
});

// Options Strategy Schema (user-scoped)
export const strategies = pgTable("strategies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(), // Links strategy to user for privacy
  name: text("name").notNull(),
  description: text("description"),
  strategyType: text("strategy_type").notNull(), // 'call', 'put', 'spread', 'straddle', 'iron_condor', etc.
  riskProfile: text("risk_profile").notNull(), // 'conservative', 'moderate', 'aggressive'
  underlyingSymbol: text("underlying_symbol").notNull(),
  stopLossPercent: real("stop_loss_percent"), // Stop loss percentage
  profitTargetPercent: real("profit_target_percent"), // Profit target percentage
  timeStopMinutes: integer("time_stop_minutes"), // Time-based exit in minutes
  useTrailingStop: boolean("use_trailing_stop").default(false), // Trailing stop flag
  // Lifecycle: 'draft' (default) -> 'active' -> 'paused' -> 'closed'
  status: text("status").notNull().default("draft"),
  activatedAt: timestamp("activated_at"), // Set when the strategy first goes active
  // Symbols of the live holdings this strategy represents (for P&L tracking)
  linkedPositions: text("linked_positions").array().default(sql`'{}'::text[]`),
  createdAt: timestamp("created_at").defaultNow(),
});

export const STRATEGY_STATUSES = ["draft", "active", "paused", "closed"] as const;
export type StrategyStatus = (typeof STRATEGY_STATUSES)[number];

export const insertStrategySchema = createInsertSchema(strategies).omit({
  id: true,
  createdAt: true,
});

// Status transition input (validated at the route layer)
export const updateStrategyStatusSchema = z.object({
  status: z.enum(STRATEGY_STATUSES),
});

// Linked-positions update input
export const updateStrategyPositionsSchema = z.object({
  linkedPositions: z.array(z.string().min(1).max(12).toUpperCase()).max(50),
});

export type InsertStrategy = typeof strategies.$inferInsert;
export type Strategy = typeof strategies.$inferSelect;

// Options Leg Schema (individual options in a strategy)
export const optionsLegs = pgTable("options_legs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  strategyId: varchar("strategy_id").notNull(),
  optionType: text("option_type").notNull(), // 'call' or 'put'
  action: text("action").notNull(), // 'buy' or 'sell'
  strike: real("strike").notNull(),
  quantity: integer("quantity").notNull(),
  premium: real("premium").notNull(),
  expirationDate: text("expiration_date").notNull(),
});

export const insertOptionsLegSchema = createInsertSchema(optionsLegs).omit({
  id: true,
});

export type InsertOptionsLeg = typeof optionsLegs.$inferInsert;
export type OptionsLeg = typeof optionsLegs.$inferSelect;

// Watchlist Schema (user-scoped)
export const watchlist = pgTable("watchlist", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(), // Links watchlist item to user for privacy
  symbol: text("symbol").notNull(),
  name: text("name").notNull(),
  addedAt: timestamp("added_at").defaultNow(),
});

export const insertWatchlistSchema = createInsertSchema(watchlist).omit({
  id: true,
  addedAt: true,
});

export type InsertWatchlistItem = typeof watchlist.$inferInsert;
export type WatchlistItem = typeof watchlist.$inferSelect;

// Live Strategy Runs (user-scoped). A run is an instance of a strategy template
// executing against the live market. The strategy-runner engine evaluates the
// entry trigger then the stop-loss / profit-target / trailing-stop / time-stop
// rules on a timer. In 'live' mode it places equity orders through the user's
// connected Robinhood Agentic Trading MCP; in 'paper' mode fills are simulated.
export const strategyRuns = pgTable(
  "strategy_runs",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: varchar("user_id").notNull(),
    // Robinhood agent session id (from the HttpOnly cookie) used to place live
    // orders. Null for paper runs. Set server-side only — never from the client.
    agentSessionId: text("agent_session_id"),
    templateId: text("template_id").notNull(),
    templateName: text("template_name").notNull(),
    symbol: text("symbol").notNull(),
    direction: text("direction").notNull(), // 'long' | 'short'
    assetMode: text("asset_mode").notNull().default("equity"),
    mode: text("mode").notNull().default("paper"), // 'paper' | 'live'
    quantity: real("quantity").notNull(),
    // Entry trigger (quote-based)
    entryTriggerType: text("entry_trigger_type").notNull(), // 'momentum'|'reversion'|'immediate'
    entryThresholdPct: real("entry_threshold_pct"),
    // Exit rules
    stopLossPercent: real("stop_loss_percent").notNull(),
    profitTargetPercent: real("profit_target_percent").notNull(),
    timeStopMinutes: integer("time_stop_minutes"),
    useTrailingStop: boolean("use_trailing_stop").notNull().default(false),
    trailingStopPercent: real("trailing_stop_percent"),
    // Live/simulated state
    referencePrice: real("reference_price"), // price captured when the run started
    entryPrice: real("entry_price"),
    peakPrice: real("peak_price"), // best favorable price since entry (high=long, low=short)
    currentPrice: real("current_price"),
    pnlPercent: real("pnl_percent"), // unrealized while open, realized once closed
    status: text("status").notNull().default("watching"), // watching|entering|in_position|exiting|closed|paused|error
    exitReason: text("exit_reason"), // target|stop|trailing|time|manual|error
    entryOrderId: text("entry_order_id"),
    exitOrderId: text("exit_order_id"),
    lastMessage: text("last_message"),
    createdAt: timestamp("created_at").defaultNow(),
    enteredAt: timestamp("entered_at"),
    closedAt: timestamp("closed_at"),
    lastCheckedAt: timestamp("last_checked_at"),
  },
  (table) => [
    index("IDX_strategy_runs_user").on(table.userId),
    index("IDX_strategy_runs_status").on(table.status),
  ],
);

export const insertStrategyRunSchema = createInsertSchema(strategyRuns).omit({
  id: true,
  createdAt: true,
  enteredAt: true,
  closedAt: true,
  lastCheckedAt: true,
});

export type InsertStrategyRun = typeof strategyRuns.$inferInsert;
export type StrategyRun = typeof strategyRuns.$inferSelect;

// Knowledge Base Schema for RAG with Embeddings
export const knowledgeBase = pgTable("knowledge_base", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  documentId: text("document_id").notNull().unique(),
  title: text("title").notNull(),
  content: jsonb("content").notNull(),
  category: text("category").notNull(),
  sourceTitle: text("source_title").notNull(),
  sourceAuthor: text("source_author"),
  embedding: jsonb("embedding").$type<number[] | null>(), // Vector embedding as JSON array (float[])
  embeddingModel: text("embedding_model"), // e.g., "text-embedding-3-small"
  chunkIndex: integer("chunk_index").default(0), // For chunked documents
  tokenCount: integer("token_count"), // Token count for budget management
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("knowledge_base_category_idx").on(table.category),
]);

export const insertKnowledgeBaseSchema = createInsertSchema(knowledgeBase).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertKnowledgeBase = typeof knowledgeBase.$inferInsert;
export type KnowledgeBase = typeof knowledgeBase.$inferSelect;

// AI Response Cache Table - Multi-tier caching for LLM responses
export const aiCache = pgTable("ai_cache", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  cacheKey: text("cache_key").notNull().unique(), // Hash of prompt + context
  cacheType: text("cache_type").notNull(), // "response", "embedding", "rag_result", "summary"
  payload: jsonb("payload").notNull(), // Cached response/data
  tokenCount: integer("token_count"), // Token cost tracking
  hitCount: integer("hit_count").default(0), // Usage analytics
  lastAccessedAt: timestamp("last_accessed_at").defaultNow(),
  expiresAt: timestamp("expires_at").notNull(), // TTL-based expiration
  marketSensitive: boolean("market_sensitive").default(false), // Needs shorter TTL
  spyPriceAtCache: real("spy_price_at_cache"), // For market invalidation
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("ai_cache_type_idx").on(table.cacheType),
  index("ai_cache_expires_idx").on(table.expiresAt),
]);

export const insertAiCacheSchema = createInsertSchema(aiCache).omit({
  id: true,
  hitCount: true,
  lastAccessedAt: true,
  createdAt: true,
});

export type InsertAiCache = typeof aiCache.$inferInsert;
export type AiCache = typeof aiCache.$inferSelect;

// Conversation Summaries - Sliding window memory optimization
export const conversationSummaries = pgTable("conversation_summaries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  conversationId: varchar("conversation_id").notNull(),
  userId: varchar("user_id"), // Nullable for anonymous users
  summary: text("summary").notNull(), // Rolling conversation summary
  keyTopics: text("key_topics").array(), // Extracted key topics
  tradingContext: jsonb("trading_context"), // Portfolio state at summary time
  messageRangeStart: integer("message_range_start").notNull(), // First message ID in range
  messageRangeEnd: integer("message_range_end").notNull(), // Last message ID in range
  tokenCount: integer("token_count"), // Summary token count
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("conv_summary_conversation_idx").on(table.conversationId),
  index("conv_summary_user_idx").on(table.userId),
]);

export const insertConversationSummarySchema = createInsertSchema(conversationSummaries).omit({
  id: true,
  createdAt: true,
});

export type InsertConversationSummary = typeof conversationSummaries.$inferInsert;
export type ConversationSummary = typeof conversationSummaries.$inferSelect;

// RAG Context Injection Types
export interface RAGChunk {
  documentId: string;
  content: string;
  title: string;
  category: string;
  relevanceScore: number;
  tokenCount: number;
}

export interface ContextInjection {
  ragChunks: RAGChunk[];
  conversationSummary?: string;
  recentMessages: Array<{ role: string; content: string }>;
  portfolioSnapshot?: any;
  marketContext?: any;
  totalTokens: number;
}

// TypeScript interfaces for API responses and calculations

export interface MarketQuote {
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
}

export interface OptionsContract {
  symbol: string;
  strike: number;
  expiration: string;
  type: 'call' | 'put';
  bid: number;
  ask: number;
  last: number;
  volume: number;
  openInterest: number;
  impliedVolatility: number;
}

export interface Greeks {
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  rho: number;
}

export interface PayoffPoint {
  underlyingPrice: number;
  profitLoss: number;
}

export interface StrategyAnalysis {
  strategy: Strategy;
  legs: OptionsLeg[];
  currentPrice: number;
  payoffDiagram: PayoffPoint[];
  greeks: Greeks;
  maxProfit: number;
  maxLoss: number;
  breakeven: number[];
  probabilityOfProfit: number;
}

export interface PositionSizing {
  accountValue: number;
  riskPercentage: number;
  maxRiskPerPosition: number;
  recommendedContracts: number;
  totalCost: number;
}

export interface WalmartCaseStudy {
  timeline: {
    listingDate: string; // Dec 9, 2025
    announcementDate: string; // Mid-December
    reconstitutionDate: string; // Late December
  };
  strategies: {
    conservative: StrategyDetails;
    moderate: StrategyDetails;
    aggressive: StrategyDetails;
  };
}

export interface StrategyDetails {
  name: string;
  description: string;
  structure: string[];
  rationale: string[];
  entryTiming: string;
  exitTargets: string[];
  riskFactors: string[];
  maxProfit: string;
  maxLoss: string;
  breakeven: string;
}

// Trade Journal Schema (user-scoped)
export const trades = pgTable("trades", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(), // Links trade to user for privacy
  strategyId: varchar("strategy_id"),
  symbol: text("symbol").notNull(),
  entryDate: timestamp("entry_date").notNull(),
  exitDate: timestamp("exit_date"),
  entryPrice: real("entry_price").notNull(),
  exitPrice: real("exit_price"),
  quantity: integer("quantity").notNull(),
  profitLoss: real("profit_loss"),
  profitLossPercent: real("profit_loss_percent"),
  emotion: text("emotion"), // pre-trade emotion
  ruleAdherence: integer("rule_adherence"), // 1-10 scale
  notes: text("notes"),
  mistakes: text("mistakes").array(), // Array of mistake categories
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertTradeSchema = createInsertSchema(trades).omit({
  id: true,
  createdAt: true,
});

export type InsertTrade = typeof trades.$inferInsert;
export type Trade = typeof trades.$inferSelect;

// Psychology Tracker entries (user-scoped) - persists emotion logs and daily
// "deadly mistakes" self-assessments so they survive refreshes and sign-ins.
export const psychologyEntries = pgTable("psychology_entries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(), // Links entry to user for privacy
  entryType: text("entry_type").notNull(), // "emotion" | "mistakes"
  emotion: text("emotion"), // set for emotion entries
  notes: text("notes"), // optional free-text reflection
  mistakes: text("mistakes").array(), // set for mistakes self-assessment
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertPsychologyEntrySchema = createInsertSchema(psychologyEntries).omit({
  id: true,
  createdAt: true,
});

export type InsertPsychologyEntry = typeof psychologyEntries.$inferInsert;
export type PsychologyEntry = typeof psychologyEntries.$inferSelect;

// Validation schemas
export const createStrategyInputSchema = z.object({
  name: z.string().min(1, "Strategy name is required"),
  underlyingSymbol: z.string().min(1, "Ticker symbol is required").toUpperCase(),
  strategyType: z.enum(['call', 'put', 'call_spread', 'put_spread', 'straddle', 'strangle', 'iron_condor', 'butterfly']),
  riskProfile: z.enum(['conservative', 'moderate', 'aggressive']),
  description: z.string().optional(),
  stopLossPercent: z.number().positive().optional(),
  profitTargetPercent: z.number().positive().optional(),
  timeStopMinutes: z.number().int().positive().optional(),
  useTrailingStop: z.boolean().optional(),
  legs: z.array(z.object({
    optionType: z.enum(['call', 'put']),
    action: z.enum(['buy', 'sell']),
    strike: z.number().positive(),
    quantity: z.number().int().positive(),
    premium: z.number().positive(),
    expirationDate: z.string(),
  })).min(1, "At least one leg is required"),
}).refine((data) => {
  // R:R validation: profit target should be at least 1.5x stop loss
  if (data.stopLossPercent && data.profitTargetPercent) {
    return data.profitTargetPercent >= data.stopLossPercent * 1.5;
  }
  return true;
}, {
  message: "Profit target must be at least 1.5x the stop loss (minimum 1:1.5 risk/reward ratio)",
  path: ["profitTargetPercent"],
});

export type CreateStrategyInput = z.infer<typeof createStrategyInputSchema>;

// Market Analysis Validation Schemas
export const pivotPointInputSchema = z.object({
  high: z.number().positive("High price must be positive"),
  low: z.number().positive("Low price must be positive"),
  close: z.number().positive("Close price must be positive"),
}).refine((data) => data.high >= data.low, {
  message: "High price must be greater than or equal to low price",
  path: ["high"],
});

export type PivotPointInput = z.infer<typeof pivotPointInputSchema>;

export const fibonacciInputSchema = z.object({
  high: z.number().positive("High price must be positive"),
  low: z.number().positive("Low price must be positive"),
}).refine((data) => data.high > data.low, {
  message: "High price must be greater than low price",
  path: ["high"],
});

export type FibonacciInput = z.infer<typeof fibonacciInputSchema>;

export const atrInputSchema = z.object({
  prices: z.array(z.object({
    high: z.number().positive(),
    low: z.number().positive(),
    close: z.number().positive(),
  })).min(2, "At least 2 price data points are required"),
  period: z.number().int().positive().default(14),
}).refine((data) => {
  if (data.prices.length < data.period) {
    return false;
  }
  return true;
}, {
  message: "Number of price data points must be at least equal to the period",
  path: ["prices"],
});

export type ATRInput = z.infer<typeof atrInputSchema>;

export const bollingerBandsInputSchema = z.object({
  prices: z.array(z.number().positive()).min(2, "At least 2 price data points are required"),
  period: z.number().int().positive().default(20),
  stdDev: z.number().positive().default(2),
}).refine((data) => {
  if (data.prices.length < data.period) {
    return false;
  }
  return true;
}, {
  message: "Number of price data points must be at least equal to the period",
  path: ["prices"],
});

// ============================================
// AI Finance Chat & Portfolio Management
// ============================================

// Conversations Schema - Chat sessions (user-scoped for privacy)
export const conversations = pgTable("conversations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(), // Links conversation to user for privacy
  title: text("title").default("New Chat"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertConversationSchema = createInsertSchema(conversations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertConversation = typeof conversations.$inferInsert;
export type Conversation = typeof conversations.$inferSelect;

// Messages Schema - Individual chat messages
export const messages = pgTable("messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  conversationId: varchar("conversation_id").notNull(),
  role: text("role").notNull(), // 'user', 'assistant', 'system'
  content: text("content").notNull(),
  status: text("status").default("complete"), // 'draft', 'streaming', 'complete', 'error'
  metadata: jsonb("metadata"), // for tool calls, citations, etc.
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertMessageSchema = createInsertSchema(messages).omit({
  id: true,
  createdAt: true,
});

export type InsertMessage = typeof messages.$inferInsert;
export type Message = typeof messages.$inferSelect;

// Market Snapshots Schema - Price history for backdrop
export const marketSnapshots = pgTable("market_snapshots", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  symbol: text("symbol").notNull(),
  price: real("price").notNull(),
  open: real("open"),
  high: real("high"),
  low: real("low"),
  volume: integer("volume"),
  timestamp: timestamp("timestamp").defaultNow(),
});

export const insertMarketSnapshotSchema = createInsertSchema(marketSnapshots).omit({
  id: true,
});

export type InsertMarketSnapshot = typeof marketSnapshots.$inferInsert;
export type MarketSnapshot = typeof marketSnapshots.$inferSelect;

// AI Predictions Schema - Track AI analysis history
export const aiPredictions = pgTable("ai_predictions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  symbol: text("symbol").notNull(),
  recommendation: text("recommendation").notNull(), // 'strong_buy', 'buy', 'hold', 'sell', 'strong_sell'
  signal: real("signal").notNull(), // -1 to 1
  confidence: real("confidence").notNull(), // 0 to 1
  technicalSignal: real("technical_signal"),
  sentimentSignal: real("sentiment_signal"),
  fundamentalSignal: real("fundamental_signal"),
  marketRegime: text("market_regime"), // 'bullish', 'bearish', 'neutral', 'high_volatility'
  bullBearWinner: text("bull_bear_winner"), // 'bull', 'bear', 'neutral'
  priceAtPrediction: real("price_at_prediction"),
  priceAfter1Day: real("price_after_1_day"),
  priceAfter5Days: real("price_after_5_days"),
  wasAccurate: boolean("was_accurate"),
  analysisData: jsonb("analysis_data"), // Full analysis JSON
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertAiPredictionSchema = createInsertSchema(aiPredictions).omit({
  id: true,
  createdAt: true,
});

export type InsertAiPrediction = typeof aiPredictions.$inferInsert;
export type AiPrediction = typeof aiPredictions.$inferSelect;

// Chat mode enum for Trade/Plan modes
export const chatModeSchema = z.enum(["trade", "plan"]);
export type ChatMode = z.infer<typeof chatModeSchema>;

// Chat message input validation
export const chatMessageInputSchema = z.object({
  conversationId: z.string().nullish(),
  content: z.string().min(1, "Message cannot be empty"),
  history: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string(),
  })).optional(),
  mode: chatModeSchema.default("trade"),
});

export type ChatMessageInput = z.infer<typeof chatMessageInputSchema>;

// ============================================
// Price Alerts System
// ============================================

// Price Alerts (user-scoped)
export const priceAlerts = pgTable("price_alerts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(), // Links alert to user for privacy
  symbol: text("symbol").notNull(),
  targetPrice: real("target_price").notNull(),
  condition: text("condition").notNull(), // 'above', 'below', 'crosses'
  status: text("status").notNull().default("active"), // 'active', 'triggered', 'expired', 'cancelled'
  currentPriceAtCreation: real("current_price_at_creation"),
  triggeredAt: timestamp("triggered_at"),
  triggeredPrice: real("triggered_price"),
  aiInsight: text("ai_insight"), // AI-generated explanation when triggered
  note: text("note"), // User's optional note
  createdAt: timestamp("created_at").defaultNow(),
  expiresAt: timestamp("expires_at"), // Optional expiration
});

export const insertPriceAlertSchema = createInsertSchema(priceAlerts).omit({
  id: true,
  createdAt: true,
  triggeredAt: true,
  triggeredPrice: true,
  aiInsight: true,
});

export type InsertPriceAlert = typeof priceAlerts.$inferInsert;
export type PriceAlert = typeof priceAlerts.$inferSelect;

// Price alert input validation for API
export const createPriceAlertInputSchema = z.object({
  symbol: z.string().min(1, "Symbol is required").toUpperCase(),
  targetPrice: z.number().positive("Target price must be positive"),
  condition: z.enum(['above', 'below', 'crosses']),
  note: z.string().optional(),
  expiresAt: z.string().optional(), // ISO date string
});

// Notifications — unified, time-ordered feed surfaced by the NotificationBell.
// Sources: triggered price alerts, autonomous strategy-runner events, and agent
// order status changes. `userId` is the owner key ("demo-user" for anonymous
// sessions). `dedupeKey` is unique per owner so the same event can never be
// inserted twice (onConflictDoNothing), even across overlapping monitor ticks,
// page reloads, or multiple tabs.
export const notifications = pgTable("notifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  type: text("type").notNull(), // 'price_alert' | 'strategy' | 'agent_order'
  title: text("title").notNull(),
  message: text("message").notNull(),
  symbol: text("symbol"),
  relatedId: varchar("related_id"), // alert id, strategy run id, or order id
  dedupeKey: text("dedupe_key").notNull(),
  read: boolean("read").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  ownerIdx: index("notifications_owner_idx").on(table.userId, table.createdAt),
  dedupeUnique: uniqueIndex("notifications_owner_dedupe_unique").on(table.userId, table.dedupeKey),
}));

export const insertNotificationSchema = createInsertSchema(notifications).omit({
  id: true,
  read: true,
  createdAt: true,
});

export type InsertNotification = typeof notifications.$inferInsert;
export type Notification = typeof notifications.$inferSelect;

export const NOTIFICATION_TYPES = ["price_alert", "strategy", "agent_order"] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

// Chat Sessions Schema (user-scoped)
export const chatSessions = pgTable("chat_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id"),
  title: varchar("title", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  metadata: jsonb("metadata"),
});

export const insertChatSessionSchema = createInsertSchema(chatSessions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertChatSession = typeof chatSessions.$inferInsert;
export type ChatSession = typeof chatSessions.$inferSelect;

// ============================================
// AI Recommendations Audit Trail
// ============================================

// AI Recommendations Schema - Tracks AI trade recommendations for audit compliance
export const aiRecommendations = pgTable("ai_recommendations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  conversationId: varchar("conversation_id"),
  symbol: varchar("symbol", { length: 20 }).notNull(),
  recommendationType: varchar("recommendation_type", { length: 20 }).notNull(), // 'buy', 'sell', 'hold', 'analysis'
  action: varchar("action", { length: 10 }), // 'buy', 'sell' for trade recommendations
  quantity: integer("quantity"),
  price: real("price"),
  confidenceLevel: varchar("confidence_level", { length: 20 }), // 'high', 'medium', 'low'
  reasoning: text("reasoning"), // AI's reasoning for the recommendation
  chainOfThought: text("chain_of_thought"), // Full chain of thought for audit
  marketDataSnapshot: jsonb("market_data_snapshot"), // Snapshot of market data used
  validationSummary: text("validation_summary"), // Pre-flight check results
  userAction: varchar("user_action", { length: 20 }), // 'accepted', 'rejected', 'ignored', 'modified'
  orderId: varchar("order_id"), // Link to order if recommendation was executed
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertAiRecommendationSchema = createInsertSchema(aiRecommendations).omit({
  id: true,
  createdAt: true,
});

export type InsertAiRecommendation = typeof aiRecommendations.$inferInsert;
export type AiRecommendation = typeof aiRecommendations.$inferSelect;

// ============================================
// AI Strategy Recommendations
// ============================================

// AI-generated strategy recommendations based on market conditions and news
export const aiStrategyRecommendations = pgTable("ai_strategy_recommendations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id"), // Nullable for demo/anonymous users
  
  // Strategy Details
  title: text("title").notNull(), // e.g., "Bullish SPY Call Spread"
  thesis: text("thesis").notNull(), // Market thesis explanation
  strategyType: text("strategy_type").notNull(), // 'stock', 'call', 'put', 'call_spread', 'put_spread', 'iron_condor', etc.
  riskProfile: text("risk_profile").notNull(), // 'conservative', 'moderate', 'aggressive'
  
  // Primary Symbol and Related Symbols
  primarySymbol: text("primary_symbol").notNull(), // Main symbol (e.g., SPY)
  relatedSymbols: text("related_symbols").array(), // Related symbols for context
  
  // Action Details
  action: text("action").notNull(), // 'buy', 'sell', 'buy_to_open', 'sell_to_close', etc.
  direction: text("direction").notNull(), // 'bullish', 'bearish', 'neutral'
  timeHorizon: text("time_horizon").notNull(), // 'intraday', 'swing', 'position', 'long_term'
  
  // Options Legs (if applicable)
  legs: jsonb("legs").$type<Array<{
    optionType: 'call' | 'put';
    action: 'buy' | 'sell';
    strike: number;
    quantity: number;
    premium: number;
    expirationDate: string;
  }> | null>(),
  
  // Stock/ETF Details (if not options)
  suggestedQuantity: integer("suggested_quantity"),
  suggestedEntryPrice: real("suggested_entry_price"),
  
  // Risk Management
  stopLossPrice: real("stop_loss_price"),
  stopLossPercent: real("stop_loss_percent"),
  profitTargetPrice: real("profit_target_price"),
  profitTargetPercent: real("profit_target_percent"),
  maxRisk: real("max_risk"), // Dollar amount at risk
  riskRewardRatio: real("risk_reward_ratio"),
  
  // Confidence & Signals
  confidenceScore: real("confidence_score").notNull(), // 0.0 to 1.0
  technicalSignal: real("technical_signal"), // -1 to 1
  sentimentSignal: real("sentiment_signal"), // -1 to 1
  fundamentalSignal: real("fundamental_signal"), // -1 to 1
  
  // Reasoning & Analysis
  reasoning: text("reasoning").notNull(), // Detailed AI reasoning
  keyFactors: text("key_factors").array(), // Array of key factors driving recommendation
  newsReferences: jsonb("news_references").$type<Array<{
    headline: string;
    source: string;
    url?: string;
    sentiment: 'positive' | 'negative' | 'neutral';
    publishedAt?: string;
  }> | null>(),
  
  // Market Context Snapshot
  marketSnapshot: jsonb("market_snapshot").$type<{
    spyPrice: number;
    spyChange: number;
    spyChangePercent: number;
    vix: number | null;
    marketRegime: string;
    sectorPerformance?: Record<string, number>;
    timestamp: string;
  }>().notNull(),
  
  // Status & Actions
  status: text("status").notNull().default("active"), // 'active', 'accepted', 'rejected', 'expired', 'executed'
  expiresAt: timestamp("expires_at"),
  userAction: text("user_action"), // 'accepted', 'rejected', 'ignored'
  userActionAt: timestamp("user_action_at"),
  executedTradeId: varchar("executed_trade_id"), // Link to actual trade if executed
  
  // Audit Trail
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("ai_strategy_rec_user_idx").on(table.userId),
  index("ai_strategy_rec_symbol_idx").on(table.primarySymbol),
  index("ai_strategy_rec_status_idx").on(table.status),
  index("ai_strategy_rec_created_idx").on(table.createdAt),
]);

export const insertAiStrategyRecommendationSchema = createInsertSchema(aiStrategyRecommendations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  userAction: true,
  userActionAt: true,
  executedTradeId: true,
});

export type InsertAiStrategyRecommendation = typeof aiStrategyRecommendations.$inferInsert;
export type AiStrategyRecommendation = typeof aiStrategyRecommendations.$inferSelect;

// Request schema for generating a single recommendation
export const generateSingleRecommendationSchema = z.object({
  symbol: z.string().min(1, "Symbol is required").transform(s => s.toUpperCase()),
  riskProfile: z.enum(['conservative', 'moderate', 'aggressive']).default('moderate'),
});

export type GenerateSingleRecommendationInput = z.infer<typeof generateSingleRecommendationSchema>;

// Request schema for generating batch recommendations (future use)
export const generateRecommendationsInputSchema = z.object({
  symbols: z.array(z.string().transform(s => s.toUpperCase())).optional(),
  riskProfile: z.enum(['conservative', 'moderate', 'aggressive']).optional(),
  strategyTypes: z.array(z.enum(['stock', 'call', 'put', 'call_spread', 'put_spread', 'iron_condor', 'straddle', 'strangle'])).optional(),
  timeHorizon: z.enum(['intraday', 'swing', 'position', 'long_term']).optional(),
  maxRecommendations: z.number().int().min(1).max(10).default(3),
});

export type GenerateRecommendationsInput = z.infer<typeof generateRecommendationsInputSchema>;

// Update status schema for user actions
export const updateRecommendationStatusSchema = z.object({
  status: z.enum(['accepted', 'rejected', 'ignored']),
  executedTradeId: z.string().optional(),
});

export type UpdateRecommendationStatus = z.infer<typeof updateRecommendationStatusSchema>;

// ============================================
// Confirmation Tokens (for order confirmation persistence)
// ============================================

export const confirmationTokens = pgTable("confirmation_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  token: varchar("token").notNull().unique(),
  orderId: varchar("order_id").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("confirmation_tokens_token_idx").on(table.token),
  index("confirmation_tokens_expires_idx").on(table.expiresAt),
]);

export const insertConfirmationTokenSchema = createInsertSchema(confirmationTokens).omit({
  id: true,
  createdAt: true,
});

export type InsertConfirmationToken = typeof confirmationTokens.$inferInsert;
export type ConfirmationToken = typeof confirmationTokens.$inferSelect;

// ============================================
// Option Positions (user-scoped tracked positions)
// ============================================

export const optionPositions = pgTable("option_positions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  underlyingSymbol: varchar("underlying_symbol", { length: 10 }).notNull(),
  optionSymbol: varchar("option_symbol", { length: 21 }).notNull(), // OCC format
  optionType: varchar("option_type", { length: 4 }).notNull(), // 'call' or 'put'
  strikePrice: real("strike_price").notNull(),
  expirationDate: varchar("expiration_date", { length: 10 }).notNull(), // YYYY-MM-DD
  contracts: integer("contracts").notNull(), // positive = long, negative = short
  averageCost: real("average_cost").notNull(), // per share, not per contract
  dateAcquired: varchar("date_acquired", { length: 10 }), // YYYY-MM-DD
  notes: text("notes"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("option_positions_user_idx").on(table.userId),
  index("option_positions_symbol_idx").on(table.underlyingSymbol),
  index("option_positions_active_idx").on(table.isActive),
]);

export const insertOptionPositionSchema = createInsertSchema(optionPositions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertOptionPosition = typeof optionPositions.$inferInsert;
export type OptionPosition = typeof optionPositions.$inferSelect;

// ============================================
// Option Position Analysis Types (computed, not stored)
// ============================================

export const moneynessStatusEnum = z.enum(["deep_ITM", "ITM", "ATM", "OTM", "deep_OTM"]);
export type MoneynessStatus = z.infer<typeof moneynessStatusEnum>;

export const thetaExposureCategoryEnum = z.enum(["minimal", "accelerating", "critical"]);
export type ThetaExposureCategory = z.infer<typeof thetaExposureCategoryEnum>;

export interface PositionAnalytics {
  position: OptionPosition;
  underlying: {
    currentPrice: number;
    priceTimestamp: string;
  };
  contract: {
    daysToExpiration: number;
    tradingDaysToExpiration: number;
  };
  valuation: {
    currentOptionPrice: number;
    bidPrice: number;
    askPrice: number;
    marketValue: number;
    totalCostBasis: number;
    breakevenPrice: number;
  };
  returns: {
    unrealizedPnlDollars: number;
    unrealizedPnlPercent: number;
    todayReturnDollars: number;
    todayReturnPercent: number;
  };
  moneyness: {
    status: MoneynessStatus;
    distanceToStrike: number;
    distanceToStrikePercent: number;
    distanceToBreakeven: number;
    distanceToBreakevenPercent: number;
  };
  timeAnalysis: {
    calendarDaysHeld: number;
    thetaExposureCategory: ThetaExposureCategory;
  };
  greeks: {
    delta: number;
    gamma: number;
    theta: number;
    vega: number;
    rho: number;
    impliedVolatility: number;
  };
  risk: {
    maxLoss: number;
    currentLossToMaxLossRatio: number;
    requiredMoveForRecoveryPercent: number;
    probabilityOfProfit: number;
  };
}

export interface PriceScenario {
  underlyingPrice: number;
  optionIntrinsicValue: number;
  estimatedOptionPrice: number;
  positionValue: number;
  positionPnlDollars: number;
  positionPnlPercent: number;
}

export interface TimeDecayScenario {
  date: string;
  daysToExpiration: number;
  estimatedTimeValue: number;
  projectedOptionPrice: number;
}

export interface VolatilityScenario {
  ivChange: number;
  newImpliedVolatility: number;
  newOptionPrice: number;
  vegaImpactDollars: number;
}

export interface ScenarioAnalysis {
  priceScenarios: PriceScenario[];
  timeDecayScenarios: TimeDecayScenario[];
  volatilityScenarios: VolatilityScenario[];
}

export interface ExitStrategy {
  action: "close" | "roll_out" | "roll_down" | "roll_up" | "hold" | "average_down";
  description: string;
  rationale: string;
  estimatedProceeds?: number;
  estimatedCost?: number;
  newBreakeven?: number;
  riskAssessment: string;
}

export interface PositionAlert {
  type: "price_threshold" | "time_decay" | "loss_threshold" | "recovery_opportunity";
  severity: "info" | "warning" | "critical";
  message: string;
  triggeredAt: string;
  positionId: string;
}

// AI Function Tool Input/Output schemas
export const getPositionSummaryInputSchema = z.object({
  positionId: z.string().optional(),
  symbol: z.string().optional(),
});
export type GetPositionSummaryInput = z.infer<typeof getPositionSummaryInputSchema>;

export const analyzeBreakevenProbabilityInputSchema = z.object({
  positionId: z.string(),
  targetPrice: z.number().optional(),
});
export type AnalyzeBreakevenProbabilityInput = z.infer<typeof analyzeBreakevenProbabilityInputSchema>;

export const generateScenarioTableInputSchema = z.object({
  positionId: z.string(),
  scenarioType: z.enum(["price", "time", "volatility", "combined"]),
  range: z.object({
    min: z.number().optional(),
    max: z.number().optional(),
    step: z.number().optional(),
  }).optional(),
});
export type GenerateScenarioTableInput = z.infer<typeof generateScenarioTableInputSchema>;

export const recommendExitStrategyInputSchema = z.object({
  positionId: z.string(),
  riskTolerance: z.enum(["conservative", "moderate", "aggressive"]).default("moderate"),
});
export type RecommendExitStrategyInput = z.infer<typeof recommendExitStrategyInputSchema>;

export const calculateRollOptionsInputSchema = z.object({
  positionId: z.string(),
  rollType: z.enum(["out_in_time", "down_in_strike", "up_in_strike", "diagonal"]),
});
export type CalculateRollOptionsInput = z.infer<typeof calculateRollOptionsInputSchema>;

export const comparePositionsInputSchema = z.object({
  positionIds: z.array(z.string()).min(2),
});
export type ComparePositionsInput = z.infer<typeof comparePositionsInputSchema>;

// ============================================
// Market Data API Audit Log
// ============================================

export const marketDataAuditLog = pgTable("market_data_audit_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  symbol: text("symbol").notNull(),
  endpoint: text("endpoint").notNull(), // "quote" | "intraday" | "historical" | "options" | "movers"
  provider: text("provider").notNull(), // "alpaca" | "demo" | "alpha_vantage" | "cache" | "aggregated"
  cacheResult: text("cache_result"), // "hit" | "miss" | "stale"
  eventType: text("event_type").notNull(), // "cache_hit" | "fresh" | "rate_limit" | "error"
  statusCode: integer("status_code"), // HTTP status from provider (200, 429, 401, etc.)
  latencyMs: integer("latency_ms"),
  errorMessage: text("error_message"),
  metadata: jsonb("metadata"), // additional context (interval, period, data points returned, etc.)
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("market_audit_symbol_idx").on(table.symbol),
  index("market_audit_provider_idx").on(table.provider),
  index("market_audit_created_idx").on(table.createdAt),
]);

// Enum constants — used for both TS type safety and Zod validation
export const AUDIT_PROVIDERS = [
  'alpaca', 'demo', 'alpha_vantage', 'cache', 'aggregated',
] as const;
export type AuditProvider = typeof AUDIT_PROVIDERS[number];

export const AUDIT_CACHE_RESULTS = ['hit', 'miss', 'stale'] as const;
export type AuditCacheResult = typeof AUDIT_CACHE_RESULTS[number];

export const AUDIT_EVENT_TYPES = ['cache_hit', 'fresh', 'rate_limit', 'error'] as const;
export type AuditEventType = typeof AUDIT_EVENT_TYPES[number];

export const insertMarketDataAuditLogSchema = z.object({
  symbol: z.string(),
  endpoint: z.string(),
  provider: z.enum(AUDIT_PROVIDERS),
  cacheResult: z.enum(AUDIT_CACHE_RESULTS).nullable().optional(),
  statusCode: z.number().nullable().optional(),
  eventType: z.enum(AUDIT_EVENT_TYPES),
  latencyMs: z.number().nullable().optional(),
  errorMessage: z.string().nullable().optional(),
  metadata: z.unknown().nullable().optional(),
});

export type InsertMarketDataAuditLog = z.infer<typeof insertMarketDataAuditLogSchema>;
export type MarketDataAuditLog = typeof marketDataAuditLog.$inferSelect;
