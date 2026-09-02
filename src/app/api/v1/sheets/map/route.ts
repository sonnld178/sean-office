import { NextResponse } from "next/server";
import { gateway, AIError } from "@/lib/ai/gateway";
import { checkRateLimit, rateLimitKey } from "@/lib/ai/rate-limit";

// Public API v1 — same logic as /api/ai/sheets/map but public, no auth, rate limited
const SCHEMA = {
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
  const key = rateLimitKey(req);
  const rl = checkRateLimit(key, 10, 60_000);
  if (!rl.allowed) return NextResponse.json({ error: "Rate limit", code: "rate_limit" }, { status: 429 });

  try {
    const body = (await req.json().catch(() => null)) as { headers?: string[]; sampleRows?: Record<string, unknown>[] } | null;
    if (!body?.headers?.length) return NextResponse.json({ error: "headers required" }, { status: 400 });

    const result = await gateway({
      system: "You are a spreadsheet schema mapper. Suggest target fields (snake_case) and transforms.",
      user: `Headers: ${JSON.stringify(body.headers)}\nRows: ${JSON.stringify((body.sampleRows ?? []).slice(0, 3))}`,
      schema: { name: "v1_sheets_map", value: SCHEMA as unknown as Record<string, unknown> },
      temperature: 0.1,
    });

    const parsed = JSON.parse(result.content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""));
    return NextResponse.json({ ...parsed, provider: result.provider, provider_chain: result.provider_chain });
  } catch (e) {
    if (e instanceof AIError) return NextResponse.json({ error: e.message, code: e.code }, { status: e.code === "not_configured" ? 503 : 500 });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
