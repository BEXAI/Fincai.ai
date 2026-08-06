import { getModelConfig } from "./config/claudeConfig";
import {
  PROVIDER_MODELS,
  isAllowedModel,
  type AiProvider,
} from "@shared/schema";
import { getProviderKey, getAnalysisSelection } from "./ai-provider-store";

// Dependency-free, multi-provider text completion layer for the multi-agent
// ANALYSIS system. OpenAI and Gemini are called over plain REST (Node's global
// fetch) so no extra SDKs are pulled in — consistent with the live key
// validation in ai-providers.ts. The built-in Claude provider is handled inside
// anthropic.ts (which owns the shared Anthropic client); this module only builds
// the bring-your-own-key callers and resolves which one a session should use.

const COMPLETION_TIMEOUT_MS = 30_000;

export interface CompletionRequest {
  prompt: string;
  system?: string;
  maxTokens?: number;
  temperature?: number;
}

// A provider-agnostic "send this prompt, get text back" function. Agents call
// this without caring which model is behind it.
export type CompletionFn = (req: CompletionRequest) => Promise<string>;

// Describes which model actually produced an analysis, surfaced to the UI.
export interface AnalysisProviderMeta {
  provider: "claude" | "openai" | "gemini";
  model: string;
  label: string;
  // true when a bring-your-own provider was selected but we had to fall back to
  // the built-in Claude (e.g. the key was removed or could not be decrypted).
  fallbackUsed?: boolean;
}

export const PROVIDER_LABELS: Record<AiProvider, string> = {
  openai: "OpenAI",
  gemini: "Google Gemini",
};

// Robustly pull a single JSON object out of a model response: strips markdown
// code fences, then extracts the first {...} block and parses it. Returns null
// when nothing parseable is found (callers fall back to a neutral signal).
export function extractJsonObject<T = any>(text: string): T | null {
  if (!text) return null;
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  const match = t.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]) as T;
  } catch {
    return null;
  }
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), COMPLETION_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

// Retry once on transient errors (429 / 5xx); everything else fails fast. Errors
// never include the API key.
async function withTransientRetry(
  fn: () => Promise<Response>,
): Promise<Response> {
  let res = await fn();
  if (res.status === 429 || res.status >= 500) {
    await new Promise((r) => setTimeout(r, 800));
    res = await fn();
  }
  return res;
}

function makeOpenAiCompleter(model: string, apiKey: string): CompletionFn {
  return async ({ prompt, system, maxTokens, temperature }) => {
    const messages: Array<{ role: string; content: string }> = [];
    if (system) messages.push({ role: "system", content: system });
    messages.push({ role: "user", content: prompt });

    const res = await withTransientRetry(() =>
      fetchWithTimeout("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages,
          max_tokens: maxTokens ?? 600,
          temperature: temperature ?? 0.2,
          // Our agent prompts all request a strict JSON object.
          response_format: { type: "json_object" },
        }),
      }),
    );

    if (!res.ok) {
      throw new Error(`OpenAI request failed (HTTP ${res.status}).`);
    }
    const data: any = await res.json();
    return data?.choices?.[0]?.message?.content ?? "";
  };
}

function makeGeminiCompleter(model: string, apiKey: string): CompletionFn {
  return async ({ prompt, system, maxTokens, temperature }) => {
    const body: any = {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: temperature ?? 0.2,
        maxOutputTokens: maxTokens ?? 600,
        responseMimeType: "application/json",
      },
    };
    if (system) {
      body.systemInstruction = { parts: [{ text: system }] };
    }

    const res = await withTransientRetry(() =>
      fetchWithTimeout(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
          model,
        )}:generateContent`,
        {
          method: "POST",
          // Key travels in the header (not the URL) so it is not captured in logs.
          headers: {
            "x-goog-api-key": apiKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        },
      ),
    );

    if (!res.ok) {
      throw new Error(`Gemini request failed (HTTP ${res.status}).`);
    }
    const data: any = await res.json();
    const parts: any[] = data?.candidates?.[0]?.content?.parts ?? [];
    return parts.map((p) => p?.text ?? "").join("");
  };
}

export function makeProviderCompleter(
  provider: AiProvider,
  model: string,
  apiKey: string,
): CompletionFn {
  return provider === "openai"
    ? makeOpenAiCompleter(model, apiKey)
    : makeGeminiCompleter(model, apiKey);
}

export interface ResolvedAnalysisLlm {
  // undefined => caller should use its built-in Claude completer.
  completer?: CompletionFn;
  meta: AnalysisProviderMeta;
}

function claudeMeta(fallbackUsed = false): AnalysisProviderMeta {
  return {
    provider: "claude",
    model: getModelConfig().model,
    label: "Built-in (Claude)",
    ...(fallbackUsed ? { fallbackUsed: true } : {}),
  };
}

// Resolve which model powers analysis for a session. Identity comes only from
// the server-issued session id; falls back safely to built-in Claude whenever a
// selected bring-your-own key is missing or unusable.
export async function resolveAnalysisLlm(
  sessionId: string,
): Promise<ResolvedAnalysisLlm> {
  const selection = await getAnalysisSelection(sessionId);
  if (selection.provider === "claude") {
    return { meta: claudeMeta() };
  }

  const provider = selection.provider as AiProvider;
  const key = await getProviderKey(sessionId, provider);
  if (!key) {
    // Selected a BYO provider but the key is gone — transparently use Claude.
    return { meta: claudeMeta(true) };
  }

  const model =
    selection.model && isAllowedModel(provider, selection.model)
      ? selection.model
      : PROVIDER_MODELS[provider].default;

  return {
    completer: makeProviderCompleter(provider, model, key),
    meta: {
      provider,
      model,
      label: `${PROVIDER_LABELS[provider]} · ${model}`,
    },
  };
}
