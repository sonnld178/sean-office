import "server-only";
import { aiGatewayEnv } from "@/lib/env";
import { callGemini, AIError, type ProviderRequest, type ProviderResult } from "./providers/gemini";
import { callGroq } from "./providers/groq";
import { callOmniRoute } from "./providers/omniroute";

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
  if (!env.hasKey) throw new AIError("AI is not configured. Set OMNIROUTE_BASE_URL or AI_GATEWAY_API_KEY or GEMINI/GROQ keys.", "not_configured", false);

  const chain: string[] = [];
  const errors: string[] = [];

  // 1) OmniRoute VPS (free, self-host) — primary for demo, 2CPU/8GB KVM2
  if (env.omniBaseUrl) {
    try {
      chain.push("omniroute");
      const r = await callOmniRoute(req, env);
      return { ...r, provider_chain: [...chain], provider: "omniroute" };
    } catch (e) {
      const err = e as AIError;
      errors.push(`omniroute:${err.code}`);
      if (!isRetryable(err) && err.code !== "not_configured") throw err;
      // busy/429/402/5xx -> fallback
    }
  }

  // 2) Gemini via Gateway/direct
  try {
    chain.push("gemini");
    const r = await callGemini(req, env);
    return { ...r, provider_chain: [...chain], provider: "gemini" };
  } catch (e) {
    const err = e as AIError;
    errors.push(`gemini:${err.code}`);
    if (!isRetryable(err) && err.code === "not_configured") {
      // fall through
    } else if (!isRetryable(err) && chain.includes("omniroute") && !env.groqKey && !env.gatewayKey) {
      throw err;
    }
  }

  // 3) Groq compound-mini (No limit free) — final fallback
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
