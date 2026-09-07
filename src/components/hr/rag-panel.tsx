"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function RagPanel() {
  const [memFile, setMemFile] = useState<File | null>(null);
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [citations, setCitations] = useState<Array<{ kind: string; id: string; chunk: number; similarity?: number }>>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState("");

  const uploadMemory = async () => {
    if (!memFile) return;
    setBusy("mem");
    setMsg("");
    try {
      const fd = new FormData();
      fd.append("file", memFile);
      const r = await fetch("/api/rag/memory/ingest", { method: "POST", body: fd });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Upload failed");
      setMsg(`Memory ingested: ${j.fileName} → ${j.chunks} chunks (id ${j.memoryId?.slice(0, 8)})`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(null);
    }
  };

  const uploadCv = async () => {
    if (!cvFile) return;
    setBusy("cv");
    setMsg("");
    try {
      const fd = new FormData();
      fd.append("file", cvFile);
      const r = await fetch("/api/rag/cv/ingest", { method: "POST", body: fd });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Upload failed");
      setMsg(`CV ingested: ${j.fileName} → ${j.chunks} chunks (id ${j.cvId?.slice(0, 8)})`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(null);
    }
  };

  const ask = async () => {
    if (!question.trim()) return;
    setBusy("query");
    setAnswer("");
    setCitations([]);
    setMsg("");
    try {
      const r = await fetch("/api/rag/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, topK: 5 }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Query failed");
      setAnswer(j.answer ?? "");
      setCitations(j.citations ?? []);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Query failed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mt-8 rounded-xl border bg-card p-4 shadow-sm">
      <h3 className="text-sm font-semibold">RAG V1 — Company memory + CV screening</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        Upload TXT/CSV/PDF/DOCX (file-only ingest). Then ask a question — answer is grounded in your memories &amp; CVs with citations.
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="space-y-2 rounded-lg border p-3">
          <Label htmlFor="rag-mem">Company Memory file</Label>
          <Input
            id="rag-mem"
            type="file"
            accept=".txt,.csv,.md,.pdf,.docx"
            onChange={(e) => setMemFile(e.target.files?.[0] ?? null)}
          />
          <Button size="sm" onClick={uploadMemory} disabled={!memFile || busy !== null}>
            {busy === "mem" ? "Uploading…" : "Ingest Memory"}
          </Button>
          {memFile && <p className="text-xs text-muted-foreground truncate">{memFile.name}</p>}
        </div>

        <div className="space-y-2 rounded-lg border p-3">
          <Label htmlFor="rag-cv">CV file</Label>
          <Input
            id="rag-cv"
            type="file"
            accept=".txt,.pdf,.docx"
            onChange={(e) => setCvFile(e.target.files?.[0] ?? null)}
          />
          <Button size="sm" onClick={uploadCv} disabled={!cvFile || busy !== null}>
            {busy === "cv" ? "Uploading…" : "Ingest CV"}
          </Button>
          {cvFile && <p className="text-xs text-muted-foreground truncate">{cvFile.name}</p>}
        </div>
      </div>

      <div className="mt-4 space-y-2">
        <Label htmlFor="rag-q">Question (Vietnamese scoring)</Label>
        <Textarea
          id="rag-q"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="VD: So sánh 2 CV theo yêu cầu Java + 3 năm kinh nghiệm, rank và cite nguồn…"
          rows={3}
        />
        <Button onClick={ask} disabled={!question.trim() || busy !== null}>
          {busy === "query" ? "Thinking…" : "Ask RAG"}
        </Button>
      </div>

      {msg && <p className="mt-3 text-xs text-muted-foreground whitespace-pre-wrap">{msg}</p>}

      {answer && (
        <div className="mt-4 space-y-2">
          <Label>Answer</Label>
          <div className="rounded-lg border bg-muted/30 p-3 text-sm whitespace-pre-wrap leading-relaxed">{answer}</div>
          {citations.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Citations: {citations.map((c) => `[${c.kind}:${c.id.slice(0, 8)}:${c.chunk}]`).join(" ")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
