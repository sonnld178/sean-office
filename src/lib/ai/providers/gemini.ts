import "server-only";

export type ProviderRequest = {
  system: string;
  user: string;
  schema?: { name: string; value: Record<string, unknown> };
  temperature?: number;
  maxTokens?: number;
  imageBase64?: string;
  imageMimeType?: string;
};

export type ProviderResult = {
  content: string;
  model: string;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
};

export class AIError extends Error {
  constructor(
    message: string,
    public code: string,
    public retryable = false,
    public status?: number
  ) {
    super(message);
  }
}

const GATEWAY_URL = "https://ai-gateway.vercel.sh/v1/chat/completions";

async function callOpenAICompatible(opts: {
  url: string;
  key: string;
  model: string;
  body: Record<string, unknown>;
  timeoutMs?: number;
}): Promise<ProviderResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 20000);
  try {
    const res = await fetch(opts.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${opts.key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ...opts.body, model: opts.model }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      const retryable = res.status === 429 || res.status >= 500;
      throw new AIError(
        res.status === 429
          ? "AI rate limit reached. Trying fallback..."
          : `AI provider error (${res.status}): ${text.slice(0, 300)}`,
        `http_${res.status}`,
        retryable,
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
      throw new AIError("AI returned empty response.", "empty", true);
    }
    return { content, model: json.model ?? opts.model, usage: json.usage };
  } catch (e) {
    if (e instanceof AIError) throw e;
    if (e instanceof Error && e.name === "AbortError")
      throw new AIError("AI request timed out.", "timeout", true);
    throw new AIError("AI service temporarily unavailable.", "network", true);
  } finally {
    clearTimeout(timer);
  }
}

export async function callGemini(
  req: ProviderRequest,
  env: { gatewayKey?: string; geminiKey?: string }
): Promise<ProviderResult> {
  // Prefer gateway (OpenAI-compatible) with gemini model
  if (env.gatewayKey) {
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
    return callOpenAICompatible({
      url: GATEWAY_URL,
      key: env.gatewayKey,
      model: "google/gemini-2.5-flash-lite",
      body,
    });
  }

  // Direct Gemini API fallback (Generative Language API)
  if (!env.geminiKey) throw new AIError("Gemini not configured.", "not_configured", false);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${env.geminiKey}`;
    const parts: unknown[] = [{ text: `${req.system}\n\n${req.user}` }];
    if (req.imageBase64) {
      parts.push({
        inlineData: {
          mimeType: req.imageMimeType ?? "image/png",
          data: req.imageBase64,
        },
      });
    }
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: {
          temperature: req.temperature ?? 0.1,
          maxOutputTokens: req.maxTokens ?? 1200,
          responseMimeType: req.schema ? "application/json" : "text/plain",
          ...(req.schema ? { responseSchema: req.schema.value } : {}),
        },
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new AIError(
        res.status === 429 ? "Gemini rate limit." : `Gemini error ${res.status}: ${t.slice(0, 300)}`,
        `http_${res.status}`,
        res.status === 429 || res.status >= 500,
        res.status
      );
    }
    const json = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
    };
    const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new AIError("Gemini returned empty response.", "empty", true);
    return {
      content: text,
      model: "google/gemini-2.5-flash-lite",
      usage: json.usageMetadata
        ? {
            prompt_tokens: json.usageMetadata.promptTokenCount,
            completion_tokens: json.usageMetadata.candidatesTokenCount,
          }
        : undefined,
    };
  } catch (e) {
    if (e instanceof AIError) throw e;
    if (e instanceof Error && e.name === "AbortError") throw new AIError("Gemini timed out.", "timeout", true);
    throw new AIError("Gemini unavailable.", "network", true);
  } finally {
    clearTimeout(timer);
  }
}
