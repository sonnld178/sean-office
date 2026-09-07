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
      const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
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
      // fallback
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

    const embeddings = await embedTexts(chunks, geminiKey);

    const { data: doc, error: docErr } = await supabase
      .from("cv_documents")
      .insert({ user_key: key, file_name: file.name })
      .select("id")
      .single();
    if (docErr || !doc) throw new Error(docErr?.message ?? "insert cv doc failed");
    const cvId = (doc as { id: string }).id;

    const rows = chunks.map((c, i) => ({
      cv_id: cvId,
      chunk_index: i,
      content: c,
      embedding: embeddings[i] ?? null,
    }));

    for (let i = 0; i < rows.length; i += 50) {
      const batch = rows.slice(i, i + 50).map((r) => ({
        ...r,
        embedding: r.embedding ? (`[${(r.embedding as unknown as number[]).join(",")}]` as unknown) : null,
      }));
      const { error } = await supabase.from("cv_chunks").insert(batch as never);
      if (error) throw new Error(`chunk insert failed: ${error.message}`);
    }

    return NextResponse.json({ cvId, fileName: file.name, chunks: chunks.length });
  } catch (e) {
    if (e instanceof AIError) {
      const status = e.code === "not_configured" ? 503 : e.retryable ? 502 : 500;
      return NextResponse.json({ error: e.message, code: e.code }, { status });
    }
    const msg = e instanceof Error ? e.message : "Ingest failed";
    return NextResponse.json({ error: msg, code: "internal" }, { status: 500 });
  }
}
