import { generateEmbedding, cosineSimilarity, chunkDocument, EmbeddingResult } from "./embeddings";
import type { KnowledgeBase, RAGChunk } from "@shared/schema";

export interface RAGSearchOptions {
  topK?: number;
  minScore?: number;
  categories?: string[];
  maxTokens?: number;
  contextBudgetPercent?: number; // Target percentage of maxTokens to use (default 75%)
}

// Source trust weights by category
const SOURCE_TRUST_WEIGHTS: Record<string, number> = {
  "regulatory": 1.0,
  "compliance": 0.95,
  "trading-rules": 0.90,
  "market-mechanics": 0.85,
  "strategies": 0.80,
  "options": 0.85,
  "fundamentals": 0.75,
  "general": 0.70,
  "default": 0.70,
};

// Calculate recency weight based on document age
function calculateRecencyWeight(createdAt: Date | null): number {
  if (!createdAt) return 0.7; // Default for unknown dates
  
  const ageInDays = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24);
  
  // Decay function: recent docs get higher weight
  if (ageInDays < 7) return 1.0;       // Last week: full weight
  if (ageInDays < 30) return 0.95;     // Last month: slight decay
  if (ageInDays < 90) return 0.85;     // Last quarter: moderate decay
  if (ageInDays < 365) return 0.75;    // Last year: notable decay
  return 0.6;                           // Older: significant decay
}

// Get source trust weight by category
function getSourceTrustWeight(category: string): number {
  return SOURCE_TRUST_WEIGHTS[category.toLowerCase()] || SOURCE_TRUST_WEIGHTS["default"];
}

export interface RAGSearchResult {
  chunks: RAGChunk[];
  totalTokens: number;
  queryEmbedding: number[];
  searchTimeMs: number;
}

const ragResultCache = new Map<string, { result: RAGSearchResult; timestamp: number }>();
const RAG_CACHE_TTL = 300000; // 5 minutes

function getCacheKey(query: string, options: RAGSearchOptions): string {
  const normalized = query.toLowerCase().trim().split(/\s+/).sort().join(" ");
  return `${normalized}:${options.topK}:${options.categories?.join(",") || "all"}`;
}

export async function searchKnowledgeBase(
  query: string,
  documents: KnowledgeBase[],
  options: RAGSearchOptions = {}
): Promise<RAGSearchResult> {
  const startTime = Date.now();
  const { topK = 5, minScore = 0.3, categories, contextBudgetPercent = 0.75 } = options;
  
  // Apply 75% budget allocation as per design spec
  const maxTokens = options.maxTokens ? Math.floor(options.maxTokens * contextBudgetPercent) : 1500;
  
  const cacheKey = getCacheKey(query, options);
  const cached = ragResultCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < RAG_CACHE_TTL) {
    return {
      ...cached.result,
      searchTimeMs: 0,
    };
  }
  
  const queryResult = await generateEmbedding(query);
  const queryEmbedding = queryResult.embedding;
  
  let filteredDocs = documents;
  if (categories && categories.length > 0) {
    filteredDocs = documents.filter(doc => categories.includes(doc.category));
  }
  
  const scoredChunks: Array<RAGChunk & { score: number; semanticScore: number; recencyWeight: number; trustWeight: number }> = [];
  
  for (const doc of filteredDocs) {
    const docEmbedding = doc.embedding as number[] | null;
    
    // Calculate semantic similarity
    let semanticScore: number;
    if (docEmbedding && Array.isArray(docEmbedding)) {
      semanticScore = cosineSimilarity(queryEmbedding, docEmbedding);
    } else {
      const content = typeof doc.content === "string" 
        ? doc.content 
        : JSON.stringify(doc.content);
      
      const docEmbeddingResult = await generateEmbedding(content.slice(0, 2000));
      semanticScore = cosineSimilarity(queryEmbedding, docEmbeddingResult.embedding);
    }
    
    // Calculate recency weight based on document age
    const recencyWeight = calculateRecencyWeight(doc.createdAt);
    
    // Get source trust weight based on category
    const trustWeight = getSourceTrustWeight(doc.category);
    
    // Apply full relevance formula: semantic_score × recency_weight × source_trust
    const finalScore = semanticScore * recencyWeight * trustWeight;
    
    if (finalScore >= minScore) {
      const content = typeof doc.content === "string" 
        ? doc.content 
        : JSON.stringify(doc.content);
      
      scoredChunks.push({
        documentId: doc.documentId,
        content,
        title: doc.title,
        category: doc.category,
        relevanceScore: finalScore,
        tokenCount: doc.tokenCount || estimateTokens(content),
        score: finalScore,
        semanticScore,
        recencyWeight,
        trustWeight,
      });
    }
  }
  
  // Sort by final weighted score
  scoredChunks.sort((a, b) => b.score - a.score);
  
  const selectedChunks: RAGChunk[] = [];
  let totalTokens = 0;
  
  for (const chunk of scoredChunks) {
    if (selectedChunks.length >= topK) break;
    if (totalTokens + chunk.tokenCount > maxTokens) continue;
    
    selectedChunks.push({
      documentId: chunk.documentId,
      content: chunk.content,
      title: chunk.title,
      category: chunk.category,
      relevanceScore: chunk.relevanceScore,
      tokenCount: chunk.tokenCount,
    });
    totalTokens += chunk.tokenCount;
  }
  
  const result: RAGSearchResult = {
    chunks: selectedChunks,
    totalTokens,
    queryEmbedding,
    searchTimeMs: Date.now() - startTime,
  };
  
  ragResultCache.set(cacheKey, {
    result,
    timestamp: Date.now(),
  });
  
  return result;
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function formatRAGContext(chunks: RAGChunk[]): string {
  if (chunks.length === 0) return "";
  
  const formattedChunks = chunks.map((chunk, index) => {
    const relevanceLabel = chunk.relevanceScore > 0.7 ? "HIGH" : 
                          chunk.relevanceScore > 0.5 ? "MEDIUM" : "LOW";
    
    return `[${index + 1}] ${chunk.title} (${chunk.category}, Relevance: ${relevanceLabel})
${chunk.content.slice(0, 500)}${chunk.content.length > 500 ? "..." : ""}`;
  });
  
  return `## RELEVANT KNOWLEDGE BASE CONTEXT

${formattedChunks.join("\n\n")}

---
Use the above context to inform your response when relevant.`;
}

