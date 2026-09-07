import "server-only";
import { AIError } from "@/lib/ai/providers/gemini";

/**
 * Gemini text-embedding-004
 * Batch via batchEmbedContents (batch size 20), fallback to single embedContent.
 */
const GEMINI_EMBED_MODEL = "models/text-embedding-004";

export async function embedTexts(texts: string[], apiKey: string): Promise<number[][]> {
  if (!apiKey?.trim()) {
    throw new AIError("Gemini API key missing for embeddings.", "not_configured", false, 401);
  }
  const clean = texts.map((t) => t.trim()).filter(Boolean);
  if (!clean.length) return [];

  const out: number[][] = [];
  const batchSize = 20;

  for (let i = 0; i < clean.length; i += batchSize) {
    const batch = clean.slice(i, i + batchSize);
    try {
      const embs = await batchEmbed(batch, apiKey);
      out.push(...embs);
    } catch (e) {
      // fallback: try single embed per text in batch
      if (batch.length === 1) throw e;
      for (const t of batch) {
        const single = await singleEmbed(t, apiKey);
        out.push(single);
      }
    }
  }
  return out;
}

async function batchEmbed(texts: string[], apiKey: string): Promise<number[][]> {
  const url = `https://generativelanguage.googleapis.com/v1beta/${GEMINI_EMBED_MODEL}:batchEmbedContents?key=${encodeURIComponent(apiKey)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: texts.map((text) => ({
          model: GEMINI_EMBED_MODEL,
          content: { parts: [{ text }] },
        })),
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new AIError(
        res.status === 429 ? "Embedding rate limit." : `Embedding error ${res.status}: ${t.slice(0, 400)}`,
        `http_${res.status}`,
        res.status === 429 || res.status >= 500,
        res.status
      );
    }
    const json = (await res.json()) as {
      embeddings?: Array<{ values: number[] }>;
    };
    if (!json.embeddings || json.embeddings.length !== texts.length) {
      throw new AIError("Embedding returned mismatched count.", "malformed", true);
    }
    return json.embeddings.map((e) => e.values);
  } catch (e) {
    if (e instanceof AIError) throw e;
    if (e instanceof Error && e.name === "AbortError") throw new AIError("Embedding timed out.", "timeout", true);
    throw new AIError("Embedding unavailable.", "network", true);
  } finally {
    clearTimeout(timer);
  }
}

async function singleEmbed(text: string, apiKey: string): Promise<number[]> {
  const url = `https://generativelanguage.googleapis.com/v1beta/${GEMINI_EMBED_MODEL}:embedContent?key=${encodeURIComponent(apiKey)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: GEMINI_EMBED_MODEL,
        content: { parts: [{ text }] },
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new AIError(
        `Embedding error ${res.status}: ${t.slice(0, 400)}`,
        `http_${res.status}`,
        res.status === 429 || res.status >= 500,
        res.status
      );
    }
    const json = (await res.json()) as { embedding?: { values: number[] } };
    if (!json.embedding?.values) throw new AIError("Embedding empty.", "empty", true);
    return json.embedding.values;
  } catch (e) {
    if (e instanceof AIError) throw e;
    if (e instanceof Error && e.name === "AbortError") throw new AIError("Embedding timed out.", "timeout", true);
    throw new AIError("Embedding unavailable.", "network", true);
  } finally {
    clearTimeout(timer);
  }
}
