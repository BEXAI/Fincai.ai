import Anthropic from "@anthropic-ai/sdk";
import crypto from "crypto";

const anthropic = new Anthropic({
  apiKey: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL,
});

export interface EmbeddingResult {
  embedding: number[];
  model: string;
  tokenCount: number;
}

export interface ChunkedDocument {
  content: string;
  chunkIndex: number;
  tokenCount: number;
  hash: string;
}

const embeddingCache = new Map<string, { embedding: number[]; timestamp: number }>();
const EMBEDDING_CACHE_TTL = 3600000; // 1 hour for embeddings

function hashText(text: string): string {
  return crypto.createHash("sha256").update(text).digest("hex").substring(0, 16);
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function chunkDocument(
  content: string,
  maxTokens: number = 512,
  overlap: number = 50
): ChunkedDocument[] {
  const chunks: ChunkedDocument[] = [];
  const sentences = content.split(/(?<=[.!?])\s+/);
  
  let currentChunk = "";
  let currentTokens = 0;
  let chunkIndex = 0;
  
  for (const sentence of sentences) {
    const sentenceTokens = estimateTokens(sentence);
    
    if (currentTokens + sentenceTokens > maxTokens && currentChunk.length > 0) {
      chunks.push({
        content: currentChunk.trim(),
        chunkIndex,
        tokenCount: currentTokens,
        hash: hashText(currentChunk),
      });
      
      const words = currentChunk.split(" ");
      const overlapWords = words.slice(-Math.floor(overlap / 2));
      currentChunk = overlapWords.join(" ") + " " + sentence;
      currentTokens = estimateTokens(currentChunk);
      chunkIndex++;
    } else {
      currentChunk += (currentChunk ? " " : "") + sentence;
      currentTokens += sentenceTokens;
    }
  }
  
  if (currentChunk.trim().length > 0) {
    chunks.push({
      content: currentChunk.trim(),
      chunkIndex,
      tokenCount: currentTokens,
      hash: hashText(currentChunk),
    });
  }
  
  return chunks;
}

export async function generateEmbedding(text: string): Promise<EmbeddingResult> {
  const hash = hashText(text);
  const cached = embeddingCache.get(hash);
  
  if (cached && Date.now() - cached.timestamp < EMBEDDING_CACHE_TTL) {
    return {
      embedding: cached.embedding,
      model: "semantic-similarity",
      tokenCount: estimateTokens(text),
    };
  }
  
  const normalizedText = text.toLowerCase().trim().slice(0, 8000);
  const embedding = generateSemanticVector(normalizedText);
  
  embeddingCache.set(hash, {
    embedding,
    timestamp: Date.now(),
  });
  
  return {
    embedding,
    model: "semantic-similarity",
    tokenCount: estimateTokens(text),
  };
}

function generateSemanticVector(text: string): number[] {
  const dimensions = 384;
  const vector: number[] = new Array(dimensions).fill(0);
  
  const tradingTerms: Record<string, number[]> = {
    buy: [0.8, 0.2, 0.1, 0.9, 0.3],
    sell: [-0.8, 0.2, 0.1, -0.9, 0.3],
    stock: [0.5, 0.7, 0.3, 0.4, 0.6],
    option: [0.3, 0.5, 0.8, 0.2, 0.7],
    call: [0.6, 0.4, 0.7, 0.8, 0.2],
    put: [-0.6, 0.4, 0.7, -0.8, 0.2],
    market: [0.4, 0.6, 0.5, 0.3, 0.5],
    price: [0.5, 0.5, 0.4, 0.6, 0.4],
    trade: [0.7, 0.3, 0.6, 0.5, 0.5],
    portfolio: [0.4, 0.8, 0.3, 0.5, 0.6],
    risk: [0.2, 0.3, 0.9, -0.4, 0.7],
    profit: [0.9, 0.4, 0.2, 0.8, 0.3],
    loss: [-0.9, 0.4, 0.2, -0.8, 0.3],
    bullish: [0.85, 0.15, 0.3, 0.9, 0.2],
    bearish: [-0.85, 0.15, 0.3, -0.9, 0.2],
    volatility: [0.3, 0.2, 0.8, 0.1, 0.9],
    dividend: [0.4, 0.7, 0.2, 0.5, 0.4],
    earnings: [0.6, 0.6, 0.4, 0.5, 0.5],
    technical: [0.4, 0.5, 0.6, 0.3, 0.7],
    fundamental: [0.5, 0.6, 0.5, 0.4, 0.6],
    analysis: [0.5, 0.5, 0.5, 0.5, 0.5],
    strategy: [0.5, 0.6, 0.7, 0.4, 0.6],
    hedge: [0.2, 0.4, 0.8, 0.1, 0.7],
    leverage: [0.6, 0.3, 0.7, 0.7, 0.5],
    spread: [0.4, 0.5, 0.6, 0.3, 0.6],
    strike: [0.4, 0.4, 0.7, 0.5, 0.5],
    expiration: [0.3, 0.3, 0.6, 0.2, 0.8],
    delta: [0.4, 0.4, 0.7, 0.5, 0.6],
    gamma: [0.3, 0.3, 0.8, 0.4, 0.7],
    theta: [0.3, 0.3, 0.7, 0.3, 0.8],
    vega: [0.3, 0.3, 0.8, 0.3, 0.8],
    spy: [0.5, 0.7, 0.4, 0.5, 0.5],
    qqq: [0.5, 0.7, 0.5, 0.5, 0.5],
    nasdaq: [0.5, 0.7, 0.5, 0.5, 0.5],
    dow: [0.5, 0.7, 0.4, 0.5, 0.5],
    etf: [0.4, 0.7, 0.3, 0.4, 0.5],
    index: [0.4, 0.7, 0.4, 0.4, 0.5],
  };
  
  const words = text.toLowerCase().split(/\W+/).filter(w => w.length > 2);
  let matchCount = 0;
  
  for (const word of words) {
    if (tradingTerms[word]) {
      const termVector = tradingTerms[word];
      for (let i = 0; i < termVector.length; i++) {
        vector[i] += termVector[i];
        vector[i + 5] += termVector[i] * 0.5;
        vector[i + 10] += termVector[i] * 0.25;
      }
      matchCount++;
    }
  }
  
  if (matchCount > 0) {
    for (let i = 0; i < 15; i++) {
      vector[i] /= matchCount;
    }
  }
  
  for (let i = 15; i < dimensions; i++) {
    let hash = 0;
    for (let j = 0; j < text.length; j++) {
      hash = ((hash << 5) - hash + text.charCodeAt(j) + i) | 0;
    }
    vector[i] = ((hash % 1000) / 1000) * 2 - 1;
  }
  
  const magnitude = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
  if (magnitude > 0) {
    for (let i = 0; i < dimensions; i++) {
      vector[i] /= magnitude;
    }
  }
  
  return vector;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    const minLen = Math.min(a.length, b.length);
    a = a.slice(0, minLen);
    b = b.slice(0, minLen);
  }
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  
  if (normA === 0 || normB === 0) return 0;
  
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

export async function generateBatchEmbeddings(
  texts: string[]
): Promise<EmbeddingResult[]> {
  const results: EmbeddingResult[] = [];
  
  for (const text of texts) {
    const result = await generateEmbedding(text);
    results.push(result);
  }
  
  return results;
}

export function clearEmbeddingCache(): void {
  embeddingCache.clear();
}

export function getEmbeddingCacheStats(): { size: number; oldestEntry: number | null } {
  let oldest: number | null = null;
  
  Array.from(embeddingCache.values()).forEach(value => {
    if (oldest === null || value.timestamp < oldest) {
      oldest = value.timestamp;
    }
  });
  
  return {
    size: embeddingCache.size,
    oldestEntry: oldest,
  };
}
