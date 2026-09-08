import { NextResponse } from "next/server";
import { getJobView, jobsConfigured, pumpQueue } from "@/lib/ai/jobs";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!jobsConfigured()) {
    return NextResponse.json({ error: "Job queue not configured.", code: "not_configured" }, { status: 503 });
  }
  const { id } = await ctx.params;
  const token = new URL(req.url).searchParams.get("token") ?? "";
  if (!id || !token) {
    return NextResponse.json({ error: "id + token required", code: "bad_request" }, { status: 400 });
  }
  const view = await getJobView(id, token);
  if (!view) return NextResponse.json({ error: "Job not found", code: "not_found" }, { status: 404 });
  // Wake worker on Vercel serverless (process may have frozen between requests)
  pumpQueue();
  return NextResponse.json(view);
}
