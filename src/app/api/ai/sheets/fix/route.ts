import { NextResponse } from "next/server";
import { checkRateLimit, rateLimitKey } from "@/lib/ai/rate-limit";
import { enqueueJob, jobsConfigured, pumpQueue, type AiJobType } from "@/lib/ai/jobs";

const MAX_ISSUES_PER_JOB = 50;

export async function POST(req: Request) {
  const key = rateLimitKey(req);
  const rl = checkRateLimit(key, 10, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many AI requests. Please wait a moment.", code: "rate_limit" },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
    );
  }
  if (!jobsConfigured()) {
    return NextResponse.json(
      { error: "AI job queue is not configured (Supabase).", code: "not_configured" },
      { status: 503 }
    );
  }

  try {
    const body = (await req.json().catch(() => null)) as {
      column?: string;
      ruleId?: string;
      ruleLabel?: string;
      locale?: string;
      issues?: Array<{ rowIndex: number; column: string; value?: unknown; message?: string }>;
    } | null;

    if (!body?.column || !Array.isArray(body.issues) || !body.issues.length) {
      return NextResponse.json({ error: "column + issues[] required", code: "bad_request" }, { status: 400 });
    }
    const issues = body.issues
      .filter((i) => Number.isInteger(i.rowIndex) && typeof i.column === "string")
      .slice(0, MAX_ISSUES_PER_JOB);
    if (!issues.length) {
      return NextResponse.json({ error: "no valid issues", code: "bad_request" }, { status: 400 });
    }

    const job = await enqueueJob(key, "sheets_fix" satisfies AiJobType, {
      column: body.column,
      ruleId: body.ruleId ?? "",
      ruleLabel: body.ruleLabel ?? "",
      locale: body.locale === "vi" ? "vi" : "en",
      issues,
    });
    pumpQueue();
    return NextResponse.json({ jobId: job.id, token: job.token, position: job.position, etaMs: job.etaMs });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Internal error", code: "internal" },
      { status: 500 }
    );
  }
}
