import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { gateway } from "./gateway";

export type AiJobType = "sheets_fix" | "sheets_map" | "image_translate";
export type AiJobStatus = "queued" | "running" | "done" | "error";

export interface AiJob {
  id: string;
  user_key: string;
  type: AiJobType;
  payload: Record<string, unknown>;
  status: AiJobStatus;
  result: Record<string, unknown> | null;
  error: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

let adminClient: SupabaseClient | null | undefined;

function admin(): SupabaseClient | null {
  if (adminClient !== undefined) return adminClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  adminClient = url && key ? createClient(url, key) : null;
  return adminClient;
}

export function jobsConfigured(): boolean {
  return admin() !== null;
}

function newToken(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Enqueue a job; returns id + claim token + current position/ETA. */
export async function enqueueJob(
  userKey: string,
  type: AiJobType,
  payload: Record<string, unknown>
): Promise<{ id: string; token: string; position: number; etaMs: number }> {
  const db = admin();
  if (!db) throw new Error("Job queue is not configured (Supabase).");
  const token = newToken();
  const { data, error } = await db
    .from("ai_jobs")
    .insert({ user_key: userKey, type, payload: { ...payload, _token: token } })
    .select("id")
    .single();
  if (error || !data) throw new Error(`Enqueue failed: ${error?.message ?? "unknown"}`);
  const pos = await queuePosition(data.id as string);
  return { id: data.id as string, token, position: pos.position, etaMs: pos.etaMs };
}

export interface JobView {
  id: string;
  type: AiJobType;
  status: AiJobStatus;
  result: Record<string, unknown> | null;
  error: string | null;
  position: number;
  etaMs: number;
}

/** Fetch a job only when the claim token matches (payload._token). */
export async function getJobView(id: string, token: string): Promise<JobView | null> {
  const db = admin();
  if (!db) return null;
  const { data, error } = await db.from("ai_jobs").select("*").eq("id", id).single();
  if (error || !data) return null;
  const job = data as AiJob & { payload: Record<string, unknown> };
  if (job.payload?._token !== token) return null;
  const { payload: _drop, ...rest } = job;
  void _drop;
  const pos = await queuePosition(id);
  return {
    id: rest.id,
    type: rest.type,
    status: rest.status,
    result: rest.result,
    error: rest.error,
    position: pos.position,
    etaMs: pos.etaMs,
  };
}

async function avgDurationMs(type: AiJobType): Promise<number> {
  const db = admin();
  if (!db) return 8000;
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { data } = await db
    .from("ai_jobs")
    .select("started_at, finished_at")
    .eq("type", type)
    .eq("status", "done")
    .gte("finished_at", since)
    .order("finished_at", { ascending: false })
    .limit(20);
  const rows = (data ?? []) as Array<{ started_at: string | null; finished_at: string | null }>;
  const durs = rows
    .filter((r) => r.started_at && r.finished_at)
    .map((r) => Date.parse(r.finished_at!) - Date.parse(r.started_at!))
    .filter((d) => d > 0 && d < 300_000);
  if (!durs.length) return 8000;
  return Math.round(durs.reduce((a, b) => a + b, 0) / durs.length);
}

/** Jobs ahead in the global FIFO queue + ETA estimate. */
export async function queuePosition(jobId: string): Promise<{ position: number; etaMs: number }> {
  const db = admin();
  if (!db) return { position: 0, etaMs: 0 };
  const { data } = await db.from("ai_jobs").select("id, created_at, status, type").eq("id", jobId).single();
  if (!data) return { position: 0, etaMs: 0 };
  const job = data as { created_at: string; status: AiJobStatus; type: AiJobType };
  if (job.status === "done" || job.status === "error") return { position: 0, etaMs: 0 };
  const { count } = await db
    .from("ai_jobs")
    .select("id", { count: "exact", head: true })
    .eq("status", "queued")
    .lt("created_at", job.created_at);
  const ahead = count ?? 0;
  const avg = await avgDurationMs(job.type);
  const runningBonus = job.status === "queued" ? avg / 2 : 0;
  return { position: ahead, etaMs: Math.round(ahead * avg + runningBonus) };
}

// ---------------------------------------------------------------------------
// In-process FIFO worker. Triggered (not awaited) after each enqueue.
// NOTE: on serverless (Vercel) the process may freeze between requests; for a
// constantly-running host (VPS/local) this is a correct sequential worker.
// A dedicated worker (cron/queue consumer) is the production upgrade path.
// ---------------------------------------------------------------------------
let pumping = false;

export function pumpQueue(): void {
  void runPump().catch(() => undefined);
}

async function runPump(): Promise<void> {
  const db = admin();
  if (!db || pumping) return;
  pumping = true;
  try {
    for (;;) {
      const { data } = await db
        .from("ai_jobs")
        .select("id")
        .eq("status", "queued")
        .order("created_at", { ascending: true })
        .limit(1)
        .single();
      const next = data as { id: string } | null;
      if (!next) break;
      // Claim: only transition queued -> running (avoids double-run).
      const claimed = await db
        .from("ai_jobs")
        .update({ status: "running", started_at: new Date().toISOString() })
        .eq("id", next.id)
        .eq("status", "queued")
        .select("id, type, payload");
      const row = (claimed.data?.[0] ?? null) as {
        id: string;
        type: AiJobType;
        payload: Record<string, unknown>;
      } | null;
      if (!row) continue;
      try {
        const result = await runJob(row.type, row.payload);
        await db
          .from("ai_jobs")
          .update({ status: "done", result, finished_at: new Date().toISOString() })
          .eq("id", row.id);
      } catch (e) {
        await db
          .from("ai_jobs")
          .update({
            status: "error",
            error: e instanceof Error ? e.message.slice(0, 500) : "Job failed",
            finished_at: new Date().toISOString(),
          })
          .eq("id", row.id);
      }
    }
  } finally {
    pumping = false;
  }
}

const FIX_SCHEMA = {
  type: "object",
  properties: {
    fixes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          rowIndex: { type: "number" },
          column: { type: "string" },
          action: { type: "string", enum: ["set", "delete_row", "keep"] },
          newValue: { type: "string" },
          reason: { type: "string" },
        },
        required: ["rowIndex", "column", "action"],
        additionalProperties: false,
      },
    },
  },
  required: ["fixes"],
  additionalProperties: false,
} as const;

