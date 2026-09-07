import "server-only";
import { aiGatewayEnv } from "@/lib/env";
import { callGemini, AIError, type ProviderRequest, type ProviderResult } from "./providers/gemini";
import { callGroq } from "./providers/groq";

export type FallbackResult = ProviderResult & { provider_chain: string[]; provider: string };

function isRetryable(err: AIError): boolean {
  return (
    err.retryable ||
    err.code === "server_busy" ||
    err.code === "http_429" ||
    err.code === "http_402" ||
    err.code === "http_403" ||
    err.status === 429 ||
    err.status === 402 ||
    err.status === 403 ||
    err.status === 503 ||
    err.status === 529 ||
    (err.status ?? 0) >= 500
  );
}

export async function completeWithFallback(req: ProviderRequest): Promise<FallbackResult> {
  const env = aiGatewayEnv();
  if (!env.hasKey) throw new AIError("AI is not configured. Set AI_GATEWAY_API_KEY or GEMINI_API_KEY / GROQ_API_KEY.", "not_configured", false);

  const chain: string[] = [];
  const errors: string[] = [];

  // Order: Groq first for text-only tasks (higher free rate limit),
  // Gemini first for Vision. Any first-provider failure falls through
  // to the other (retryable or not).
  const order: Array<"groq" | "gemini"> =
    req.prefer === "groq" ? ["groq", "gemini"] : ["gemini", "groq"];

  for (const name of order) {
    try {
      chain.push(name);
      const r =
        name === "groq" ? await callGroq(req, env) : await callGemini(req, env);
      return { ...r, provider_chain: [...chain], provider: name };
    } catch (e) {
      const err = e as AIError;
      errors.push(`${name}:${err.code}`);
    }
  }

  const last = errors[errors.length - 1] ?? "unknown";
  throw new AIError(
    `All AI providers failed (${errors.join(", ")}): ${last}`,
    "all_failed",
    true
  );
}

export function parseJson<T>(content: string, fallback?: T): T {
  const cleaned = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    if (fallback !== undefined) return fallback;
    throw new AIError("AI returned malformed JSON.", "malformed", true);
  }
}
