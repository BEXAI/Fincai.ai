import express, { type Request, Response, NextFunction } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { WebSocket } from "ws";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { marketDataService } from "./market-data";
import { strategyRunner } from "./strategy-runner";
import { alertMonitor } from "./alert-monitor";
import { SITE_URL, getRouteSeo, injectRouteSeo } from "@shared/seo-config";

const app = express();

// CORS configuration for production deployment
const defaultAllowedOrigins = [
  "http://localhost:5000",
  "http://localhost:5173",
  "https://aifinanceofficer.com",
  "https://www.aifinanceofficer.com",
  "https://aifinanceofficer.netlify.app",
  // Fincai.ai CDN domains
  "https://fincai.ai",
  "https://www.fincai.ai",
  "https://app.fincai.ai",
  "https://api.fincai.ai",
];

// Add Replit domains from environment
const replitDomains = process.env.REPLIT_DOMAINS
  ? process.env.REPLIT_DOMAINS.split(",").map((d) => `https://${d.trim()}`)
  : [];
const replitDevDomain = process.env.REPLIT_DEV_DOMAIN
  ? [`https://${process.env.REPLIT_DEV_DOMAIN}`]
  : [];

const additionalOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map((origin) => origin.trim())
  : [];

const allowedOrigins = [
  ...defaultAllowedOrigins,
  ...replitDomains,
  ...replitDevDomain,
  ...additionalOrigins,
];

// In development, allow all origins for easier testing
const isDev = process.env.NODE_ENV === "development";

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps or curl)
      if (!origin) {
        callback(null, true);
        return;
      }
      // In development mode, allow all origins
      if (isDev) {
        callback(null, true);
        return;
      }
      // Allow all Replit subdomains (secure suffix matching)
      const replitPatterns = ['.replit.dev', '.repl.co', '.replit.app', '.pikapod.net'];
      const isReplitDomain = replitPatterns.some(pattern => {
        const url = new URL(origin);
        return url.hostname.endsWith(pattern);
      });
      if (isReplitDomain) {
        callback(null, true);
        return;
      }
      // Allow fincai.ai and its subdomains (secure matching)
      try {
        const url = new URL(origin);
        if (url.hostname === 'fincai.ai' || url.hostname.endsWith('.fincai.ai')) {
          callback(null, true);
          return;
        }
      } catch {
        // Invalid URL, fall through to explicit check
      }
      // Check explicit allowed origins
      if (allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
  })
);

// Security headers middleware
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
  next();
});

