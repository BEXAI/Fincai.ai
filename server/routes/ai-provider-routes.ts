import type { Express, Request, Response } from "express";
import { randomUUID } from "crypto";
import { z } from "zod";
import { validateCsrf } from "../csrf";
import {
  aiProviderRateLimiter,
  aiAnalysisSelectRateLimiter,
} from "../rate-limiter";
import { getTrustedOrigin } from "./agent-routes";
import { isEncryptionConfigured } from "../encryption";
import {
  AI_PROVIDERS,
  setAnalysisModelSchema,
  type AiProvider,
} from "@shared/schema";
import {
  listProviderConnections,
  saveProviderKey,
  deleteProviderKey,
  getAnalysisSelection,
  setAnalysisSelection,
  clearAnalysisSelectionForProvider,
} from "../ai-provider-store";
import { validateProviderKey } from "../ai-providers";

// Routes for "bring your own" AI provider keys (OpenAI, Gemini). Keys are stored
// encrypted and keyed to the server-issued HttpOnly agent session cookie — the
// same session that gates the Robinhood agent — so even an anonymous visitor can
// connect keys that persist across reloads. The plaintext key is never returned
// to the client; only a masked hint is exposed.

const AGENT_SESSION_COOKIE = "agentSessionId";

// Mirror agent-routes' session handling: the id is server-issued and unguessable
// so stored secrets can never be addressed by a client-supplied value.
function getSessionId(req: Request, res: Response): string {
  let sid = req.cookies?.[AGENT_SESSION_COOKIE];
  if (!sid) {
    sid = randomUUID();
    res.cookie(AGENT_SESSION_COOKIE, sid, {
      httpOnly: true,
      sameSite: "lax",
      secure: getTrustedOrigin().startsWith("https://"),
      maxAge: 1000 * 60 * 60 * 24 * 30,
    });
  }
  return sid;
}

// Exported for other routers (e.g. the analysis endpoint) that must resolve the
// same server-issued session id used to scope a visitor's keys/selection.
export function getAgentSessionId(req: Request, res: Response): string {
  return getSessionId(req, res);
}

const providerSchema = z.enum(AI_PROVIDERS);
const connectSchema = z.object({
  apiKey: z.string().trim().min(10).max(400),
});

export function registerAiProviderRoutes(app: Express): void {
  // Current connection status for this session (masked hint only).
  app.get("/api/ai-providers", async (req, res) => {
    const sid = getSessionId(req, res);
    const [providers, selection] = await Promise.all([
      listProviderConnections(sid),
      getAnalysisSelection(sid),
    ]);
    res.json({
      providers,
      encryptionConfigured: isEncryptionConfigured(),
      // Which model currently powers the multi-agent analysis for this session.
      activeProvider: selection.provider,
      activeModel: selection.model,
    });
  });

  // Choose which model powers the multi-agent analysis for this session. The
  // built-in Claude is the default; a bring-your-own provider can only be picked
  // once its key is connected (enforced in the store).
  app.post(
    "/api/ai-providers/active",
    aiAnalysisSelectRateLimiter,
    validateCsrf,
    async (req, res) => {
      const body = setAnalysisModelSchema.safeParse(req.body);
      if (!body.success) {
        return res.status(400).json({ error: "Invalid analysis model selection." });
      }
      const sid = getSessionId(req, res);
      try {
        await setAnalysisSelection(sid, body.data.provider, body.data.model);
      } catch (err) {
        return res.status(400).json({
          error:
            (err as Error)?.message ??
            "Could not set the analysis model. Please try again.",
        });
      }
      const selection = await getAnalysisSelection(sid);
      res.json({
        activeProvider: selection.provider,
        activeModel: selection.model,
      });
    },
  );

  // Connect or replace a provider key. The key is validated live with the
  // provider before it is stored, so we never persist an unusable key.
  app.post(
    "/api/ai-providers/:provider",
    aiProviderRateLimiter,
    validateCsrf,
    async (req, res) => {
    const provider = providerSchema.safeParse(req.params.provider);
    if (!provider.success) {
      return res.status(400).json({ error: "Unknown provider." });
    }
    const body = connectSchema.safeParse(req.body);
    if (!body.success) {
      return res.status(400).json({ error: "Please paste a valid API key." });
    }
    if (!isEncryptionConfigured()) {
      return res.status(503).json({
        error:
          "Server encryption is not configured, so keys cannot be stored securely.",
      });
    }

    const validation = await validateProviderKey(
      provider.data as AiProvider,
      body.data.apiKey,
    );
    if (!validation.ok) {
      return res
        .status(400)
        .json({ error: validation.error ?? "The API key could not be verified." });
    }

      const sid = getSessionId(req, res);
      try {
        await saveProviderKey(sid, provider.data as AiProvider, body.data.apiKey);
      } catch (err) {
        console.error(
          "[ai-provider-routes] Failed to store key:",
          (err as Error)?.message,
        );
        return res
          .status(500)
          .json({ error: "Failed to store the key securely." });
      }

      const providers = await listProviderConnections(sid);
      res.json({ providers });
    },
  );

  // Disconnect a provider.
  app.delete("/api/ai-providers/:provider", validateCsrf, async (req, res) => {
    const provider = providerSchema.safeParse(req.params.provider);
    if (!provider.success) {
      return res.status(400).json({ error: "Unknown provider." });
    }
    const sid = getSessionId(req, res);
    try {
      await deleteProviderKey(sid, provider.data as AiProvider);
    } catch (err) {
      console.error(
        "[ai-provider-routes] Failed to delete key:",
        (err as Error)?.message,
      );
      return res
        .status(500)
        .json({ error: "Failed to remove the key. Please try again." });
    }
    // If analysis was pointed at this provider, revert to built-in Claude.
    await clearAnalysisSelectionForProvider(sid, provider.data as AiProvider);
    const [providers, selection] = await Promise.all([
      listProviderConnections(sid),
      getAnalysisSelection(sid),
    ]);
    res.json({
      providers,
      activeProvider: selection.provider,
      activeModel: selection.model,
    });
  });
}
