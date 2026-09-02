import "server-only";
import { aiGatewayEnv } from "@/lib/env";
import { callGemini, AIError, type ProviderRequest, type ProviderResult } from "./providers/gemini";
import { callGroq } from "./providers/groq";

export type FallbackResult = ProviderResult & { provider_chain: string[]; provider: string };

export async function completeWithFallback(req: ProviderRequest): Promise<FallbackResult> {
  const env = aiGatewayEnv();
  if (!env.hasKey) throw new AIError("AI is not configured. Set AI_GATEWAY_API_KEY.", "not_configured", false);

  const chain: string[] = [];
  const errors: string[] = [];

  // Try Gemini first (via gateway if available)
  try {
    chain.push("gemini");
    const r = await callGemini(req, env);
    return { ...r, provider_chain: [...chain], provider: "gemini" };
  } catch (e) {
    const err = e as AIError;
    errors.push(`gemini:${err.code}`);
    const retryable = err.retryable || err.code === "http_429" || err.status === 429 || (err.status ?? 0) >= 500;
    if (!retryable && err.code === "not_configured") {
      // fall through to groq if gemini not configured but groq is
    } else if (!retryable && chain.length === 1 && env.groqKey == null && !env.gatewayKey) {
      throw err;
    }
    // otherwise try groq
  }

  // Fallback Groq compound-mini (No limit free)
  try {
    chain.push("groq");
    const r = await callGroq(req, env);
    return { ...r, provider_chain: [...chain], provider: "groq" };
  } catch (e) {
    const err = e as AIError;
    errors.push(`groq:${err.code}`);
    throw new AIError(
      `All AI providers failed (${errors.join(", ")}): ${err.message}`,
      "all_failed",
      err.retryable,
      err.status
    );
  }
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
