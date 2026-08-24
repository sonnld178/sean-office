"use client";

import { useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { SparkHoverButton } from "@/components/SparkHoverButton";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ToolbarIconButton } from "@/components/tool/toolbar-icon-button";
import { PreviewZoomControls } from "@/components/tool/preview-zoom-controls";
import { Input } from "@/components/ui/input";
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
import {
  applyMappings,
  cleanRows,
  dedupeRows,
  exportCsv,
  exportMappingJson,
  exportXlsx,
  filterRows,
  parseMappingJson,
  validateRows,
  type FilterOp,
} from "@/lib/sheets-processor";
import { downloadSeanOfficeBlob } from "@/lib/download-names";
import { usePreviewZoom } from "@/hooks/use-preview-zoom";
import { useAppStore } from "@/store/app-store";
import { BrushCleaning, Download, Filter, GitCompare, ListChecks } from "lucide-react";

type SheetsTool = "map" | "review" | "export" | "filter" | "clean" | null;

interface SheetsWorkspaceProps {
  fileName: string;
  onNewFile: () => void;
}

export function SheetsWorkspace({ fileName, onNewFile }: SheetsWorkspaceProps) {
  const t = useTranslations("sheets");
  const mappingInputRef = useRef<HTMLInputElement>(null);
  const [activeTool, setActiveTool] = useState<SheetsTool>(null);
  const [dedupeKey, setDedupeKey] = useState("");
  const [processed, setProcessed] = useState<ReturnType<typeof applyMappings>>(
    []
  );
  const [errors, setErrors] = useState<string[]>([]);
  const [mappingError, setMappingError] = useState("");

  const [filterColumn, setFilterColumn] = useState("");
  const [filterOp, setFilterOp] = useState<FilterOp>("contains");
  const [filterValue, setFilterValue] = useState("");
  const [filterActive, setFilterActive] = useState(false);

  const [cleanRemoveEmptyRows, setCleanRemoveEmptyRows] = useState(true);
  const [cleanTrimCells, setCleanTrimCells] = useState(true);
  const [cleanRemoveEmptyColumns, setCleanRemoveEmptyColumns] = useState(false);

  const previewScrollRef = useRef<HTMLDivElement>(null);
  const { zoom, zoomIn, zoomOut, resetZoom } = usePreviewZoom(previewScrollRef);

  const {
    sheetsHeaders,
    sheetsRows,
    sheetsMappings,
    setSheetsData,
    setSheetsMappings,
  } = useAppStore();

  const mapped = useMemo(
    () => applyMappings(sheetsRows, sheetsMappings),
    [sheetsRows, sheetsMappings]
  );

  const baseData = processed.length ? processed : mapped;

  const filteredData = useMemo(() => {
    if (!filterActive || !filterColumn) return baseData;
    return filterRows(baseData, filterColumn, filterOp, filterValue);
  }, [baseData, filterActive, filterColumn, filterOp, filterValue]);

  const displayRows = filteredData.slice(0, 50);
  const displayHeaders =
    filteredData.length > 0
      ? Object.keys(filteredData[0])
      : baseData.length > 0
        ? Object.keys(baseData[0])
        : sheetsHeaders;

  const filterColumns =
    baseData.length > 0 ? Object.keys(baseData[0]) : sheetsHeaders;

  const toggleTool = (tool: SheetsTool) => {
    setActiveTool((prev) => (prev === tool ? null : tool));
  };

  const runReview = () => {
    let rows = mapped;
    if (dedupeKey) rows = dedupeRows(rows, dedupeKey);
    setProcessed(rows);
    setErrors(validateRows(rows));
  };

  const applyFilter = () => {
    if (!filterColumn) return;
    setFilterActive(true);
  };

  const clearFilter = () => {
    setFilterActive(false);
  };

  const runClean = () => {
    const { headers, rows } = cleanRows(sheetsRows, sheetsHeaders, {
      removeEmptyRows: cleanRemoveEmptyRows,
      trimCells: cleanTrimCells,
      removeEmptyColumns: cleanRemoveEmptyColumns,
    });
    setSheetsData(headers, rows);
    setProcessed([]);
    setFilterActive(false);
    setErrors([]);
  };

  const handleImportMapping = async (file: File) => {
    setMappingError("");
    try {
      const text = await file.text();
      setSheetsMappings(parseMappingJson(text));
    } catch {
      setMappingError(t("importMappingError"));
    }
  };

  const exportData = filteredData;

  const toolbar = (
    <>
      <ToolbarIconButton
        icon={<GitCompare />}
        label={t("map.title").replace(/^\d+\s·\s/, "")}
        active={activeTool === "map"}
        onClick={() => toggleTool("map")}
      />
      <ToolbarIconButton
        icon={<Filter />}
        label={t("filter.title")}
        active={activeTool === "filter"}
        onClick={() => toggleTool("filter")}
      />
      <ToolbarIconButton
        icon={<BrushCleaning />}
        label={t("clean.title")}
        active={activeTool === "clean"}
        onClick={() => toggleTool("clean")}
      />
      <ToolbarIconButton
        icon={<ListChecks />}
        label={t("review.title").replace(/^\d+\s·\s/, "")}
        active={activeTool === "review"}
        onClick={() => toggleTool("review")}
      />
      <ToolbarIconButton
        icon={<Download />}
        label={t("download.title").replace(/^\d+\s·\s/, "")}
        active={activeTool === "export"}
        onClick={() => toggleTool("export")}
      />
    </>
  );

  const rightPanel =
    activeTool === "map" ? (
      <>
        <ToolPanelHeader
          title={t("map.title").replace(/^\d+\s·\s/, "")}
          onClose={() => setActiveTool(null)}
        />
        <p className="mb-3 text-xs text-muted-foreground">{t("map.howTo")}</p>
        <div className="mb-3 flex flex-col gap-2">
          <input
            ref={mappingInputRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleImportMapping(file);
              e.target.value = "";
            }}
          />
          <Button
            size="sm"
            variant="outline"
            onClick={() => mappingInputRef.current?.click()}
          >
            {t("importMapping")}
          </Button>
          {mappingError ? (
            <p className="text-xs text-destructive">{mappingError}</p>
          ) : null}
        </div>
        <div className="space-y-3">
          {sheetsMappings.map((m, i) => (
            <div key={i} className="space-y-1">
              <Input value={m.source} readOnly className="text-xs" />
              <Input
                value={m.target}
                onChange={(e) => {
                  const next = [...sheetsMappings];
                  next[i] = { ...next[i], target: e.target.value };
                  setSheetsMappings(next);
                }}
                className="text-xs"
                placeholder={t("targetField")}
              />
              <Select
                value={m.transform}
                onValueChange={(v) => {
                  const next = [...sheetsMappings];
                  next[i] = {
                    ...next[i],
                    transform: v as typeof m.transform,
                  };
                  setSheetsMappings(next);
                }}
              >
                <SelectTrigger className="text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("none")}</SelectItem>
                  <SelectItem value="trim">{t("trim")}</SelectItem>
                  <SelectItem value="email">{t("email")}</SelectItem>
                  <SelectItem value="phone">{t("phone")}</SelectItem>
                  <SelectItem value="date">{t("date")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>
      </>
    ) : activeTool === "filter" ? (
      <>
        <ToolPanelHeader
          title={t("filter.title")}
          onClose={() => setActiveTool(null)}
        />
        <p className="mb-3 text-xs text-muted-foreground">{t("filter.howTo")}</p>
        <div className="space-y-3">
          <div className="space-y-2">
            <span className="text-xs font-medium">{t("filterColumn")}</span>
            <Select value={filterColumn} onValueChange={setFilterColumn}>
              <SelectTrigger className="text-xs">
                <SelectValue placeholder="" />
              </SelectTrigger>
              <SelectContent>
                {filterColumns.map((col) => (
                  <SelectItem key={col} value={col}>
                    {col}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <span className="text-xs font-medium">{t("filterCondition")}</span>
            <Select
              value={filterOp}
              onValueChange={(v) => setFilterOp(v as FilterOp)}
            >
              <SelectTrigger className="text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="contains">{t("filterContains")}</SelectItem>
                <SelectItem value="equals">{t("filterEquals")}</SelectItem>
                <SelectItem value="notEmpty">{t("filterNotEmpty")}</SelectItem>
                <SelectItem value="isEmpty">{t("filterIsEmpty")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {filterOp === "contains" || filterOp === "equals" ? (
            <div className="space-y-2">
              <span className="text-xs font-medium">{t("filterValue")}</span>
              <Input
                value={filterValue}
                onChange={(e) => setFilterValue(e.target.value)}
                className="text-xs"
              />
            </div>
          ) : null}
          <SparkHoverButton size="sm" onClick={applyFilter}>
            {t("applyFilter")}
          </SparkHoverButton>
          {filterActive ? (
            <>
              <p className="text-xs text-primary">{t("filterActive")}</p>
              <Button size="sm" variant="outline" onClick={clearFilter}>
                {t("clearFilter")}
              </Button>
            </>
          ) : null}
        </div>
      </>
    ) : activeTool === "clean" ? (
      <>
        <ToolPanelHeader
          title={t("clean.title")}
          onClose={() => setActiveTool(null)}
        />
        <p className="mb-3 text-xs text-muted-foreground">{t("clean.howTo")}</p>
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-xs">
            <Checkbox
              checked={cleanRemoveEmptyRows}
              onCheckedChange={(v) => setCleanRemoveEmptyRows(v === true)}
            />
            {t("cleanRemoveEmptyRows")}
          </label>
          <label className="flex items-center gap-2 text-xs">
            <Checkbox
              checked={cleanTrimCells}
              onCheckedChange={(v) => setCleanTrimCells(v === true)}
            />
            {t("cleanTrimCells")}
          </label>
          <label className="flex items-center gap-2 text-xs">
            <Checkbox
              checked={cleanRemoveEmptyColumns}
              onCheckedChange={(v) => setCleanRemoveEmptyColumns(v === true)}
            />
            {t("cleanRemoveEmptyColumns")}
          </label>
          <SparkHoverButton size="sm" onClick={runClean}>
            {t("applyClean")}
          </SparkHoverButton>
        </div>
      </>
    ) : activeTool === "review" ? (
      <>
        <ToolPanelHeader
          title={t("review.title").replace(/^\d+\s·\s/, "")}
          onClose={() => setActiveTool(null)}
        />
        <p className="mb-3 text-xs text-muted-foreground">{t("review.howTo")}</p>
        <div className="space-y-3">
          <div className="space-y-2">
            <span className="text-xs font-medium">{t("dedupe")}</span>
            <Select value={dedupeKey} onValueChange={setDedupeKey}>
              <SelectTrigger className="text-xs">
                <SelectValue placeholder="" />
              </SelectTrigger>
              <SelectContent>
                {sheetsMappings.map((m) => (
                  <SelectItem key={m.target} value={m.target}>
                    {m.target}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button size="sm" className="w-full" onClick={runReview}>
            {t("runReview")}
          </Button>
          {errors.length > 0 ? (
            <ul className="text-xs text-destructive">
              {errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          ) : processed.length > 0 ? (
            <p className="text-xs text-primary">{t("noErrors")}</p>
          ) : null}
        </div>
      </>
    ) : activeTool === "export" ? (
      <>
        <ToolPanelHeader
          title={t("download.title").replace(/^\d+\s·\s/, "")}
          onClose={() => setActiveTool(null)}
        />
        <p className="mb-3 text-xs text-muted-foreground">{t("download.howTo")}</p>
        <div className="flex flex-col gap-2">
          <Button
            size="sm"
            onClick={() =>
              downloadSeanOfficeBlob(exportCsv(exportData), "excel", fileName, "csv")
            }
          >
            {t("exportCsv")}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() =>
              downloadSeanOfficeBlob(exportXlsx(exportData), "excel", fileName, "xlsx")
            }
          >
            {t("exportXlsx")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              downloadSeanOfficeBlob(
                exportMappingJson(sheetsMappings),
                "excel",
                fileName,
                "json",
                "mapping"
              )
            }
          >
            {t("exportMapping")}
          </Button>
        </div>
      </>
    ) : null;

  const rowCount = filteredData.length;
  const totalRows = baseData.length;

  return (
    <ToolWorkspaceShell
      fileName={fileName}
      onNewFile={onNewFile}
      toolbar={toolbar}
      rightPanel={rightPanel}
      preview={
        <div ref={previewScrollRef} className="relative min-h-full p-4 md:p-6">
          <div className="sticky top-0 z-10 mb-3 flex items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">
              {rowCount} {t("rows")} · {displayHeaders.length} {t("columns")}
              {filterActive && rowCount < totalRows
                ? ` · ${totalRows} ${t("rows")} total`
                : null}
              {displayRows.length < rowCount &&
                ` · showing ${displayRows.length}`}
            </p>
            <PreviewZoomControls
              zoom={zoom}
              onZoomIn={zoomIn}
              onZoomOut={zoomOut}
              onReset={resetZoom}
            />
          </div>
          <div
            className="origin-top overflow-x-auto rounded-lg border bg-background"
            style={{
              transform: `scale(${zoom})`,
              transformOrigin: "top left",
              width: zoom !== 1 ? `${100 / zoom}%` : undefined,
            }}
          >
            <Table>
              <TableHeader>
                <TableRow>
                  {displayHeaders.map((h) => (
                    <TableHead key={h} className="text-xs">
                      {h}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {displayRows.map((row, i) => (
                  <TableRow key={i}>
                    {displayHeaders.map((h) => (
                      <TableCell key={h} className="max-w-[200px] truncate text-xs">
                        {String(row[h] ?? "")}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      }
    />
  );
}
