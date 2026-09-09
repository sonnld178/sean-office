"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { ToolbarIconButton } from "@/components/tool/toolbar-icon-button";
import { PreviewZoomControls } from "@/components/tool/preview-zoom-controls";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { FileDropzone } from "@/components/common/file-dropzone";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ToolPanelHeader,
  ToolWorkspaceShell,
} from "@/components/tool/tool-workspace-shell";
import { ReactBitsLoaderPanel } from "@/components/ReactBitsLoader";
import { SparkHoverButton } from "@/components/SparkHoverButton";
import { DocxPreviewRenderer } from "@/components/docs/docx-preview-renderer";
import { DocTemplateEditor } from "@/components/docs/doc-template-editor";
import { DocTemplatePreview } from "@/components/docs/doc-template-preview";
import { downloadSeanOfficeBlob } from "@/lib/download-names";
import { usePreviewZoom } from "@/hooks/use-preview-zoom";
import {
  applyParagraphEditsToDocx,
  cleanDocx,
  fillDocxSingle,
  fillDocxTemplate,
  formatDocxtemplaterError,
  parseDocxParagraphs,
  parseSheetFile,
  scanDocxPlaceholders,
  scanTablesFromDocx,
  tablesToXlsx,
  validateFillData,
  type ExtractedTable,
  type FillValidation,
  type ParagraphEdit,
} from "@/lib/docs-processor";
import { Braces, Download, Eraser, Eye, FileSpreadsheet, FileText, FlaskConical, Plus, Sparkles } from "lucide-react";

type DocsTool = "fill" | "clean" | "extract" | "template" | null;

type FillDataSource = "manual" | "sample" | "upload";

const MAX_TEMPLATE_UNDO = 50;
// Preview dropdown tối đa 10 dòng, tải ZIP tối đa 100 dòng
const FILL_PREVIEW_MAX = 10;
const FILL_DOWNLOAD_MAX = 100;

function cloneBuffer(buf: ArrayBuffer) {
  return buf.slice(0);
}

interface DocsWorkspaceProps {
  docBuf: ArrayBuffer;
  fileName: string;
  onNewFile: () => void;
  onDocUpdate?: (buf: ArrayBuffer) => void;
  /** Nguồn template: "sample" nếu bấm Try sample ở bước upload, "upload" nếu tự tải file */
  templateSource?: "sample" | "upload";
  /** Nạp file sample khác (VD sample có bảng cho Extract) — đổi cả buffer + tên file */
  onLoadSampleFile?: (buf: ArrayBuffer, name: string) => void;
}

