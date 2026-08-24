import { NextResponse } from "next/server";

/** S6: AI assist stub — Gemini via OpenRouter in production */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const { action } = body as { action?: string };

  if (!process.env.OPENROUTER_API_KEY) {
    return NextResponse.json(
      {
        error: "AI not configured",
        message: "Set OPENROUTER_API_KEY for Server mode AI (S6).",
        action,
      },
      { status: 503 }
    );
  }

  return NextResponse.json({
    action,
    result: "stub",
    model: "google/gemini-2.5-flash-lite",
  });
}
