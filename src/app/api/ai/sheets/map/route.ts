import { NextResponse } from "next/server";
import { gateway, AIError } from "@/lib/ai/gateway";
import { checkRateLimit, rateLimitKey } from "@/lib/ai/rate-limit";

const MAP_SCHEMA = {
  type: "object",
  properties: {
    mappings: {
      type: "array",
      items: {
        type: "object",
        properties: {
          source: { type: "string" },
          target: { type: "string" },
          transform: { type: "string", enum: ["none", "trim", "email", "phone", "date"] },
          confidence: { type: "number" },
          reason: { type: "string" },
        },
        required: ["source", "target", "transform"],
        additionalProperties: false,
      },
    },
  },
  required: ["mappings"],
  additionalProperties: false,
} as const;

export async function POST(req: Request) {
  const started = Date.now();
  const key = rateLimitKey(req);
  const rl = checkRateLimit(key, 10, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many AI requests. Please wait a moment.", code: "rate_limit" },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
    );
  }

  try {
    const body = (await req.json().catch(() => null)) as
      | { headers?: string[]; sampleRows?: Record<string, unknown>[]; targetHint?: string[] }
      | null;

    if (!body?.headers?.length) {
      return NextResponse.json({ error: "headers required", code: "bad_request" }, { status: 400 });
    }

    const headers = body.headers.slice(0, 30);
    const sampleRows = (body.sampleRows ?? []).slice(0, 3);
    const hint = body.targetHint?.length ? `Target fields hint: ${body.targetHint.join(", ")}` : "";

    const system = `You are a spreadsheet schema mapper. Given source column headers and sample rows, suggest mappings to clean target fields. Use transforms: none, trim, email (lowercase + trim), phone (keep digits/+), date (YYYY-MM-DD). Be conservative: confidence 0-1. Return only JSON per schema.`;
    const user = `Source headers: ${JSON.stringify(headers)}\nSample rows: ${JSON.stringify(sampleRows)}\n${hint}\n\nSuggest mappings: for each source header, pick a normalized target (snake_case, e.g. full_name, email, phone, dob) and transform. If unclear, use none and lower confidence.`;

    const result = await gateway({
      system,
      user,
      schema: { name: "sheets_map", value: MAP_SCHEMA as unknown as Record<string, unknown> },
      temperature: 0.1,
      maxTokens: 1200,
    });

    let parsed: { mappings: Array<{ source: string; target: string; transform: string; confidence?: number; reason?: string }> };
    try {
      parsed = JSON.parse(
        result.content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")
      );
    } catch {
      throw new AIError("AI returned malformed structured data.", "malformed", true);
    }

    const mappings = (parsed.mappings ?? []).filter(
      (m) => typeof m.source === "string" && typeof m.target === "string" && headers.includes(m.source)
    );

    return NextResponse.json({
      mappings,
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