export interface ContextBudget {
  totalBudget: number;
  systemPromptBudget: number;
  ragBudget: number;
  conversationBudget: number;
  summaryBudget: number;
  portfolioBudget: number;
}

export function calculateContextBudget(maxTokens: number = 100000): ContextBudget {
  const totalBudget = Math.floor(maxTokens * 0.75);
  
  return {
    totalBudget,
    systemPromptBudget: Math.floor(totalBudget * 0.25),
    ragBudget: Math.floor(totalBudget * 0.20),
    conversationBudget: Math.floor(totalBudget * 0.35),
    summaryBudget: Math.floor(totalBudget * 0.10),
    portfolioBudget: Math.floor(totalBudget * 0.10),
  };
}

export interface ConversationWindow {
  recentMessages: Array<{ role: string; content: string }>;
  summary?: string;
  totalTokens: number;
}

export function buildConversationWindow(
  messages: Array<{ role: string; content: string }>,
  summary: string | undefined,
  maxTokens: number
): ConversationWindow {
  const recentMessages: Array<{ role: string; content: string }> = [];
  let totalTokens = 0;
  
  if (summary) {
    totalTokens += estimateTokens(summary);
  }
  
  const reversedMessages = [...messages].reverse();
  
  for (const msg of reversedMessages) {
    const msgTokens = estimateTokens(msg.content);
    if (totalTokens + msgTokens > maxTokens) break;
    
    recentMessages.unshift(msg);
    totalTokens += msgTokens;
  }
  
  return {
    recentMessages,
    summary,
    totalTokens,
  };
}

export function clearRAGCache(): void {
  ragResultCache.clear();
}

export function getRAGCacheStats(): { size: number; hitRate: number } {
  return {
    size: ragResultCache.size,
    hitRate: 0,
  };
}

export async function indexDocument(
  doc: { documentId: string; title: string; content: string; category: string },
  options: { chunkSize?: number; overlap?: number } = {}
): Promise<Array<{ chunk: string; embedding: number[]; chunkIndex: number }>> {
  const { chunkSize = 512, overlap = 50 } = options;
  
  const chunks = chunkDocument(doc.content, chunkSize, overlap);
  const results: Array<{ chunk: string; embedding: number[]; chunkIndex: number }> = [];
  
  for (const chunk of chunks) {
    const embeddingResult = await generateEmbedding(chunk.content);
    results.push({
      chunk: chunk.content,
      embedding: embeddingResult.embedding,
      chunkIndex: chunk.chunkIndex,
    });
  }
  
  return results;
}
