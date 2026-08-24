"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import JSZip from "jszip";
import { FileDropzone } from "@/components/common/file-dropzone";
import { SparkHoverButton } from "@/components/SparkHoverButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { downloadSeanOfficeBlob } from "@/lib/download-names";
import {
  compressPdf,
  deletePdfPages,
  extractPageRange,
  mergePdfs,
  rotatePdfPages,
  splitPdfEveryPage,
} from "@/lib/pdf-tools";
import { PdfExtractTables } from "@/components/pdf/pdf-extract-tables";
import {
  Loader2,
  RotateCcw,
  RotateCw,
  Trash2,
} from "lucide-react";

export type PdfSidebarTool =
  | "watermark"
  | "signature"
  | "merge"
  | "split"
  | "pages"
  | "compress"
  | "extract";

interface PdfToolSidebarProps {
  tool: Exclude<PdfSidebarTool, "watermark" | "signature">;
  pdfBuf: ArrayBuffer;
  fileName: string;
  onPdfUpdate?: (buf: ArrayBuffer, fileName?: string) => void;
  activePage?: number;
  selectedPages?: number[];
  pageCount?: number;
  onAfterDelete?: (deleted: number[]) => void;
  onAfterRotate?: (pageIndices: number[], angle: 90 | 270) => void;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

export function PdfToolSidebar({
  tool,
  pdfBuf,
  fileName,
  onPdfUpdate,
  activePage = 0,
  selectedPages = [],
  pageCount = 0,
  onAfterDelete,
  onAfterRotate,
}: PdfToolSidebarProps) {
  if (tool === "merge") {
    return (
      <MergeSidebar
        pdfBuf={pdfBuf}
        fileName={fileName}
        onPdfUpdate={onPdfUpdate}
      />
    );
  }
  if (tool === "split") {
    return <SplitSidebar pdfBuf={pdfBuf} fileName={fileName} />;
  }
  if (tool === "pages") {
    return (
      <PagesSidebar
        pdfBuf={pdfBuf}
        fileName={fileName}
        onPdfUpdate={onPdfUpdate}
        activePage={activePage}
        selectedPages={selectedPages}
        pageCount={pageCount}
        onAfterDelete={onAfterDelete}
        onAfterRotate={onAfterRotate}
      />
    );
  }
  if (tool === "compress") {
    return (
      <CompressSidebar
        pdfBuf={pdfBuf}
        fileName={fileName}
        onPdfUpdate={onPdfUpdate}
      />
    );
  }
  if (tool === "extract") {
    return <ExtractSidebar pdfBuf={pdfBuf} fileName={fileName} />;
  }

  return null;
}

function MergeSidebar({
  pdfBuf,
  fileName,
  onPdfUpdate,
}: {
  pdfBuf: ArrayBuffer;
  fileName: string;
  onPdfUpdate?: (buf: ArrayBuffer, fileName?: string) => void;
}) {
  const t = useTranslations("pdf");
  const [extra, setExtra] = useState<{ name: string; buffer: ArrayBuffer }[]>(
    []
  );
  const [busy, setBusy] = useState(false);

  const canMerge = extra.length > 0;

  const run = async () => {
    if (!canMerge) return;
    setBusy(true);
    try {
      const buffers = [pdfBuf, ...extra.map((f) => f.buffer)];
      const out = await mergePdfs(buffers);
      if (onPdfUpdate) {
        onPdfUpdate(await out.arrayBuffer(), "merged.pdf");
      } else {
        downloadSeanOfficeBlob(out, "pdf", fileName, "pdf", "merged");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">{t("mergeHint")}</p>
      <p className="text-xs">
        Current: <span className="font-medium">{fileName}</span>
      </p>
      <FileDropzone
        multiple
        accept={{ "application/pdf": [".pdf"] }}
        label={t("dropPdf")}
        onFiles={async (items) => {
          setExtra((prev) => [
            ...prev,
            ...items.map((i) => ({ name: i.file.name, buffer: i.buffer })),
          ]);
        }}
      />
      {extra.map((f, i) => (
        <div
          key={`${f.name}-${i}`}
          className="flex items-center justify-between rounded border px-2 py-1 text-xs"
        >
          <span className="truncate">{f.name}</span>
          <Button
            variant="ghost"
            size="sm"
            className="size-7"
            onClick={() => setExtra((p) => p.filter((_, j) => j !== i))}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      ))}
      <SparkHoverButton
        size="sm"
        disabled={busy || !canMerge}
        onClick={() => void run()}
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : t("toolMerge")}
      </SparkHoverButton>
    </div>
  );
}

function SplitSidebar({
  pdfBuf,
  fileName,
}: {
  pdfBuf: ArrayBuffer;
  fileName: string;
}) {
  const t = useTranslations("pdf");
  const [mode, setMode] = useState<"every" | "range">("every");
  const [from, setFrom] = useState(1);
  const [to, setTo] = useState(1);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      if (mode === "every") {
        const parts = await splitPdfEveryPage(pdfBuf);
        const zip = new JSZip();
        parts.forEach((blob, i) => zip.file(`page-${i + 1}.pdf`, blob));
        downloadSeanOfficeBlob(
          await zip.generateAsync({ type: "blob" }),
          "pdf",
          fileName,
          "zip",
          "split"
        );
      } else {
        const out = await extractPageRange(pdfBuf, from - 1, to - 1);
        downloadSeanOfficeBlob(
          out,
          "pdf",
          fileName,
          "pdf",
          `pages-${from}-${to}`
        );
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2">
        <Button
          size="sm"
          variant={mode === "every" ? "default" : "outline"}
          className="h-auto min-h-8 w-full justify-start whitespace-normal px-2.5 py-2 text-left text-xs leading-snug"
          onClick={() => setMode("every")}
        >
          {t("splitEveryPage")}
        </Button>
        <Button
          size="sm"
          variant={mode === "range" ? "default" : "outline"}
          className="h-auto min-h-8 w-full justify-start px-2.5 py-2 text-left text-xs"
          onClick={() => setMode("range")}
        >
          {t("splitRange")}
        </Button>
      </div>
      {mode === "range" && (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs">From</Label>
            <Input
              type="number"
              min={1}
              value={from}
              onChange={(e) => setFrom(Number(e.target.value) || 1)}
              className="mt-1 w-full"
            />
          </div>
          <div>
            <Label className="text-xs">To</Label>
            <Input
              type="number"
              min={from}
              value={to}
              onChange={(e) => setTo(Number(e.target.value) || from)}
              className="mt-1 w-full"
            />
          </div>
        </div>
      )}
      <SparkHoverButton size="sm" disabled={busy} onClick={() => void run()}>
        {busy ? <Loader2 className="size-4 animate-spin" /> : t("toolSplit")}
      </SparkHoverButton>
    </div>
  );
}

function resolveTargetPages(selectedPages: number[], activePage: number) {
  if (selectedPages.length > 0) {
    return [...new Set(selectedPages)].sort((a, b) => a - b);
  }
  return [activePage];
}

function PagesSidebar({
  pdfBuf,
  fileName: _fileName,
  onPdfUpdate,
  activePage,
  selectedPages,
  pageCount,
  onAfterDelete,
  onAfterRotate,
}: {
  pdfBuf: ArrayBuffer;
  fileName: string;
  onPdfUpdate?: (buf: ArrayBuffer, fileName?: string) => void;
  activePage: number;
  selectedPages: number[];
  pageCount: number;
  onAfterDelete?: (deleted: number[]) => void;
  onAfterRotate?: (pageIndices: number[], angle: 90 | 270) => void;
}) {
  const t = useTranslations("pdf");
  const [busy, setBusy] = useState(false);
  const targets = resolveTargetPages(selectedPages, activePage).filter(
    (i) => i >= 0 && i < pageCount
  );
  const canDelete = targets.length > 0 && targets.length < pageCount;
  const targetLabel = targets.map((i) => i + 1).join(", ");

  const apply = async (
    fn: (b: ArrayBuffer, indices: number[]) => Promise<Blob>,
    kind: "rotate" | "delete",
    rotateAngle?: 90 | 270
  ) => {
    if (!targets.length) return;
    if (kind === "delete" && !canDelete) return;
    setBusy(true);
    try {
      const out = await fn(pdfBuf, targets);
      const ab = await out.arrayBuffer();
      if (kind === "delete") onAfterDelete?.(targets);
      if (kind === "rotate" && rotateAngle) onAfterRotate?.(targets, rotateAngle);
      onPdfUpdate?.(ab.slice(0));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">{t("pagesHint")}</p>
      <p className="text-xs">
        {t("pagesTarget", { pages: targetLabel || String(activePage + 1) })}
      </p>
      <div className="flex flex-col gap-2">
        <SparkHoverButton
          size="sm"
          variant="secondary"
          disabled={!targets.length || busy}
          onClick={() =>
            void apply((b, idx) => rotatePdfPages(b, idx, 90), "rotate", 90)
          }
        >
          <RotateCw className="mr-1.5 size-4" />
          {t("rotateCw")}
        </SparkHoverButton>
        <SparkHoverButton
          size="sm"
          variant="secondary"
          disabled={!targets.length || busy}
          onClick={() =>
            void apply((b, idx) => rotatePdfPages(b, idx, 270), "rotate", 270)
          }
        >
          <RotateCcw className="mr-1.5 size-4" />
          {t("rotateCcw")}
        </SparkHoverButton>
        <SparkHoverButton
          size="sm"
          variant="destructive"
          tone="destructive"
          disabled={!canDelete || busy}
          onClick={() => void apply((b, idx) => deletePdfPages(b, idx), "delete")}
        >
          <Trash2 className="mr-1.5 size-4" />
          {t("deletePages")}
        </SparkHoverButton>
      </div>
    </div>
  );
}

function CompressSidebar({
  pdfBuf,
  fileName,
  onPdfUpdate,
}: {
  pdfBuf: ArrayBuffer;
  fileName: string;
  onPdfUpdate?: (buf: ArrayBuffer, fileName?: string) => void;
}) {
  const t = useTranslations("pdf");
  const [afterSize, setAfterSize] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      const out = await compressPdf(pdfBuf);
      setAfterSize(out.size);
      const ab = await out.arrayBuffer();
      if (onPdfUpdate) {
        onPdfUpdate(ab.slice(0));
      } else {
        downloadSeanOfficeBlob(out, "pdf", fileName, "pdf", "compressed");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">{t("compressHint")}</p>
      <p className="text-xs">
        Original: {formatBytes(pdfBuf.byteLength)}
        {afterSize != null && <> → {formatBytes(afterSize)}</>}
      </p>
      <SparkHoverButton size="sm" disabled={busy} onClick={() => void run()}>
        {busy ? <Loader2 className="size-4 animate-spin" /> : t("toolCompress")}
      </SparkHoverButton>
    </div>
  );
}

function ExtractSidebar({
  pdfBuf,
  fileName,
}: {
  pdfBuf: ArrayBuffer;
  fileName: string;
}) {
  return <PdfExtractTables pdfBuf={pdfBuf} fileName={fileName} compact />;
}
