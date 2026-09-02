import { NextResponse } from "next/server";
import { checkRateLimit, rateLimitKey } from "@/lib/ai/rate-limit";

// Public API: watermark PDF (stub — in production use pdf-lib server side; for port showcase return hint)
export async function POST(req: Request) {
  const key = rateLimitKey(req);
  const rl = checkRateLimit(key, 10, 60_000);
  if (!rl.allowed) return NextResponse.json({ error: "Rate limit", code: "rate_limit" }, { status: 429 });

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "multipart/form-data required" }, { status: 400 });

  const file = form.get("file") as File | null;
  const text = (form.get("text") as string) ?? "CONFIDENTIAL";

  if (!file) return NextResponse.json({ error: "file required" }, { status: 400 });

  // For demo port: echo back metadata; real implementation would use pdf-lib to bake watermark.
  return NextResponse.json({
    message: "Watermark API stub — process locally in-browser for now. Server bake coming soon.",
    fileName: file.name,
    text,
    size: file.size,
    hint: "Use /pdf workspace with Watermark tool for WYSIWYG. This endpoint preserves API contract for MCP.",
  });
}
