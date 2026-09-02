import { NextResponse } from "next/server";
import { gateway, AIError } from "@/lib/ai/gateway";
import { checkRateLimit, rateLimitKey } from "@/lib/ai/rate-limit";

const TRANSLATE_SCHEMA = {
  type: "object",
  properties: {
    detected_text: { type: "string" },
    translated_text: { type: "string" },
    blocks: {
      type: "array",
      items: {
        type: "object",
        properties: {
          original: { type: "string" },
          translated: { type: "string" },
        },
        required: ["original", "translated"],
        additionalProperties: false,
      },
    },
  },
  required: ["detected_text", "translated_text"],
  additionalProperties: false,
} as const;

export async function POST(req: Request) {
  const started = Date.now();
  const key = rateLimitKey(req);
  const rl = checkRateLimit(key, 10, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many AI requests. Please wait.", code: "rate_limit" },
      { status: 429 }
    );
  }

  try {
    let imageBase64: string | null = null;
    let mimeType = "image/png";
    let targetLang = "vi";
    let sourceLang = "auto";

    const contentType = req.headers.get("content-type") ?? "";

    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file") as File | null;
      targetLang = (form.get("targetLang") as string) ?? "vi";
      sourceLang = (form.get("sourceLang") as string) ?? "auto";
      if (!file) {
        return NextResponse.json({ error: "file required", code: "bad_request" }, { status: 400 });
      }
      const buf = Buffer.from(await file.arrayBuffer());
      if (buf.length > 6 * 1024 * 1024) {
        return NextResponse.json({ error: "Image too large (max 6MB)", code: "too_large" }, { status: 413 });
      }
      imageBase64 = buf.toString("base64");
      mimeType = file.type || "image/png";
    } else {
      const body = (await req.json().catch(() => null)) as {
        imageBase64?: string;
        mimeType?: string;
        targetLang?: string;
        sourceLang?: string;
      } | null;
      if (!body?.imageBase64) {
        return NextResponse.json({ error: "imageBase64 required", code: "bad_request" }, { status: 400 });
      }
      imageBase64 = body.imageBase64;
      mimeType = body.mimeType ?? "image/png";
      targetLang = body.targetLang ?? "vi";
      sourceLang = body.sourceLang ?? "auto";
    }

    const langName = targetLang === "vi" ? "Vietnamese" : targetLang === "en" ? "English" : targetLang;
    const system = `You are an image OCR + translator. Read all visible text in the image and translate it to ${langName}. Preserve numbers, names, layout cues. Return JSON per schema.`;
    const user =
      sourceLang === "auto"
        ? `Detect the source language and translate all text to ${langName}. If no text, return empty strings.`
        : `Translate from ${sourceLang} to ${langName}.`;

    const result = await gateway({
      system,
      user,
      imageBase64: imageBase64!,
      imageMimeType: mimeType,
      schema: { name: "image_translate", value: TRANSLATE_SCHEMA as unknown as Record<string, unknown> },
      temperature: 0.1,
      maxTokens: 1400,
    });

    let parsed: { detected_text: string; translated_text: string; blocks?: Array<{ original: string; translated: string }> };
    try {
      parsed = JSON.parse(result.content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""));
    } catch {
      throw new AIError("AI returned malformed translation data.", "malformed", true);
    }

    return NextResponse.json({
      detected_text: parsed.detected_text ?? "",
      translated_text: parsed.translated_text ?? "",
      blocks: parsed.blocks ?? [],
      targetLang,
      provider: result.provider,
      provider_chain: result.provider_chain,
      duration_ms: Date.now() - started,
    });
  } catch (e) {
    if (e instanceof AIError) {
      const status = e.code === "not_configured" ? 503 : e.code === "rate_limit" ? 429 : e.retryable ? 502 : 500;
      return NextResponse.json({ error: e.message, code: e.code, retryable: e.retryable }, { status });
    }
    return NextResponse.json({ error: "Internal error", code: "internal" }, { status: 500 });
  }
}
