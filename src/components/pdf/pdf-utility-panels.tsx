"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import JSZip from "jszip";
import { FileDropzone } from "@/components/common/file-dropzone";
import { ReactBitsLoaderPanel } from "@/components/ReactBitsLoader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { downloadSeanOfficeBlob } from "@/lib/download-names";
import { renderAllPdfPages } from "@/lib/pdfjs-client";
import {
  compressPdf,
  deletePdfPages,
  extractPageRange,
  mergePdfs,
  rotatePdfPages,
  splitPdfEveryPage,
} from "@/lib/pdf-tools";
import { PdfExtractTables } from "@/components/pdf/pdf-extract-tables";
import type { PdfToolId } from "@/components/pdf/pdf-tool-board";
import {
  ArrowLeft,
  Download,
  Loader2,
  RotateCcw,
  RotateCw,
  Trash2,
} from "lucide-react";

interface PdfUtilityPanelsProps {
  tool: Exclude<PdfToolId, "edit">;
  onBack: () => void;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

export function PdfUtilityPanels({ tool, onBack }: PdfUtilityPanelsProps) {
  const t = useTranslations("pdf");

  return (
    <div className="mx-auto max-w-3xl py-6 md:py-10">
      <Button variant="ghost" size="sm" className="mb-4" onClick={onBack}>
        <ArrowLeft className="mr-1.5 size-4" />
        {t("backToTools")}
      </Button>

      {tool === "merge" && <MergePanel />}
      {tool === "split" && <SplitPanel />}
      {tool === "pages" && <PagesPanel />}
      {tool === "compress" && <CompressPanel />}
      {tool === "extract" && <ExtractPanel />}
    </div>
  );
}

function MergePanel() {
  const t = useTranslations("pdf");
  const [files, setFiles] = useState<{ name: string; buffer: ArrayBuffer }[]>(
    []
  );
  const [busy, setBusy] = useState(false);

  const run = async () => {
    if (files.length < 2) return;
    setBusy(true);
    try {
      const out = await mergePdfs(files.map((f) => f.buffer));
      downloadSeanOfficeBlob(out, "pdf", "document.pdf", "pdf", "merged");
    } finally {
      setBusy(false);
    }
  };

  return (
    <PanelShell title={t("toolMerge")} hint={t("mergeHint")}>
      <FileDropzone
        multiple
        accept={{ "application/pdf": [".pdf"] }}
        label={t("dropPdf")}
        onFiles={async (items) => {
          setFiles((prev) => [
            ...prev,
            ...items.map((i) => ({ name: i.file.name, buffer: i.buffer })),
          ]);
        }}
      />
      {files.length > 0 && (
        <ul className="mt-4 space-y-1 text-sm">
          {files.map((f, i) => (
            <li
              key={`${f.name}-${i}`}
              className="flex items-center justify-between rounded border px-3 py-2"
            >
              <span className="truncate">{f.name}</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  setFiles((prev) => prev.filter((_, j) => j !== i))
                }
              >
                <Trash2 className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <RunButton
        disabled={files.length < 2}
        busy={busy}
        onClick={() => void run()}
        label={t("toolMerge")}
      />
    </PanelShell>
  );
}

function SplitPanel() {
  const t = useTranslations("pdf");
  const [buf, setBuf] = useState<ArrayBuffer | null>(null);
  const [fileName, setFileName] = useState("");
  const [mode, setMode] = useState<"every" | "range">("every");
  const [from, setFrom] = useState(1);
  const [to, setTo] = useState(1);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    if (!buf) return;
    setBusy(true);
    try {
      if (mode === "every") {
        const parts = await splitPdfEveryPage(buf);
        const zip = new JSZip();
        parts.forEach((blob, i) => {
          zip.file(`page-${i + 1}.pdf`, blob);
        });
        const z = await zip.generateAsync({ type: "blob" });
        downloadSeanOfficeBlob(z, "pdf", fileName, "zip", "split");
      } else {
        const out = await extractPageRange(buf, from - 1, to - 1);
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
    <PanelShell title={t("toolSplit")} hint={t("splitEveryPage")}>
      <FileDropzone
        accept={{ "application/pdf": [".pdf"] }}
        label={t("uploadHint")}
        onFiles={async (items) => {
          setBuf(items[0].buffer);
          setFileName(items[0].file.name || "document.pdf");
        }}
      />
      {buf && (
        <div className="mt-4 space-y-3">
          <div className="flex flex-col gap-2">
            <Button
              variant={mode === "every" ? "default" : "outline"}
              size="sm"
              className="h-auto min-h-8 w-full justify-start whitespace-normal px-2.5 py-2 text-left text-xs leading-snug"
              onClick={() => setMode("every")}
            >
              {t("splitEveryPage")}
            </Button>
            <Button
              variant={mode === "range" ? "default" : "outline"}
              size="sm"
              className="h-auto min-h-8 w-full justify-start px-2.5 py-2 text-left text-xs"
              onClick={() => setMode("range")}
            >
              {t("splitRange")}
            </Button>
          </div>
          {mode === "range" && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">{t("page")} from</Label>
                <Input
                  type="number"
                  min={1}
                  value={from}
                  onChange={(e) => setFrom(Number(e.target.value) || 1)}
                  className="mt-1 w-full"
                />
              </div>
              <div>
                <Label className="text-xs">{t("page")} to</Label>
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
        </div>
      )}
      <RunButton disabled={!buf} busy={busy} onClick={() => void run()} />
    </PanelShell>
  );
}

function PagesPanel() {
  const t = useTranslations("pdf");
  const [buf, setBuf] = useState<ArrayBuffer | null>(null);
  const [_pagesFileName, setFileName] = useState("");
  const [thumbs, setThumbs] = useState<
    { pageIndex: number; dataUrl: string }[]
  >([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [workingBuf, setWorkingBuf] = useState<ArrayBuffer | null>(null);

  const loadThumbs = useCallback(async (pdf: ArrayBuffer) => {
    setLoading(true);
    try {
      const pages = await renderAllPdfPages(pdf, 0.35);
      setThumbs(
        pages.map((p) => ({
          pageIndex: p.pageIndex,
          dataUrl: p.canvas.toDataURL("image/png"),
        }))
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (workingBuf) void loadThumbs(workingBuf);
  }, [workingBuf, loadThumbs]);

  const toggle = (idx: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const applyAndUpdate = async (
    fn: (b: ArrayBuffer, indices: number[]) => Promise<Blob>
  ) => {
    const source = workingBuf ?? buf;
    if (!source || !selected.size) return;
    setBusy(true);
    try {
      const out = await fn(source, [...selected]);
      setWorkingBuf(await out.arrayBuffer());
      setSelected(new Set());
    } finally {
      setBusy(false);
    }
  };

  return (
    <PanelShell title={t("toolPages")} hint={t("rotateCw")}>
      <FileDropzone
        accept={{ "application/pdf": [".pdf"] }}
        label={t("uploadHint")}
        onFiles={async (items) => {
          const b = items[0].buffer;
          setBuf(b);
          setWorkingBuf(b.slice(0));
          setFileName(items[0].file.name || "document.pdf");
          setSelected(new Set());
        }}
      />
      {loading && (
        <ReactBitsLoaderPanel className="mt-4 min-h-[16rem]" label={t("loadingPages")} />
      )}
      {thumbs.length > 0 && !loading && (
        <>
          <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
            {thumbs.map(({ pageIndex, dataUrl }) => (
              <button
                key={pageIndex}
                type="button"
                onClick={() => toggle(pageIndex)}
                className={cn(
                  "overflow-hidden rounded border-2 transition-colors",
                  selected.has(pageIndex)
                    ? "border-primary ring-2 ring-primary/30"
                    : "border-border hover:border-primary/50"
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={dataUrl}
                  alt={`Page ${pageIndex + 1}`}
                  className="aspect-[3/4] w-full object-cover"
                />
                <span className="block py-1 text-center text-[10px] text-muted-foreground">
                  {pageIndex + 1}
                </span>
              </button>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="secondary"
              disabled={!selected.size || busy}
              onClick={() =>
                void applyAndUpdate((b, idx) => rotatePdfPages(b, idx, 90))
              }
            >
              <RotateCw className="mr-1.5 size-4" />
              {t("rotateCw")}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={!selected.size || busy}
              onClick={() =>
                void applyAndUpdate((b, idx) => rotatePdfPages(b, idx, 270))
              }
            >
              <RotateCcw className="mr-1.5 size-4" />
              {t("rotateCcw")}
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={!selected.size || busy}
              onClick={() =>
                void applyAndUpdate((b, idx) => deletePdfPages(b, idx))
              }
            >
              <Trash2 className="mr-1.5 size-4" />
              {t("deletePages")}
            </Button>
          </div>
        </>
      )}
    </PanelShell>
  );
}

function CompressPanel() {
  const t = useTranslations("pdf");
  const [buf, setBuf] = useState<ArrayBuffer | null>(null);
  const [fileName, setFileName] = useState("");
  const [afterSize, setAfterSize] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    if (!buf) return;
    setBusy(true);
    try {
      const out = await compressPdf(buf);
      setAfterSize(out.size);
      downloadSeanOfficeBlob(out, "pdf", "document.pdf", "pdf", "compressed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <PanelShell title={t("toolCompress")} hint={t("compressHint")}>
      <FileDropzone
        accept={{ "application/pdf": [".pdf"] }}
        label={t("uploadHint")}
        onFiles={async (items) => {
          setBuf(items[0].buffer);
          setFileName(items[0].file.name || "document.pdf");
          setAfterSize(null);
        }}
      />
      {buf && (
        <p className="mt-4 text-sm text-muted-foreground">
          Original: {formatBytes(buf.byteLength)}
          {afterSize != null && (
            <> → Compressed: {formatBytes(afterSize)}</>
          )}
        </p>
      )}
      <RunButton disabled={!buf} busy={busy} onClick={() => void run()} />
    </PanelShell>
  );
}

function ExtractPanel() {
  const t = useTranslations("pdf");
  const [buf, setBuf] = useState<ArrayBuffer | null>(null);
  const [fileName, setFileName] = useState("");

  return (
    <PanelShell title={t("toolExtract")} hint={t("extractHint")}>
      <FileDropzone
        accept={{ "application/pdf": [".pdf"] }}
        label={t("uploadHint")}
        onFiles={async (items) => {
          setBuf(items[0].buffer);
          setFileName(items[0].file.name || "document.pdf");
        }}
      />
      {buf && (
        <div className="mt-4">
          <PdfExtractTables pdfBuf={buf} fileName={fileName} />
        </div>
      )}
    </PanelShell>
  );
}

function PanelShell({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{hint}</p>
      <div className="mt-6">{children}</div>
    </div>
  );
}

function RunButton({
  disabled,
  busy,
  onClick,
  label,
}: {
  disabled: boolean;
  busy: boolean;
  onClick: () => void;
  label?: string;
}) {
  const t = useTranslations("pdf");
  return (
    <Button
      className="mt-6"
      disabled={disabled || busy}
      onClick={onClick}
    >
      {busy ? (
        <>
          <Loader2 className="mr-1.5 size-4 animate-spin" />
          {t("processing")}
        </>
      ) : (
        <>
          <Download className="mr-1.5 size-4" />
          {label ?? t("downloadPdf")}
        </>
      )}
    </Button>
  );
}
