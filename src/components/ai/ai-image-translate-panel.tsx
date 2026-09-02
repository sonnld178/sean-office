"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SparkHoverButton } from "@/components/SparkHoverButton";
import { Languages, Loader2 } from "lucide-react";

interface Result {
  detected_text: string;
  translated_text: string;
  blocks?: Array<{ original: string; translated: string }>;
  provider?: string;
  provider_chain?: string[];
}

export function AiImageTranslatePanel() {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [targetLang, setTargetLang] = useState("vi");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  const onFileChange = (f: File | null) => {
    setFile(f);
    setResult(null);
    setError(null);
    if (f) {
      const url = URL.createObjectURL(f);
      setPreviewUrl(url);
    } else setPreviewUrl(null);
  };

  const handleTranslate = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("targetLang", targetLang);
      const res = await fetch("/api/ai/image/translate", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Translate failed");
      setResult(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Translate failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Upload ảnh/scan (bill, hoá đơn) → Gemini Vision đọc + dịch giữ layout. Fallback Groq nếu Gemini bận.
      </p>

      <div className="space-y-2">
        <Label className="text-xs">Ảnh nguồn (PNG/JPG/WebP, max 6MB)</Label>
        <Input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
        />
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={previewUrl} alt="preview" className="max-h-40 rounded border object-contain" />
        ) : null}
      </div>

      <div className="space-y-2">
        <Label className="text-xs">Dịch sang</Label>
        <Select value={targetLang} onValueChange={setTargetLang}>
          <SelectTrigger className="text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="vi">Tiếng Việt</SelectItem>
            <SelectItem value="en">English</SelectItem>
            <SelectItem value="ja">日本語</SelectItem>
            <SelectItem value="ko">한국어</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <SparkHoverButton size="sm" className="w-full" disabled={!file || loading} onClick={() => void handleTranslate()}>
        {loading ? (
          <>
            <Loader2 className="mr-2 size-4 animate-spin" /> Đang dịch…
          </>
        ) : (
          <>
            <Languages className="mr-2 size-4" /> AI Translate Image
          </>
        )}
      </SparkHoverButton>

      {error ? <p className="rounded border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">{error}</p> : null}

      {result ? (
        <div className="space-y-3 rounded border bg-muted/20 p-3">
          <div className="flex items-center gap-2 text-xs font-semibold">
            Kết quả
            {result.provider ? (
              <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">{result.provider}</span>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Tiếng gốc</Label>
            <p className="rounded bg-background p-2 text-xs whitespace-pre-wrap">{result.detected_text || "—"}</p>
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Bản dịch</Label>
            <p className="rounded bg-background p-2 text-xs whitespace-pre-wrap font-medium">{result.translated_text || "—"}</p>
          </div>
          {result.blocks?.length ? (
            <div className="space-y-1">
              <Label className="text-xs">Chi tiết block</Label>
              <div className="max-h-32 overflow-auto rounded border bg-background p-2 text-[11px]">
                {result.blocks.map((b, i) => (
                  <div key={i} className="border-b py-1 last:border-0">
                    <span className="text-muted-foreground">{b.original}</span> → <span className="font-medium">{b.translated}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          <Button
            size="sm"
            variant="outline"
            className="w-full text-xs"
            onClick={() => {
              if (result.translated_text) navigator.clipboard.writeText(result.translated_text);
            }}
          >
            Copy bản dịch
          </Button>
          <p className="text-[11px] text-muted-foreground">Gợi ý: dùng canvas overlay text nếu cần giữ layout ảnh gốc (Phase tiếp theo: gen nền bằng FLUX).</p>
        </div>
      ) : null}
    </div>
  );
}