declare module 'http' {
  interface IncomingMessage {
    rawBody: unknown
  }
}
app.use(cookieParser());
app.use(express.json({
  limit: "1mb",
  verify: (req, _res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ extended: false, limit: "1mb" }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

// Crawler detection for server-side per-route SEO injection. Many search and
// (especially) AI answer-engine crawlers do NOT execute JavaScript, so for these
// agents we rewrite the served HTML with the route's own title/meta/canonical/
// OG/Twitter tags, route JSON-LD, and a route-specific <noscript> summary.
const crawlerUserAgents = [
  // Social / link unfurlers
  'facebookexternalhit',
  'Facebot',
  'Twitterbot',
  'WhatsApp',
  'LinkedInBot',
  'Slackbot',
  'TelegramBot',
  'Pinterest',
  'Discordbot',
  'iMessageBot',
  'facebookcatalog',
  // Search engines
  'Googlebot',
  'Google-InspectionTool',
  'Bingbot',
  'Applebot',
  'DuckDuckBot',
  'YandexBot',
  'Baiduspider',
  // AI answer engines / crawlers
  'GPTBot',
  'OAI-SearchBot',
  'ChatGPT-User',
  'ClaudeBot',
  'Claude-Web',
  'anthropic-ai',
  'PerplexityBot',
  'Perplexity-User',
  'Google-Extended',
  'Amazonbot',
  'CCBot',
  'Bytespider',
  'Meta-ExternalAgent',
  'cohere-ai',
  'YouBot',
];

function isCrawler(userAgent: string | undefined): boolean {
  if (!userAgent) return false;
  const ua = userAgent.toLowerCase();
  return crawlerUserAgents.some((crawler) => ua.includes(crawler.toLowerCase()));
}

(async () => {
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });
  
  // Server-side per-route SEO injection for search + AI answer-engine crawlers.
  // For these agents we rewrite the base HTML with the route's own metadata so
  // every page (not just "/") is indexable and citable, even without JS.
  app.use(async (req: Request, res: Response, next: NextFunction) => {
    const userAgent = req.headers['user-agent'];

    // Only intercept crawler GET requests for document routes (not the API,
    // and not static assets, which are identified by a file extension).
    if (
      req.method !== 'GET' ||
      req.path.startsWith('/api') ||
      /\.[a-z0-9]+$/i.test(req.path) ||
      !isCrawler(userAgent)
    ) {
      return next();
    }

    // Only mapped routes get injected; unmapped ones fall through to the normal
    // shell (homepage metadata), matching prior behavior.
    const route = getRouteSeo(req.path);
    if (!route) {
      return next();
    }

    // Canonical base URL: trusted config first (CDN like fincai.ai), else the
    // shared default — never request headers (avoids canonical spoofing).
    const baseUrl = (process.env.SITE_URL || SITE_URL).replace(/\/$/, '');

    try {
      const fs = await import('fs');
      const path = await import('path');

      // Dev serves the source template; prod serves the built HTML (dist/public)
      // so JS-capable crawlers (e.g. Googlebot) still get working asset URLs.
      const isDev = app.get('env') === 'development';
      const htmlPath = isDev
        ? path.resolve(import.meta.dirname, '..', 'client', 'index.html')
        : path.resolve(import.meta.dirname, 'public', 'index.html');

      const baseHtml = await fs.promises.readFile(htmlPath, 'utf-8');
      const html = injectRouteSeo(baseHtml, route, baseUrl);

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
    } catch (err) {
      log(`SEO injection failed for ${req.path}: ${err}`);
      next();
    }
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`);
    
    // On-demand only: No automatic cache warmup - quotes fetched when users request them

    // Start the live strategy-runner engine (auto-trading background loop).
    // Note: on autoscale deployments that scale to zero, this loop only runs
    // while an instance is alive — see replit.md.
    strategyRunner.start().catch((err) => {
      log(`Failed to start strategy runner: ${err?.message ?? err}`);
    });

    // Start the always-on price-alert monitor (evaluates active alerts against
    // live quotes and writes notifications when conditions trigger).
    alertMonitor.start().catch((err) => {
      log(`Failed to start alert monitor: ${err?.message ?? err}`);
    });
  });

  // Graceful shutdown handling
  const gracefulShutdown = (signal: string) => {
    log(`Received ${signal}. Starting graceful shutdown...`);

    // Stop the strategy-runner engine timer.
    strategyRunner.stop();

    // Stop the alert-monitor timer.
    alertMonitor.stop();

    // Clear market data broadcast interval
    const marketDataInterval = (server as any).__marketDataInterval;
    if (marketDataInterval) {
      clearInterval(marketDataInterval);
      log("Cleared market data broadcast interval");
    }

    // Close WebSocket connections
    const wsClients = (server as any).__wsClients as Set<WebSocket> | undefined;
    if (wsClients) {
      log(`Closing ${wsClients.size} WebSocket connection(s)...`);
      wsClients.forEach((client) => {
        try {
          client.close(1001, "Server shutting down");
        } catch (err) {
          // Ignore errors during shutdown
        }
      });
    }

    // Close WebSocket server
    const wss = (server as any).__wss;
    if (wss) {
      wss.close(() => {
        log("WebSocket server closed");
      });
    }

    // Close HTTP server
    server.close((err) => {
      if (err) {
        log(`Error during server shutdown: ${err.message}`);
        process.exit(1);
      }
      log("HTTP server closed. Graceful shutdown complete.");
      process.exit(0);
    });

    // Force shutdown after 10 seconds if graceful shutdown fails
    setTimeout(() => {
      log("Forcefully shutting down after timeout");
      process.exit(1);
    }, 10000);
  };

  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
  process.on("SIGINT", () => gracefulShutdown("SIGINT"));
})();
