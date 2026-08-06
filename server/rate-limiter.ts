import { RequestHandler } from "express";

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const rateLimitStore: Map<string, RateLimitEntry> = new Map();

const cleanupInterval = setInterval(() => {
  const now = Date.now();
  const keysToDelete: string[] = [];
  rateLimitStore.forEach((entry, key) => {
    if (entry.resetTime < now) {
      keysToDelete.push(key);
    }
  });
  keysToDelete.forEach((key) => rateLimitStore.delete(key));
}, 60 * 1000);

if (cleanupInterval.unref) {
  cleanupInterval.unref();
}

function getClientIp(req: any): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") {
    return forwarded.split(",")[0].trim();
  }
  if (Array.isArray(forwarded)) {
    return forwarded[0];
  }
  return req.socket?.remoteAddress || req.ip || "unknown";
}

export function createRateLimiter(
  maxAttempts: number,
  windowMs: number,
  keyPrefix: string = ""
): RequestHandler {
  return (req, res, next) => {
    const ip = getClientIp(req);
    const key = `${keyPrefix}:${ip}`;
    const now = Date.now();

    let entry = rateLimitStore.get(key);

    if (!entry || entry.resetTime < now) {
      entry = {
        count: 1,
        resetTime: now + windowMs,
      };
      rateLimitStore.set(key, entry);
      return next();
    }

    if (entry.count >= maxAttempts) {
      const retryAfterSeconds = Math.ceil((entry.resetTime - now) / 1000);
      res.set("Retry-After", String(retryAfterSeconds));
      res.set("X-RateLimit-Limit", String(maxAttempts));
      res.set("X-RateLimit-Remaining", "0");
      res.set("X-RateLimit-Reset", String(Math.ceil(entry.resetTime / 1000)));
      
      return res.status(429).json({
        message: "Too many attempts. Please try again later.",
        retryAfterSeconds,
      });
    }

    entry.count++;
    rateLimitStore.set(key, entry);

    res.set("X-RateLimit-Limit", String(maxAttempts));
    res.set("X-RateLimit-Remaining", String(maxAttempts - entry.count));
    res.set("X-RateLimit-Reset", String(Math.ceil(entry.resetTime / 1000)));

    next();
  };
}

export const authRateLimiter = createRateLimiter(5, 15 * 60 * 1000, "auth");

export const registerRateLimiter = createRateLimiter(3, 15 * 60 * 1000, "register");

export const passwordResetRateLimiter = createRateLimiter(10, 15 * 60 * 1000, "password-reset");

export const chatRateLimiter = createRateLimiter(30, 60 * 1000, "chat");

// Connecting a provider key triggers an outbound validation call, so cap
// attempts per IP to prevent using the endpoint as a validation oracle / DoS.
export const aiProviderRateLimiter = createRateLimiter(10, 15 * 60 * 1000, "ai-provider");

// Each multi-agent analysis fans out to ~4 LLM calls, so cap per IP to keep
// provider costs and rate-limit pressure bounded.
export const aiAnalyzeRateLimiter = createRateLimiter(10, 60 * 1000, "ai-analyze");

// Selecting the active analysis model is a cheap DB write; allow frequent
// toggling while still bounding abuse.
export const aiAnalysisSelectRateLimiter = createRateLimiter(30, 60 * 1000, "ai-analysis-select");

export function resetRateLimitForIp(ip: string, prefix: string = ""): void {
  const key = `${prefix}:${ip}`;
  rateLimitStore.delete(key);
}

export function getRateLimitStatus(ip: string, prefix: string = ""): { remaining: number; resetTime: number } | null {
  const key = `${prefix}:${ip}`;
  const entry = rateLimitStore.get(key);
  
  if (!entry) {
    return null;
  }
  
  return {
    remaining: Math.max(0, entry.count),
    resetTime: entry.resetTime,
  };
}
