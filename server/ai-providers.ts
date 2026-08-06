import type { AiProvider } from "@shared/schema";

// Lightweight, dependency-free validation of user-supplied API keys. We hit a
// cheap, read-only endpoint on each provider over plain REST (Node's global
// fetch) so no extra SDKs / tech stack are pulled in. A key is only persisted
// after the provider confirms it is usable.

const VALIDATION_TIMEOUT_MS = 10_000;

export interface ProviderValidationResult {
  ok: boolean;
  error?: string;
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), VALIDATION_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

export async function validateProviderKey(
  provider: AiProvider,
  apiKey: string,
): Promise<ProviderValidationResult> {
  try {
    if (provider === "openai") {
      const res = await fetchWithTimeout("https://api.openai.com/v1/models", {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (res.ok) return { ok: true };
      if (res.status === 401) {
        return {
          ok: false,
          error: "That OpenAI API key was rejected. Double-check it and try again.",
        };
      }
      return {
        ok: false,
        error: `OpenAI could not verify the key (HTTP ${res.status}).`,
      };
    }

    if (provider === "gemini") {
      // Send the key via header (not the URL query string) so it is not
      // captured in provider/intermediate request logs.
      const res = await fetchWithTimeout(
        "https://generativelanguage.googleapis.com/v1beta/models",
        { headers: { "x-goog-api-key": apiKey } },
      );
      if (res.ok) return { ok: true };
      if (res.status === 400 || res.status === 401 || res.status === 403) {
        return {
          ok: false,
          error: "That Gemini API key was rejected. Double-check it and try again.",
        };
      }
      return {
        ok: false,
        error: `Gemini could not verify the key (HTTP ${res.status}).`,
      };
    }

    return { ok: false, error: "Unsupported provider." };
  } catch (err) {
    const aborted = (err as Error)?.name === "AbortError";
    return {
      ok: false,
      error: aborted
        ? "Timed out reaching the provider. Please try again."
        : "Could not reach the provider to verify the key.",
    };
  }
}
