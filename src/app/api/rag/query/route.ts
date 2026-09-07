import { NextResponse } from "next/server";
import { embedTexts } from "@/lib/rag/embed";
import { searchChunks } from "@/lib/rag/search";
import { gateway, AIError } from "@/lib/ai/gateway";
import { checkRateLimit, rateLimitKey } from "@/lib/ai/rate-limit";

export async function POST(req: Request) {
  const started = Date.now();
  const key = rateLimitKey(req);
  const rl = checkRateLimit(key, 10, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests (10/min)", code: "rate_limit" },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
    );
  }

  const geminiKey = process.env.GEMINI_API_KEY?.trim();
  if (!geminiKey) {
    return NextResponse.json({ error: "GEMINI_API_KEY not configured", code: "not_configured" }, { status: 503 });
  }

  try {
    const body = (await req.json().catch(() => null)) as { question?: string; topK?: number } | null;
    const question = body?.question?.trim();
    const topK = Math.min(Math.max(body?.topK ?? 5, 1), 10);
    if (!question) return NextResponse.json({ error: "question required", code: "bad_request" }, { status: 400 });

    // Embed question
    const [qEmbedding] = await embedTexts([question], geminiKey);
    if (!qEmbedding) throw new AIError("Failed to embed question.", "empty", true);

    // Search both tables in parallel
    const [memoryHits, cvHits] = await Promise.all([
      searchChunks(qEmbedding, { table: "memory_chunks", topK, userKey: key }).catch(() => []),
      searchChunks(qEmbedding, { table: "cv_chunks", topK, userKey: key }).catch(() => []),
    ]);

    // Build context with citations like [memory:uuid:chunkIndex] or [cv:uuid:chunkIndex]
    const parts: string[] = [];
    if (memoryHits.length) {
      parts.push("Company memories:");
      for (const h of memoryHits) {
        const m = h as { memory_id: string; chunk_index: number; content: string; similarity: number };
        parts.push(`[memory:${m.memory_id}:${m.chunk_index}] ${m.content.slice(0, 900)}`);
      }
    }
    if (cvHits.length) {
      parts.push("\nCVs:");
      for (const h of cvHits) {
        const c = h as { cv_id: string; chunk_index: number; content: string; similarity: number };
        parts.push(`[cv:${c.cv_id}:${c.chunk_index}] ${c.content.slice(0, 900)}`);
      }
    }
    const context = parts.join("\n") || "(no matching memories/CVs yet — answer based on question only)";
    const citations = [
      ...memoryHits.map((h) => {
        const m = h as { memory_id: string; chunk_index: number; similarity: number };
        return { kind: "memory" as const, id: m.memory_id, chunk: m.chunk_index, similarity: m.similarity };
      }),
      ...cvHits.map((h) => {
        const c = h as { cv_id: string; chunk_index: number; similarity: number };
        return { kind: "cv" as const, id: c.cv_id, chunk: c.chunk_index, similarity: c.similarity };
      }),
    ];

    const system =
      "You are a company-aware CV screener. Answer based on company memory + CVs. Cite sources as [memory:id:chunk] or [cv:id:chunk]. Be neutral, rank only, don't auto-reject. Provide score 0-100 per CV with reason in Vietnamese. If no relevant context, say so but still attempt a helpful ranking.";
    const user = `Question: ${question}\n\nContext:\n${context}\n\nRespond in Vietnamese. At the end, list citations you used. If CVs present, rank them with score 0-100 and short reason per CV.`;

    const result = await gateway({
      system,
      user,
      temperature: 0.2,
      maxTokens: 1400,
      prefer: "groq",
    });

    // Try to extract scores as JSON array if model returned structured data
    let scores: Array<{ cvId?: string; score: number; reason: string }> = [];
    try {
      const cleaned = result.content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
      const maybe = JSON.parse(cleaned) as { scores?: typeof scores; answer?: string };
      if (Array.isArray(maybe.scores)) scores = maybe.scores;
    } catch {
      // not JSON — keep scores empty, answer is raw text
    }

    return NextResponse.json({
      answer: result.content,
      citations,
      scores,
      provider: result.provider,
      provider_chain: result.provider_chain,
      duration_ms: Date.now() - started,
    });
  } catch (e) {
    if (e instanceof AIError) {
      const status = e.code === "not_configured" ? 503 : e.code === "rate_limit" ? 429 : e.retryable ? 502 : 500;
      return NextResponse.json({ error: e.message, code: e.code, retryable: e.retryable }, { status });
    }
    const msg = e instanceof Error ? e.message : "Query failed";
    return NextResponse.json({ error: msg, code: "internal" }, { status: 500 });
  }
}