export interface RawFix {
  rowIndex: number;
  column: string;
  action: string;
  newValue?: string;
  reason?: string;
}

/** Normalize model output: accept {fixes:[...]} or a bare array; drop rows not in the issue set. */
export function normalizeFixes(content: string, validRowIndexes: number[]): RawFix[] {
  const cleaned = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const raw = JSON.parse(cleaned) as { fixes?: RawFix[] } | RawFix[];
  // Some models (Groq json_object) return a bare array instead of {fixes}.
  const list = Array.isArray(raw) ? raw : (raw.fixes ?? []);
  const valid = new Set(validRowIndexes);
  return list
    .filter((f) => f && valid.has(f.rowIndex) && typeof f.column === "string")
    .slice(0, validRowIndexes.length);
}

async function runJob(
  type: AiJobType,
  payload: Record<string, unknown>
): Promise<Record<string, unknown>> {
  if (type !== "sheets_fix") throw new Error(`Unknown job type: ${type}`);
  const issues = (payload.issues ?? []) as Array<{
    rowIndex: number;
    column: string;
    value: unknown;
    message: string;
  }>;
  const locale = (payload.locale as string) === "vi" ? "vi" : "en";
  const reasonLang = locale === "vi" ? "Vietnamese" : "English";
  const result = await gateway({
    system: `You fix spreadsheet data quality issues. REPAIR-FIRST: Always try "set" (provide corrected newValue) first; use "delete_row" ONLY when the value is truly unsalvageable (e.g. "not-an-email" with no @ at all, empty required cell, exact duplicate). Use "keep" for false positives. Copy rowIndex and column EXACTLY. Normalize: email uppercase/with spaces -> lowercase trimmed; phone like "84123..." or "+84 901 234 567" -> "0901234567" (Vietnamese 0 + 9 digits); date "01/02/2024" -> "2024-02-01"; name with extra spaces -> collapsed single spaces. Write "reason" in ${reasonLang}, short (max 12 words). For empty values, use "${locale === "vi" ? "Hàng trống, không có dữ liệu" : "Empty, no data"}" as reason. IMPORTANT: return a JSON OBJECT shaped {"fixes": [...]}, never a bare array. Return only JSON.`,
    user: `Column: ${payload.column}\nRule: ${payload.ruleLabel}\nIssues: ${JSON.stringify(issues).slice(0, 6000)}`,
    schema: { name: "sheets_fix", value: FIX_SCHEMA as unknown as Record<string, unknown> },
    temperature: 0.1,
    maxTokens: 2000,
    prefer: "groq",
  });
  const fixes = normalizeFixes(result.content, issues.map((i) => i.rowIndex));
  return { fixes, provider: result.provider, provider_chain: result.provider_chain };
}
