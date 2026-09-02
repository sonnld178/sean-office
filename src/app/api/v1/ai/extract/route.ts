import { NextResponse } from "next/server";
import { gateway, AIError } from "@/lib/ai/gateway";
import { checkRateLimit, rateLimitKey } from "@/lib/ai/rate-limit";

const SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string" },
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          type: { type: "string", enum: ["task", "note", "decision"] },
        },
        required: ["title", "type"],
        additionalProperties: false,
      },
    },
  },
  required: ["summary", "items"],
  additionalProperties: false,
} as const;

export async function POST(req: Request) {
  const key = rateLimitKey(req);
  const rl = checkRateLimit(key, 10, 60_000);
  if (!rl.allowed) return NextResponse.json({ error: "Rate limit" }, { status: 429 });

  try {
    const body = (await req.json().catch(() => null)) as { content?: string } | null;
    if (!body?.content) return NextResponse.json({ error: "content required" }, { status: 400 });

    const result = await gateway({
      system: "Extract structured items from free-form text. Return summary + items.",
      user: body.content.slice(0, 4000),
      schema: { name: "extract", value: SCHEMA as unknown as Record<string, unknown> },
      temperature: 0.1,
    });

    const parsed = JSON.parse(result.content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""));
    return NextResponse.json({ ...parsed, provider: result.provider, provider_chain: result.provider_chain });
  } catch (e) {
    if (e instanceof AIError) return NextResponse.json({ error: e.message, code: e.code }, { status: e.code === "not_configured" ? 503 : 500 });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
