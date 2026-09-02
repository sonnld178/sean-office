import "server-only";
import type { ProviderRequest, ProviderResult } from "./gemini";
import { AIError } from "./gemini";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const GATEWAY_URL = "https://ai-gateway.vercel.sh/v1/chat/completions";

export async function callGroq(
  req: ProviderRequest,
  env: { gatewayKey?: string; groqKey?: string }
): Promise<ProviderResult> {
  const key = env.gatewayKey ?? env.groqKey;
  if (!key) throw new AIError("Groq not configured.", "not_configured", false);

  const useGateway = !!env.gatewayKey;
  const url = useGateway ? GATEWAY_URL : GROQ_URL;
  // Groq compound-mini is free No-limit; via gateway use groq/compound-mini, direct use compound-mini etc.
  const model = useGateway ? "groq/compound-mini" : "compound-mini";

  const messages: Array<{ role: string; content: string | unknown[] }> = [
    { role: "system", content: req.system },
  ];
  if (req.imageBase64) {
    messages.push({
      role: "user",
      content: [
        { type: "text", text: req.user },
        {
          type: "image_url",
          image_url: {
            url: `data:${req.imageMimeType ?? "image/png"};base64,${req.imageBase64}`,
          },
        },
      ],
    });
  } else {
    messages.push({ role: "user", content: req.user });
  }

  const body: Record<string, unknown> = {
    messages,
    temperature: req.temperature ?? 0.1,
    max_tokens: req.maxTokens ?? 1200,
  };
  if (req.schema) {
    body.response_format = {
      type: "json_schema",
      json_schema: {
        name: req.schema.name,
        strict: true,
        schema: req.schema.value,
      },
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ...body, model }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new AIError(
        res.status === 429 ? "Groq rate limit." : `Groq error ${res.status}: ${text.slice(0, 300)}`,
        `http_${res.status}`,
        res.status === 429 || res.status >= 500,
        res.status
      );
    }
    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: ProviderResult["usage"];
      model?: string;
    };
    const content = json.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) {
      throw new AIError("Groq returned empty response.", "empty", true);
    }
    return { content, model: json.model ?? model, usage: json.usage };
  } catch (e) {
    if (e instanceof AIError) throw e;
    if (e instanceof Error && e.name === "AbortError") throw new AIError("Groq timed out.", "timeout", true);
    throw new AIError("Groq unavailable.", "network", true);
  } finally {
    clearTimeout(timer);
  }
}