export function DocsWorkspace({
  docBuf,
  fileName,
  onNewFile,
  onDocUpdate,
  templateSource = "upload",
  onLoadSampleFile,
}: DocsWorkspaceProps) {
  const t = useTranslations("docs");
  const locale = useLocale();
  const [activeTool, setActiveTool] = useState<DocsTool>(null);
  const [displayBuf, setDisplayBuf] = useState<ArrayBuffer>(docBuf);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const [cleanOpts, setCleanOpts] = useState({
    comments: true,
    revisions: true,
    meta: false,
  });

  const [dataSheetBuf, setDataSheetBuf] = useState<ArrayBuffer | null>(null);
  const [fillRows, setFillRows] = useState<Record<string, string>[]>([]);
  const [fillHeaders, setFillHeaders] = useState<string[]>([]);
  const [fillValidation, setFillValidation] = useState<FillValidation | null>(
    null
  );
  const [fillError, setFillError] = useState<string | null>(null);
  const [previewRowIndex, setPreviewRowIndex] = useState(0);
  const [showingFilledPreview, setShowingFilledPreview] = useState(false);
  // Nguồn dữ liệu Fill: nhập tay / sample / upload Excel
  const [fillSource, setFillSource] = useState<FillDataSource>(
    templateSource === "sample" ? "sample" : "upload"
  );
  // Quick Fill: nhập giá trị trực tiếp trên UI, không cần sheet
  const [quickValues, setQuickValues] = useState<Record<string, string>>({});
  // Cờ dòng từ sample (để hiện note preview dòng 1 / tải đủ)
  const [sampleLoaded, setSampleLoaded] = useState(false);
  const [sampleLoading, setSampleLoading] = useState(false);
  // AI gợi ý dữ liệu (3 dòng theo locale)
  const [aiSuggesting, setAiSuggesting] = useState(false);
  const [aiSuggestError, setAiSuggestError] = useState<string | null>(null);
  const sampleAutoLoaded = useRef(false);

  const [scannedTables, setScannedTables] = useState<ExtractedTable[]>([]);
  const [selectedTableIndices, setSelectedTableIndices] = useState<Set<number>>(
    new Set()
  );
  const [scanningTables, setScanningTables] = useState(false);
  const [sampleTableLoading, setSampleTableLoading] = useState(false);
  const [sampleTableError, setSampleTableError] = useState<string | null>(null);

  const [templateUndoStack, setTemplateUndoStack] = useState<ArrayBuffer[]>([]);
  const previewScrollRef = useRef<HTMLDivElement>(null);
  const { zoom, zoomIn, zoomOut, resetZoom } = usePreviewZoom(previewScrollRef);

  const templateParagraphs = useMemo(
    () => parseDocxParagraphs(docBuf),
    [docBuf]
  );

  const docPlaceholders = useMemo(
    () => scanDocxPlaceholders(docBuf),
    [docBuf]
  );

  useEffect(() => {
    setDisplayBuf(docBuf);
    setShowingFilledPreview(false);
    setTemplateUndoStack([]);
  }, [docBuf]);

  const commitDocBuf = useCallback(
    (buf: ArrayBuffer) => {
      onDocUpdate?.(buf);
      setDisplayBuf(buf);
    },
    [onDocUpdate]
  );

  const handleTemplateInsert = useCallback(
    (edit: ParagraphEdit) => {
      setTemplateUndoStack((prev) => {
        const next = [...prev, cloneBuffer(docBuf)];
        return next.length > MAX_TEMPLATE_UNDO
          ? next.slice(next.length - MAX_TEMPLATE_UNDO)
          : next;
      });

      const blob = applyParagraphEditsToDocx(docBuf, [edit]);
      void blob.arrayBuffer().then(commitDocBuf);
    },
    [docBuf, commitDocBuf]
  );

  const handleTemplateUndo = useCallback(() => {
    setTemplateUndoStack((prev) => {
      if (prev.length === 0) return prev;
      const restored = prev[prev.length - 1];
      commitDocBuf(restored);
      return prev.slice(0, -1);
    });
  }, [commitDocBuf]);

  useEffect(() => {
    if (activeTool !== "extract") return;
    let cancelled = false;
    setScanningTables(true);
    void scanTablesFromDocx(docBuf).then((tables) => {
      if (cancelled) return;
      setScannedTables(tables);
      setSelectedTableIndices(new Set(tables.map((tbl) => tbl.index)));
      setScanningTables(false);
    });
    return () => {
      cancelled = true;
    };
  }, [activeTool, docBuf]);

  const parseDataSheet = useCallback(
    async (buf: ArrayBuffer) => {
      setFillError(null);
      try {
        const rows = await parseSheetFile(buf);
        setFillRows(rows);
        const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
        setFillHeaders(headers);
        setFillValidation(validateFillData(docPlaceholders, headers));
        setPreviewRowIndex(0);
        setShowingFilledPreview(false);
        setDisplayBuf(docBuf);
        setSampleLoaded(false);
      } catch (e) {
        setFillRows([]);
        setFillHeaders([]);
        setFillValidation(null);
        setFillError(e instanceof Error ? e.message : t("fill.error"));
      }
    },
    [docBuf, docPlaceholders, t]
  );

  useEffect(() => {
    if (dataSheetBuf) void parseDataSheet(dataSheetBuf);
  }, [dataSheetBuf, parseDataSheet]);

  // Reset form nhanh + cờ sample mỗi khi đổi template
  useEffect(() => {
    setQuickValues(Object.fromEntries(docPlaceholders.map((p) => [p, ""])));
    setSampleLoaded(false);
    setAiSuggestError(null);
    sampleAutoLoaded.current = false;
  }, [docPlaceholders]);

  // Nạp dòng mẫu từ /samples/word-data.xlsx (khớp header template mẫu)
  const loadSampleData = useCallback(async () => {
    if (sampleLoading) return;
    setFillError(null);
    setSampleLoading(true);
    try {
      const res = await fetch("/samples/word-data.xlsx");
      if (!res.ok) throw new Error("Failed to load sample data");
      const rows = await parseSheetFile(await res.arrayBuffer());
      if (!rows.length) throw new Error(t("fill.noRows"));
      // Nạp hết các dòng vào bảng, preview mặc định dòng đầu
      setFillRows(rows);
      const headers = Object.keys(rows[0]);
      setFillHeaders(headers);
      setFillValidation(validateFillData(docPlaceholders, headers));
      setQuickValues(
        Object.fromEntries(docPlaceholders.map((p) => [p, String(rows[0][p] ?? "")]))
      );
      setPreviewRowIndex(0);
      setShowingFilledPreview(false);
      setDisplayBuf(docBuf);
      setSampleLoaded(true);
    } catch (e) {
      setFillError(e instanceof Error ? e.message : t("fill.error"));
    } finally {
      setSampleLoading(false);
    }
  }, [docPlaceholders, docBuf, sampleLoading, t]);

  // Nếu template từ bước Try sample → tự nạp sample, upload tay → gợi ý AI
  useEffect(() => {
    setFillSource(templateSource === "sample" ? "sample" : "upload");
    if (
      templateSource === "sample" &&
      docPlaceholders.length > 0 &&
      !sampleAutoLoaded.current
    ) {
      sampleAutoLoaded.current = true;
      void loadSampleData();
    }
  }, [templateSource, docPlaceholders, loadSampleData]);

  // AI gợi ý 3 dòng dữ liệu theo ngôn ngữ đang chọn
  const handleAiSuggest = useCallback(async () => {
    if (!docPlaceholders.length || aiSuggesting) return;
    setAiSuggestError(null);
    setAiSuggesting(true);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20000);
    try {
      const res = await fetch("/api/ai/word/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ placeholders: docPlaceholders, locale, fileName }),
        signal: ctrl.signal,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? t("fill.suggestAiError"));
      const rows = (json.rows as Array<Record<string, unknown>>).slice(0, 3);
      if (!rows.length) throw new Error(t("fill.suggestAiError"));
      const norm = rows.map((r) =>
        Object.fromEntries(docPlaceholders.map((p) => [p, String(r[p] ?? "")]))
      );
      setFillRows(norm);
      setSampleLoaded(false);
      setFillHeaders([...docPlaceholders]);
      setFillValidation(validateFillData(docPlaceholders, docPlaceholders));
      setQuickValues({ ...norm[0] });
      setPreviewRowIndex(0);
      setShowingFilledPreview(false);
      setDisplayBuf(docBuf);
    } catch (e) {
      const timeout = e instanceof Error && e.name === "AbortError";
      setAiSuggestError(
        timeout ? t("fill.suggestAiError") : e instanceof Error ? e.message : t("fill.suggestAiError")
      );
    } finally {
      clearTimeout(timer);
      setAiSuggesting(false);
    }
  }, [aiSuggesting, docBuf, docPlaceholders, fileName, locale, t]);

  const quickRow: Record<string, string> = useMemo(
    () => Object.fromEntries(docPlaceholders.map((p) => [p, quickValues[p] ?? ""])),
    [docPlaceholders, quickValues]
  );
  const quickHasContent = useMemo(
    () => docPlaceholders.some((p) => (quickValues[p] ?? "").trim() !== ""),
    [docPlaceholders, quickValues]
  );

  const handleQuickPreview = async () => {
    if (!quickHasContent || busy) return;
    setFillError(null);
    setBusy(true);
    setPreviewLoading(true);
    try {
      const filled = await fillDocxSingle(docBuf, quickRow);
      setDisplayBuf(filled);
      setShowingFilledPreview(true);
    } catch (e) {
      setFillError(formatDocxtemplaterError(e) || t("fill.error"));
    } finally {
      setBusy(false);
      setPreviewLoading(false);
    }
  };

  const handleAddToBatch = () => {
    if (!quickHasContent) return;
    setFillRows((prev) => [...prev, { ...quickRow }]);
    setSampleLoaded(false);
    setFillHeaders([...docPlaceholders]);
    setFillValidation(validateFillData(docPlaceholders, docPlaceholders));
  };

  // Click dòng trong bảng → nạp vào form + xem trước ngay
  const handleSelectRow = async (index: number) => {
    const row = fillRows[index];
    if (!row || busy) return;
    setPreviewRowIndex(index);
    setQuickValues(
      Object.fromEntries(docPlaceholders.map((p) => [p, String(row[p] ?? "")]))
    );
    setFillError(null);
    setBusy(true);
    setPreviewLoading(true);
    try {
      const filled = await fillDocxSingle(docBuf, row);
      setDisplayBuf(filled);
      setShowingFilledPreview(true);
    } catch (e) {
      setFillError(formatDocxtemplaterError(e) || t("fill.error"));
    } finally {
      setBusy(false);
      setPreviewLoading(false);
    }
  };

  // Tên gợi nhớ cho dropdown: giá trị ô khác trống đầu tiên
  const rowDisplayName = (row: Record<string, string>): string => {
    for (const p of docPlaceholders) {
      const v = (row[p] ?? "").trim();
      if (v) return v.length > 20 ? `${v.slice(0, 20)}…` : v;
    }
    return "";
  };

  const toggleTool = (tool: DocsTool) => {
    setActiveTool((prev) => (prev === tool ? null : tool));
  };

  const handleClean = async () => {
    setBusy(true);
    try {
      const out = await cleanDocx(docBuf, cleanOpts);
      downloadSeanOfficeBlob(out, "word", fileName, "docx");
    } finally {
      setBusy(false);
    }
  };

  const handleFillPreview = async () => {
    if (!fillValidation?.canFill || !fillRows.length) return;
    setFillError(null);
    setBusy(true);
    setPreviewLoading(true);
    try {
      const filled = await fillDocxSingle(docBuf, fillRows[previewRowIndex]);
      setDisplayBuf(filled);
      setShowingFilledPreview(true);
    } catch (e) {
      setFillError(formatDocxtemplaterError(e) || t("fill.error"));
    } finally {
      setBusy(false);
      setPreviewLoading(false);
    }
  };

  // Tải xuống luôn gom 1 file ZIP, tối đa 100 dòng
  const downloadRows: Record<string, string>[] = useMemo(() => {
    if (fillRows.length) return fillRows.slice(0, FILL_DOWNLOAD_MAX);
    if (quickHasContent) return [{ ...quickRow }];
    return [];
  }, [fillRows, quickHasContent, quickRow]);

  // Dropdown preview: tất cả dòng đã load, tối đa 10
  const previewOptions = useMemo(
    () => fillRows.slice(0, FILL_PREVIEW_MAX),
    [fillRows]
  );

  const handleFillDownload = async () => {
    if (!downloadRows.length || busy) return;
    setFillError(null);
    setBusy(true);
    try {
      const out = await fillDocxTemplate(docBuf, downloadRows);
      downloadSeanOfficeBlob(out, "word", fileName, "zip");
    } catch (e) {
      setFillError(formatDocxtemplaterError(e) || t("fill.error"));
    } finally {
      setBusy(false);
    }
  };

  const resetPreviewToTemplate = () => {
    setDisplayBuf(docBuf);
    setShowingFilledPreview(false);
  };

  // Nạp sample có bảng khi tài liệu hiện tại không có bảng nào
  const handleUseTableSample = async () => {
    if (sampleTableLoading) return;
    setSampleTableError(null);
    setSampleTableLoading(true);
    try {
      const res = await fetch("/samples/word-tables.docx");
      if (!res.ok) throw new Error("Failed to load sample");
      const buf = await res.arrayBuffer();
      onLoadSampleFile?.(buf, "word-tables.docx");
    } catch (e) {
      setSampleTableError(e instanceof Error ? e.message : t("fill.error"));
    } finally {
      setSampleTableLoading(false);
    }
  };

  const handleExtract = async () => {
    const selected = scannedTables.filter((tbl) =>
      selectedTableIndices.has(tbl.index)
    );
    if (selected.length === 0) return;
    setBusy(true);
    try {
      const out = tablesToXlsx(selected.map((tbl) => tbl.rows));
      if (out) {
        downloadSeanOfficeBlob(out, "word", fileName, "xlsx", "tables");
      }
    } finally {
      setBusy(false);
    }
  };

  const toggleTableSelection = (index: number, checked: boolean) => {
    setSelectedTableIndices((prev) => {
      const next = new Set(prev);
      if (checked) next.add(index);
      else next.delete(index);
      return next;
    });
  };

  const selectedCount = scannedTables.filter((tbl) =>
    selectedTableIndices.has(tbl.index)
  ).length;

  const toolbar = (
    <>
      <ToolbarIconButton
        icon={<FileText />}
        label={t("fill.title")}
        tip={t("tipFill")}
        active={activeTool === "fill"}
        onClick={() => toggleTool("fill")}
      />
      <ToolbarIconButton
        icon={<Eraser />}
        label={t("clean.title")}
        tip={t("tipClean")}
        active={activeTool === "clean"}
        onClick={() => toggleTool("clean")}
      />
      <ToolbarIconButton
        icon={<FileSpreadsheet />}
        label={t("extract.title")}
        tip={t("tipExtract")}
        active={activeTool === "extract"}
        onClick={() => toggleTool("extract")}
      />
      <ToolbarIconButton
        icon={<Braces />}
        label={t("template.title")}
        tip={t("tipTemplate")}
        active={activeTool === "template"}
        onClick={() => toggleTool("template")}
      />
    </>
  );

  const fillPanel = (
    <>
      <ToolPanelHeader title={t("fill.title")} onClose={() => setActiveTool(null)} />
      <p className="mb-3 text-xs text-muted-foreground">{t.raw("fill.howTo")}</p>

      {docPlaceholders.length > 0 ? (
        <p className="mb-2 text-xs text-muted-foreground">
          {t("fill.placeholdersInDoc", { count: docPlaceholders.length })}:{" "}
          {docPlaceholders.map((p) => `{{${p}}}`).join(", ")}
        </p>
      ) : (
        <p className="mb-2 text-xs text-amber-600 dark:text-amber-400">
          {t.raw("fill.noPlaceholders")}
        </p>
      )}

      {docPlaceholders.length > 0 && (
        <div className="mb-3 space-y-2">
          <p className="text-xs font-medium">{t("fill.dataSource")}</p>
          <div className="grid grid-cols-3 gap-1.5">
            {(
              [
                { id: "manual", key: "srcManual" },
                { id: "sample", key: "srcSample" },
                { id: "upload", key: "srcUpload" },
              ] as const
            ).map((src) => (
              <Button
                key={src.id}
                size="sm"
                variant={fillSource === src.id ? "secondary" : "outline"}
                className="h-7 px-1 text-[11px]"
                onClick={() => setFillSource(src.id)}
              >
                {t(`fill.${src.key}`)}
              </Button>
            ))}
          </div>

          {fillSource === "manual" && (
            <div className="space-y-2 rounded-lg border p-2">
              <p className="text-xs font-medium">{t("fill.quickFillTitle")}</p>
              <p className="text-[11px] text-muted-foreground">{t("fill.quickFillHint")}</p>
              <div className="space-y-1.5">
                {docPlaceholders.map((p) => (
                  <div key={p}>
                    <label
                      className="mb-0.5 block truncate font-mono text-[11px] text-muted-foreground"
                      title={p}
                    >
                      {p}
                    </label>
                    <Input
                      value={quickValues[p] ?? ""}
                      onChange={(e) =>
                        setQuickValues((prev) => ({ ...prev, [p]: e.target.value }))
                      }
                      placeholder={`{{${p}}}`}
                      className="h-8 w-full text-xs"
                    />
                  </div>
                ))}
              </div>
              <SparkHoverButton
                size="sm"
                variant="secondary"
                disabled={busy || !quickHasContent}
                onClick={() => void handleQuickPreview()}
                className="w-full"
              >
                <Eye className="mr-1.5 size-4" />
                {t("fill.previewQuick")}
              </SparkHoverButton>
              <Button
                size="sm"
                variant="outline"
                disabled={!quickHasContent}
                onClick={handleAddToBatch}
                className="w-full text-xs"
              >
                <Plus className="mr-1 size-3.5" />
                {t("fill.addToBatch")}
              </Button>
              {!quickHasContent && (
                <p className="text-[11px] text-muted-foreground">{t("fill.quickEmpty")}</p>
              )}
            </div>
          )}

          {fillSource === "sample" && (
            <Button
              size="sm"
              variant="outline"
              disabled={sampleLoading}
              onClick={() => void loadSampleData()}
              className="w-full text-xs"
            >
              <FlaskConical className="mr-1 size-3.5" />
              {t("fill.useSampleRow")}
            </Button>
          )}

          {fillSource === "upload" && (
            <FileDropzone
              label={t("dropSheet")}
              accept={{
                "text/csv": [".csv"],
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [
                  ".xlsx",
                ],
              }}
              onFiles={async (items, { setProgress }) => {
                setDataSheetBuf(items[0].buffer);
                setProgress(100);
              }}
            />
          )}

          <Button
            size="sm"
            variant="ghost"
            disabled={aiSuggesting}
            onClick={() => void handleAiSuggest()}
            className="w-full text-xs"
          >
            <Sparkles className="mr-1 size-3.5" />
            {aiSuggesting ? t("fill.suggestAiLoading") : t("fill.suggestAi")}
          </Button>
          <p className="text-[11px] text-muted-foreground">{t("fill.suggestAiHint")}</p>
          {aiSuggestError && (
            <p className="rounded border border-destructive/30 bg-destructive/10 p-1.5 text-[11px] text-destructive">
              {aiSuggestError}
            </p>
          )}
        </div>
      )}

      {fillRows.length === 0 ? (
        docPlaceholders.length > 0 ? (
          <p className="mb-3 text-xs text-muted-foreground">{t("fill.noDataYet")}</p>
        ) : null
      ) : (
        <div className="mb-3 overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8 text-[11px]">#</TableHead>
                {docPlaceholders.map((p) => (
                  <TableHead key={p} className="whitespace-nowrap text-[11px]" title={p}>
                    {p}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {fillRows.slice(0, FILL_PREVIEW_MAX).map((row, i) => (
                <TableRow
                  key={i}
                  className={`cursor-pointer ${i === previewRowIndex ? "bg-primary/10" : ""}`}
                  onClick={() => void handleSelectRow(i)}
                >
                  <TableCell className="font-mono text-[11px] text-muted-foreground">
                    {i + 1}
                  </TableCell>
                  {docPlaceholders.map((p) => (
                    <TableCell
                      key={p}
                      className="max-w-[140px] truncate text-[11px]"
                      title={String(row[p] ?? "")}
                    >
                      {String(row[p] ?? "") || "—"}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {fillRows.length > FILL_PREVIEW_MAX && (
        <p className="-mt-2 mb-3 text-[11px] text-muted-foreground">
          {t("fill.rowsShownMore", { n: fillRows.length - FILL_PREVIEW_MAX })}
        </p>
      )}

      {fillValidation && fillHeaders.length > 0 && (
        <div className="mt-2 space-y-1 rounded border p-2 text-xs">
          <p className="font-medium">{t("fill.placeholderMatch")}</p>
          {fillValidation.placeholders.length === 0 ? (
            <p className="text-muted-foreground">{t.raw("fill.noPlaceholders")}</p>
          ) : (
            fillValidation.placeholders.map((ph) => {
              const ok = fillValidation.matched.includes(ph);
              return (
                <div key={ph} className="flex justify-between gap-2">
                  <span className="font-mono">{`{{${ph}}}`}</span>
                  <span className={ok ? "text-green-600" : "text-destructive"}>
                    {ok ? t("fill.matched") : t("fill.missingColumn")}
                  </span>
                </div>
              );
            })
          )}
        </div>
      )}

      {previewOptions.length > 0 && fillValidation?.canFill && (
        <div className="mt-3 space-y-2">
          <label className="text-xs font-medium">{t("fill.previewRow")}</label>
          <Select
            value={String(Math.min(previewRowIndex, previewOptions.length - 1))}
            onValueChange={(v) => {
              setPreviewRowIndex(Number(v));
              if (showingFilledPreview) resetPreviewToTemplate();
            }}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {previewOptions.map((row, i) => {
                const name = rowDisplayName(row);
                return (
                  <SelectItem key={i} value={String(i)} className="text-xs">
                    {name
                      ? t("fill.rowWithName", { n: i + 1, name })
                      : t("fill.rowLabel", { n: i + 1 })}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
          {fillRows.length > FILL_PREVIEW_MAX && (
            <p className="text-[11px] text-muted-foreground">
              {t("fill.showingPreviewCap")}
            </p>
          )}
          <SparkHoverButton
            size="sm"
            variant="secondary"
            disabled={busy}
            onClick={() => void handleFillPreview()}
          >
            <Eye className="mr-1.5 size-4" />
            {t("fill.previewBtn")}
          </SparkHoverButton>
          {showingFilledPreview && (
            <Button
              size="sm"
              variant="ghost"
              className="w-full text-xs"
              onClick={resetPreviewToTemplate}
            >
              {t("fill.resetPreview")}
            </Button>
          )}
        </div>
      )}

      {fillError && (
        <p className="mt-3 rounded border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">
          {fillError}
        </p>
      )}

      <SparkHoverButton
        className="mt-4"
        size="sm"
        disabled={busy || !downloadRows.length}
        onClick={() => void handleFillDownload()}
      >
        <Download className="mr-1.5 size-4" />
        {downloadRows.length > 0
          ? t("fill.downloadBatch", { count: downloadRows.length })
          : t("generate")}
      </SparkHoverButton>

      {sampleLoaded && fillRows.length > 1 ? (
        <p className="mt-2 text-[10px] text-muted-foreground">
          {t("fill.samplePreviewNote")}
        </p>
      ) : null}
      {fillRows.length > FILL_DOWNLOAD_MAX ? (
        <p className="mt-2 text-[10px] text-muted-foreground">
          {t("fill.downloadCapped", { n: fillRows.length })}
        </p>
      ) : downloadRows.length > 0 ? (
        <p className="mt-2 text-[10px] text-muted-foreground">
          {t("fill.zipHint", { count: downloadRows.length })}
        </p>
      ) : null}
    </>
  );

  const rightPanel =
    activeTool === "fill" ? (
      fillPanel
    ) : activeTool === "clean" ? (
      <>
        <ToolPanelHeader title={t("clean.title")} onClose={() => setActiveTool(null)} />
        <p className="mb-3 text-xs text-muted-foreground">{t("clean.howTo")}</p>
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={cleanOpts.comments}
              onCheckedChange={(v) =>
                setCleanOpts((o) => ({ ...o, comments: !!v }))
              }
            />
            {t("removeComments")}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={cleanOpts.revisions}
              onCheckedChange={(v) =>
                setCleanOpts((o) => ({ ...o, revisions: !!v }))
              }
            />
            {t("removeRevisions")}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={cleanOpts.meta}
              onCheckedChange={(v) =>
                setCleanOpts((o) => ({ ...o, meta: !!v }))
              }
            />
            {t("stripMeta")}
          </label>
        </div>
        <Button
          className="mt-4 w-full"
          size="sm"
          disabled={busy}
          onClick={() => void handleClean()}
        >
          <Download className="mr-1.5 size-4" />
          {t("clean.title")}
        </Button>
      </>
    ) : activeTool === "extract" ? (
      <>
        <ToolPanelHeader
          title={t("extract.title")}
          onClose={() => setActiveTool(null)}
        />
        <p className="mb-3 text-xs text-muted-foreground">{t("extract.howTo")}</p>
        {scanningTables ? (
          <p className="mb-2 text-xs text-muted-foreground">{t("extract.scanning")}</p>
        ) : scannedTables.length === 0 ? (
          <div className="mb-3 space-y-2">
            <p className="text-xs text-muted-foreground">{t("extract.noTables")}</p>
            <p className="text-[11px] text-muted-foreground">{t("extract.tableSampleHint")}</p>
            <Button
              size="sm"
              variant="outline"
              disabled={sampleTableLoading}
              onClick={() => void handleUseTableSample()}
              className="w-full text-xs"
            >
              <FlaskConical className="mr-1 size-3.5" />
              {t("extract.useTableSample")}
            </Button>
            {sampleTableError && (
              <p className="rounded border border-destructive/30 bg-destructive/10 p-1.5 text-[11px] text-destructive">
                {sampleTableError}
              </p>
            )}
          </div>
        ) : (
          <>
            <p className="mb-2 text-xs text-muted-foreground">
              {scannedTables.length} {t("tablesFound")}
            </p>
            <div className="mb-3 max-h-[min(360px,40vh)] space-y-2 overflow-y-auto rounded-md border p-2">
              {scannedTables.map((tbl) => (
                <label
                  key={tbl.index}
                  className="flex cursor-pointer gap-2 rounded border p-2 hover:bg-muted/50"
                >
                  <Checkbox
                    checked={selectedTableIndices.has(tbl.index)}
                    onCheckedChange={(v) => toggleTableSelection(tbl.index, !!v)}
                    className="mt-1"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="mb-1 text-xs font-medium">
                      {t("extract.tableLabel", { n: tbl.index + 1 })}
                    </p>
                    <div
                      className="prose prose-xs max-w-none overflow-hidden dark:prose-invert [&_table]:text-[10px]"
                      dangerouslySetInnerHTML={{ __html: tbl.previewHtml }}
                    />
                  </div>
                </label>
              ))}
            </div>
          </>
        )}
        <SparkHoverButton
          size="sm"
          disabled={busy || scanningTables || selectedCount === 0}
          onClick={() => void handleExtract()}
        >
          <Download className="mr-1.5 size-4" />
          {t("extractBtn")}
          {selectedCount > 0 && scannedTables.length > 0 ? ` (${selectedCount})` : ""}
        </SparkHoverButton>
      </>
    ) : activeTool === "template" ? (
      <DocTemplateEditor
        docBuf={docBuf}
        fileName={fileName}
        onClose={() => setActiveTool(null)}
      />
    ) : null;

  const previewContent =
    activeTool === "template" ? (
      <DocTemplatePreview
        buffer={docBuf}
        paragraphs={templateParagraphs}
        onInsert={handleTemplateInsert}
        onUndo={handleTemplateUndo}
        canUndo={templateUndoStack.length > 0}
        zoom={zoom}
      />
    ) : previewLoading ? (
      <ReactBitsLoaderPanel label={t("fill.previewLoading")} />
    ) : (
      <DocxPreviewRenderer buffer={displayBuf} zoom={zoom} />
    );

  return (
    <ToolWorkspaceShell
      fileName={fileName}
      onNewFile={onNewFile}
      toolbar={toolbar}
      rightPanel={rightPanel}
      preview={
        <div
          ref={previewScrollRef}
          className="relative flex min-h-full flex-col"
        >
          <div className="sticky top-0 z-10 flex items-center justify-end gap-2 border-b border-border bg-background/95 px-3 py-1.5 backdrop-blur-sm">
            <PreviewZoomControls
              zoom={zoom}
              onZoomIn={zoomIn}
              onZoomOut={zoomOut}
              onReset={resetZoom}
            />
          </div>
          {previewContent}
        </div>
      }
    />
  );
}
