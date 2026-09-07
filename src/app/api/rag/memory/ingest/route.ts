import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { chunkText } from "@/lib/rag/chunk";
import { embedTexts } from "@/lib/rag/embed";
import { checkRateLimit, rateLimitKey } from "@/lib/ai/rate-limit";
import { AIError } from "@/lib/ai/providers/gemini";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new Error("Supabase not configured");
  return createClient(url, key);
}

async function extractTextFromFile(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  const buf = await file.arrayBuffer();
  if (name.endsWith(".pdf")) {
    try {
      // Server-side pdf text extraction via pdfjs-dist (legacy)
      const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
      // Disable worker in Node
      if ((pdfjs as unknown as { GlobalWorkerOptions?: { workerSrc: string } }).GlobalWorkerOptions) {
        (pdfjs as unknown as { GlobalWorkerOptions: { workerSrc: string } }).GlobalWorkerOptions.workerSrc = "";
      }
      const doc = await (pdfjs as unknown as { getDocument: (o: unknown) => { promise: Promise<unknown> } }).getDocument({
        data: new Uint8Array(buf),
        useWorkerFetch: false,
        isEvalSupported: false,
      }).promise as unknown as {
        numPages: number;
        getPage: (n: number) => Promise<{ getTextContent: () => Promise<{ items: Array<{ str?: string }> }> }>;
        destroy: () => Promise<void>;
      };
      let text = "";
      for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i);
        const content = await page.getTextContent();
        text += content.items.map((it) => ("str" in it ? (it.str ?? "") : "")).join(" ") + "\n";
      }
      await doc.destroy().catch(() => undefined);
      if (text.trim()) return text;
    } catch {
      // fallback: treat as binary -> decode
    }
  }
  if (name.endsWith(".docx")) {
    try {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ arrayBuffer: buf });
      if (result.value?.trim()) return result.value;
    } catch {
      // fall through
    }
  }
  // txt, csv, md, json, etc. decode as utf-8
  try {
    const dec = new TextDecoder("utf-8");
    return dec.decode(new Uint8Array(buf));
  } catch {
    return "";
  }
}

export async function POST(req: Request) {
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

  let supabase;
  try {
    supabase = getSupabase();
  } catch {
    return NextResponse.json({ error: "Supabase not configured", code: "not_configured" }, { status: 503 });
  }

  try {
    const form = await req.formData();
    const file = form.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "file required", code: "bad_request" }, { status: 400 });
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "File too large (max 10MB)", code: "too_large" }, { status: 413 });
    }
    if (file.size === 0) return NextResponse.json({ error: "Empty file", code: "bad_request" }, { status: 400 });

    const text = await extractTextFromFile(file);
    if (!text.trim()) {
      return NextResponse.json(
        { error: "No extractable text. Try TXT/CSV or DOCX with text.", code: "no_text" },
        { status: 400 }
      );
    }

    const chunks = chunkText(text, { chunkTokens: 500, overlap: 50 });
    if (!chunks.length) return NextResponse.json({ error: "No chunks", code: "no_chunks" }, { status: 400 });

    // Embed
    const embeddings = await embedTexts(chunks, geminiKey);

    // Insert company_memories
    // user_key = rateLimitKey (ai:ip) -> store as-is for per-IP isolation
    const { data: mem, error: memErr } = await supabase
      .from("company_memories")
      .insert({ user_key: key, file_name: file.name })
      .select("id")
      .single();
    if (memErr || !mem) throw new Error(memErr?.message ?? "insert memory failed");
    const memoryId = (mem as { id: string }).id;

    const rows = chunks.map((c, i) => ({
      memory_id: memoryId,
      chunk_index: i,
      content: c,
      embedding: embeddings[i] ?? null,
    }));

    // Insert in batches (pgvector up to maybe 100 per insert)
    for (let i = 0; i < rows.length; i += 50) {
      const batch = rows.slice(i, i + 50).map((r) => ({
        ...r,
        // supabase-js serializes number[] as vector string via toString? keep as array
        embedding: r.embedding ? (`[${(r.embedding as unknown as number[]).join(",")}]` as unknown) : null,
      }));
      // Use rpc? direct insert
      const { error } = await supabase.from("memory_chunks").insert(batch as never);
      if (error) throw new Error(`chunk insert failed: ${error.message}`);
    }

    return NextResponse.json({ memoryId, fileName: file.name, chunks: chunks.length });
  } catch (e) {
    if (e instanceof AIError) {
      const status = e.code === "not_configured" ? 503 : e.retryable ? 502 : 500;
      return NextResponse.json({ error: e.message, code: e.code }, { status });
    }
    const msg = e instanceof Error ? e.message : "Ingest failed";
    return NextResponse.json({ error: msg, code: "internal" }, { status: 500 });
  }
}
