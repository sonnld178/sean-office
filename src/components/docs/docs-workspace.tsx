"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { ToolbarIconButton } from "@/components/tool/toolbar-icon-button";
import { PreviewZoomControls } from "@/components/tool/preview-zoom-controls";
import { Checkbox } from "@/components/ui/checkbox";
import { FileDropzone } from "@/components/common/file-dropzone";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { Braces, Download, Eraser, Eye, FileSpreadsheet, FileText } from "lucide-react";

type DocsTool = "fill" | "clean" | "extract" | "template" | null;

const MAX_TEMPLATE_UNDO = 50;

function cloneBuffer(buf: ArrayBuffer) {
  return buf.slice(0);
}

interface DocsWorkspaceProps {
  docBuf: ArrayBuffer;
  fileName: string;
  onNewFile: () => void;
  onDocUpdate?: (buf: ArrayBuffer) => void;
}

export function DocsWorkspace({
  docBuf,
  fileName,
  onNewFile,
  onDocUpdate,
}: DocsWorkspaceProps) {
  const t = useTranslations("docs");
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

  const [scannedTables, setScannedTables] = useState<ExtractedTable[]>([]);
  const [selectedTableIndices, setSelectedTableIndices] = useState<Set<number>>(
    new Set()
  );
  const [scanningTables, setScanningTables] = useState(false);

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

  const handleFillDownload = async () => {
    if (!fillValidation?.canFill || !fillRows.length) return;
    setFillError(null);
    setBusy(true);
    try {
      const out = await fillDocxTemplate(docBuf, fillRows);
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
        active={activeTool === "fill"}
        onClick={() => toggleTool("fill")}
      />
      <ToolbarIconButton
        icon={<Eraser />}
        label={t("clean.title")}
        active={activeTool === "clean"}
        onClick={() => toggleTool("clean")}
      />
      <ToolbarIconButton
        icon={<FileSpreadsheet />}
        label={t("extract.title")}
        active={activeTool === "extract"}
        onClick={() => toggleTool("extract")}
      />
      <ToolbarIconButton
        icon={<Braces />}
        label={t("template.title")}
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

      {fillRows.length > 0 && (
        <p className="mt-3 text-xs font-medium">
          {t("fill.rowCount", { count: fillRows.length })}
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

      {fillRows.length > 0 && fillValidation?.canFill && (
        <div className="mt-3 space-y-2">
          <label className="text-xs font-medium">{t("fill.previewRow")}</label>
          <Select
            value={String(previewRowIndex)}
            onValueChange={(v) => {
              setPreviewRowIndex(Number(v));
              if (showingFilledPreview) resetPreviewToTemplate();
            }}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {fillRows.map((_, i) => (
                <SelectItem key={i} value={String(i)} className="text-xs">
                  {t("fill.rowLabel", { n: i + 1 })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
        disabled={
          busy ||
          !dataSheetBuf ||
          !fillRows.length ||
          !fillValidation?.canFill
        }
        onClick={() => void handleFillDownload()}
      >
        <Download className="mr-1.5 size-4" />
        {fillRows.length > 0
          ? t("fill.downloadBatch", { count: fillRows.length })
          : t("generate")}
      </SparkHoverButton>

      {fillRows.length > 0 && (
        <p className="mt-2 text-[10px] text-muted-foreground">
          {t("fill.zipHint", { count: fillRows.length })}
        </p>
      )}
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
          <p className="mb-3 text-xs text-muted-foreground">{t("extract.noTables")}</p>
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
