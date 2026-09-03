import "server-only";
import type { ProviderRequest, ProviderResult } from "./gemini";
import { AIError } from "./gemini";

/**
 * OmniRoute VPS provider — self-hosted OpenAI-compatible gateway (diegosouzapw/omniroute v3.8.50)
 * Default: http://187.52.126.101:20128 (KVM2 Malaysia, 2CPU/8GB + 2GB swap)
 * Works as OpenAI-compatible: POST {baseUrl}/v1/chat/completions
 */
export async function callOmniRoute(
  req: ProviderRequest,
  env: { omniBaseUrl?: string; omniKey?: string }
): Promise<ProviderResult> {
  const base = (env.omniBaseUrl ?? "http://187.52.126.101:20128").replace(/\/$/, "");
  const url = `${base}/v1/chat/completions`;
  // Model mapping for OmniRoute — try gemini first, fallback models configured in OmniRoute
  const model = "google/gemini-2.5-flash-lite";

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

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (env.omniKey) headers.Authorization = `Bearer ${env.omniKey}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ ...body, model }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      const isBusy =
        /serverbusy|overloaded|busy|rate limit|too many requests/i.test(text) ||
        res.status === 429 ||
        res.status === 503 ||
        res.status === 529;
      throw new AIError(
        isBusy ? `OmniRoute busy (${res.status}): ${text.slice(0, 200)}` : `OmniRoute error ${res.status}: ${text.slice(0, 300)}`,
        isBusy ? "server_busy" : `http_${res.status}`,
        isBusy || res.status === 429 || res.status >= 500,
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
      throw new AIError("OmniRoute returned empty response.", "empty", true);
    }
    return { content, model: json.model ?? model, usage: json.usage };
  } catch (e) {
    if (e instanceof AIError) throw e;
    if (e instanceof Error && e.name === "AbortError") throw new AIError("OmniRoute timed out.", "timeout", true);
    throw new AIError("OmniRoute unavailable.", "network", true);
  } finally {
    clearTimeout(timer);
  }
}
