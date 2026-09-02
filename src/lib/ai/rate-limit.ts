import "server-only";

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

/**
 * Simple in-memory rate limit (10 req/min per key) — mirrors day-frame ai_runs pattern.
 * For production with Supabase, replace with DB-backed count.
 */
export function checkRateLimit(
  key: string,
  limit = 10,
  windowMs = 60_000
): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const cur = buckets.get(key);
  if (!cur || now >= cur.resetAt) {
    const resetAt = now + windowMs;
    buckets.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: limit - 1, resetAt };
  }
  if (cur.count >= limit) {
    return { allowed: false, remaining: 0, resetAt: cur.resetAt };
  }
  cur.count += 1;
  return { allowed: true, remaining: limit - cur.count, resetAt: cur.resetAt };
}

export function rateLimitKey(req: Request, fallbackIp = "anon"): string {
  const fwd = req.headers.get("x-forwarded-for");
  const ip = fwd?.split(",")[0]?.trim() || fallbackIp;
  return `ai:${ip}`;
}
