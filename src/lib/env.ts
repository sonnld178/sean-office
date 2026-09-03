import "server-only";

function optional(name: string): string | undefined {
  const v = process.env[name]?.trim();
  return v || undefined;
}

export function appUrl(): string {
  return optional("NEXT_PUBLIC_APP_URL") ?? "http://localhost:3000";
}

/**
 * AI Gateway env — OmniRoute VPS + Vercel AI Gateway + direct provider keys.
 * Priority: OMNIROUTE (VPS 187.52.126.101:20128) -> AI_GATEWAY_API_KEY -> GEMINI/GROQ direct.
 */
export interface AiGatewayEnv {
  omniBaseUrl?: string;
  omniKey?: string;
  gatewayKey?: string;
  geminiKey?: string;
  groqKey?: string;
  deepseekKey?: string;
  hfToken?: string;
  hasKey: boolean;
}

export function aiGatewayEnv(): AiGatewayEnv {
  const omniBaseUrl = optional("OMNIROUTE_BASE_URL") ?? optional("OMNI_BASE_URL");
  const omniKey = optional("OMNIROUTE_API_KEY") ?? optional("OMNI_API_KEY");
  const gatewayKey = optional("AI_GATEWAY_API_KEY");
  const geminiKey = optional("GEMINI_API_KEY");
  const groqKey = optional("GROQ_API_KEY");
  const deepseekKey = optional("DEEPSEEK_API_KEY");
  const hfToken = optional("HF_TOKEN");

  // Legacy fallback: OPENROUTER_API_KEY can act as gateway if present
  const legacyOpenrouter = optional("OPENROUTER_API_KEY");

  const hasKey =
    !!omniBaseUrl || !!omniKey || !!gatewayKey || !!geminiKey || !!groqKey || !!legacyOpenrouter;

  return {
    omniBaseUrl: omniBaseUrl ?? "http://187.52.126.101:20128",
    omniKey,
    gatewayKey: gatewayKey ?? legacyOpenrouter,
    geminiKey,
    groqKey,
    deepseekKey,
    hfToken,
    hasKey,
  };
}

export function requireAiGatewayEnv(): AiGatewayEnv {
  const env = aiGatewayEnv();
  if (!env.hasKey) throw new Error("AI is not configured. Set AI_GATEWAY_API_KEY or GEMINI_API_KEY/GROQ_API_KEY.");
  return env;
}
