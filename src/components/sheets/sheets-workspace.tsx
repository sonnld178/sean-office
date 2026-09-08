"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { SheetRow } from "@/store/app-store";
import { SparkHoverButton } from "@/components/SparkHoverButton";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ToolbarIconButton } from "@/components/tool/toolbar-icon-button";
import { PreviewZoomControls } from "@/components/tool/preview-zoom-controls";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
  cleanRows,
  countIssuesByRule,
  detectReviewRules,
  deterministicFixes,
  exportCsv,
  exportXlsx,
  filterRowsMulti,
  runReviewChecks,
  uniqueColumnValues,
  type ColumnFilter,
  type FilterOp,
  type ReviewIssue,
  type ReviewRule,
} from "@/lib/sheets-processor";
import { downloadSeanOfficeBlob } from "@/lib/download-names";
import { usePreviewZoom } from "@/hooks/use-preview-zoom";
import { useAppStore } from "@/store/app-store";
import { BrushCleaning, ChevronDown, ChevronRight, Download, Filter, ListChecks, Sparkles, X } from "lucide-react";

type SheetsTool = "review" | "export" | "filter" | "clean" | null;

interface SheetsWorkspaceProps {
  fileName: string;
  onNewFile: () => void;
}

export function SheetsWorkspace({ fileName, onNewFile }: SheetsWorkspaceProps) {
  const t = useTranslations("sheets");
  const locale = useLocale();
  const [activeTool, setActiveTool] = useState<SheetsTool>(null);
  const [processed, setProcessed] = useState<SheetRow[]>(
    []
  );
  const [reviewRules, setReviewRules] = useState<ReviewRule[] | null>(null);
  const [reviewIssues, setReviewIssues] = useState<ReviewIssue[]>([]);
  const [ignoredRuleIds, setIgnoredRuleIds] = useState<Set<string>>(new Set());
  const [lastIgnored, setLastIgnored] = useState<{ id: string; label: string } | null>(null);
  const [focusedIssue, setFocusedIssue] = useState<{
    ruleId: string;
    rowIndex: number;
    column: string;
  } | null>(null);
  const [focusNotice, setFocusNotice] = useState<string | null>(null);

  type AiFix = {
    rowIndex: number;
    column: string;
    action: "set" | "delete_row" | "keep";
    newValue?: string;
    reason?: string;
    deterministic?: boolean;
  };
  type FixJobState = {
    jobId: string;
    token: string;
    status: "queued" | "running" | "done" | "error";
    position: number;
    etaMs: number;
    error?: string;
    sending?: boolean;
  };
  const [fixJobs, setFixJobs] = useState<Record<string, FixJobState>>({});
  const [fixDiff, setFixDiff] = useState<{
    ruleId: string;
    fixes: AiFix[];
    aiPending: boolean;
  } | null>(null);
  const [expandedIssue, setExpandedIssue] = useState<string | null>(null);
  const [fixPreviewOpen, setFixPreviewOpen] = useState(true);
  const [undoSnapshot, setUndoSnapshot] = useState<{
    headers: string[];
    rows: SheetRow[];
  } | null>(null);
  const rowRefs = useRef(new Map<number, HTMLTableRowElement>());

  const [columnFilters, setColumnFilters] = useState<Record<string, ColumnFilter>>({});
  const [openFilterColumn, setOpenFilterColumn] = useState<string | null>(null);
  const [filterSearch, setFilterSearch] = useState("");
  const [filterOpTemp, setFilterOpTemp] = useState<FilterOp>("contains");
  const [filterValueTemp, setFilterValueTemp] = useState("");
  const [selectedValuesTemp, setSelectedValuesTemp] = useState<string[]>([]);

  const [cleanRemoveEmptyRows, setCleanRemoveEmptyRows] = useState(true);
  const [cleanTrimCells, setCleanTrimCells] = useState(true);
  const [cleanRemoveEmptyColumns, setCleanRemoveEmptyColumns] = useState(false);

  const previewScrollRef = useRef<HTMLDivElement>(null);
  const { zoom, zoomIn, zoomOut, resetZoom } = usePreviewZoom(previewScrollRef);

  // ignoredRuleIds is per file, per session — reset on file change / new file
  useEffect(() => {
    setIgnoredRuleIds(new Set());
    setLastIgnored(null);
  }, [fileName]);

  useEffect(() => {
    if (!lastIgnored) return;
    const timer = setTimeout(() => setLastIgnored(null), 5000);
    return () => clearTimeout(timer);
  }, [lastIgnored]);

  const handleNewFile = () => {
    setIgnoredRuleIds(new Set());
    setLastIgnored(null);
    onNewFile();
  };

  const handleIgnoreRule = (rule: ReviewRule) => {
    setIgnoredRuleIds((prev) => new Set([...prev, rule.id]));
    setLastIgnored({ id: rule.id, label: rule.label });
    if (focusedIssue?.ruleId === rule.id) setFocusedIssue(null);
    if (fixDiff?.ruleId === rule.id) setFixDiff(null);
  };

  const handleUndoIgnore = () => {
    if (!lastIgnored) return;
    const id = lastIgnored.id;
    setIgnoredRuleIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    setLastIgnored(null);
  };

  const visibleReviewRules = useMemo(
    () => reviewRules?.filter((r) => !ignoredRuleIds.has(r.id)) ?? null,
    [reviewRules, ignoredRuleIds]
  );
  const visibleReviewIssues = useMemo(
    () => reviewIssues.filter((i) => !ignoredRuleIds.has(i.ruleId)),
    [reviewIssues, ignoredRuleIds]
  );

  const {
    sheetsHeaders,
    sheetsRows,
    setSheetsData,
  } = useAppStore();

  const mapped = sheetsRows;

  const baseData = processed.length ? processed : mapped;

  const filteredData = useMemo(() => {
    const filters = Object.values(columnFilters);
    if (!filters.length) return baseData;
    return filterRowsMulti(baseData, filters);
  }, [baseData, columnFilters]);

  const filterActive = Object.keys(columnFilters).length > 0;
  const activeFilterCount = Object.keys(columnFilters).length;

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
    setProcessed(mapped);
    // Detect rules from headers first (content profiling is only a fallback
    // inside detectReviewRules). Reuse existing rules so user toggles persist.
    const headers =
      mapped.length > 0 ? Object.keys(mapped[0]) : sheetsHeaders;
    const rules =
      reviewRules && reviewRules.length
        ? reviewRules
        : detectReviewRules(headers, mapped).rules;
    setReviewRules(rules);
    setReviewIssues(runReviewChecks(mapped, rules));
  };

  const toggleReviewRule = (id: string, enabled: boolean) => {
    setReviewRules((prev) => {
      if (!prev) return prev;
      const next = prev.map((r) => (r.id === id ? { ...r, enabled } : r));
      setReviewIssues(runReviewChecks(mapped, next));
      return next;
    });
  };

  // Scroll preview to the focused issue row.
  useEffect(() => {
    if (!focusedIssue) return;
    rowRefs.current
      .get(focusedIssue.rowIndex)
      ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [focusedIssue]);

  const focusIssue = (issue: ReviewIssue) => {
    // Issues point at `mapped`; the preview may show a filtered/deduped view.
    if (!baseData.includes(mapped[issue.rowIndex])) {
      setFocusNotice(t("focusHidden"));
      return;
    }
    setFocusNotice(null);
    setFocusedIssue({ ruleId: issue.ruleId, rowIndex: issue.rowIndex, column: issue.column });
  };

  const startAiFix = async (rule: ReviewRule) => {
    setFixPreviewOpen(true);
    const issues = reviewIssues.filter((i) => i.ruleId === rule.id).slice(0, 50);
    if (!issues.length || !reviewRules) return;
    // 1) Deterministic local fixes appear instantly — no waiting.
    const det = deterministicFixes(mapped, issues, reviewRules, locale);
    const detRows = new Set(det.map((d) => d.rowIndex));
    const aiIssues = issues.filter((i) => !detRows.has(i.rowIndex));
    setFixDiff({
      ruleId: rule.id,
      fixes: det.map((d) => ({ ...d, deterministic: true })),
      aiPending: aiIssues.length > 0,
    });
    // 2) Optimistic queued state synchronously, BEFORE the network call.
    setFixJobs((prev) => ({
      ...prev,
      [rule.id]: {
        jobId: "",
        token: "",
        status: "queued",
        position: 0,
        etaMs: 0,
        sending: true,
      },
    }));
    if (!aiIssues.length) {
      // Everything fixed locally — no queue needed.
      setFixJobs((prev) => ({
        ...prev,
        [rule.id]: {
          jobId: "",
          token: "",
          status: "done",
          position: 0,
          etaMs: 0,
        },
      }));
      return;
    }
    // 3) Enqueue AI for the remainder (20s timeout to match provider 20s — never hang the UI).
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20000);
    try {
      const res = await fetch("/api/ai/sheets/fix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          column: rule.column,
          ruleId: rule.id,
          ruleLabel: rule.label,
          locale,
          issues: aiIssues.map((i) => ({
            rowIndex: i.rowIndex,
            column: i.column,
            value: i.value,
            message: i.message,
          })),
        }),
        signal: ctrl.signal,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "AI Fix failed");
      setFixJobs((prev) => ({
        ...prev,
        [rule.id]: {
          jobId: json.jobId,
          token: json.token,
          status: "queued",
          position: json.position ?? 0,
          etaMs: json.etaMs ?? 0,
          sending: false,
        },
      }));
    } catch (e) {
      const timeout = e instanceof Error && e.name === "AbortError";
      setFixJobs((prev) => ({
        ...prev,
        [rule.id]: {
          jobId: "",
          token: "",
          status: "error",
          position: 0,
          etaMs: 0,
          error: timeout ? t("aiFixTimeout") : e instanceof Error ? e.message : "AI Fix failed",
        },
      }));
      // Local fixes stay visible; just mark AI as no longer coming.
      setFixDiff((prev) =>
        prev?.ruleId === rule.id ? { ...prev, aiPending: false } : prev
      );
    } finally {
      clearTimeout(timer);
    }
  };

  // Poll pending fix jobs every 2s.
  useEffect(() => {
    const pending = Object.entries(fixJobs).filter(
      ([, j]) => j.status === "queued" || j.status === "running"
    );
    if (!pending.length) return;
    const timer = setInterval(() => {
      void (async () => {
        for (const [ruleId, j] of pending) {
          if (!j.jobId) continue;
          try {
            const res = await fetch(
              `/api/ai/jobs/${j.jobId}?token=${encodeURIComponent(j.token)}`
            );
            const json = await res.json();
            if (!res.ok) throw new Error(json.error ?? "poll failed");
            setFixJobs((prev) => ({
              ...prev,
              [ruleId]: {
                ...prev[ruleId],
                status: json.status,
                position: json.position ?? 0,
                etaMs: json.etaMs ?? 0,
                error: json.error ?? undefined,
              },
            }));
            const fixes = json.result?.fixes as AiFix[] | undefined;
            if (json.status === "done" && Array.isArray(fixes)) {
              // Merge AI fixes with the instant deterministic ones
              // (skip rows already covered locally).
              setFixDiff((prev) => {
                if (!prev || prev.ruleId !== ruleId) {
                  return { ruleId, fixes, aiPending: false };
                }
                const have = new Set(prev.fixes.map((f) => f.rowIndex));
                const extra = fixes.filter((f) => !have.has(f.rowIndex)).slice(0, 50);
                return { ruleId, fixes: [...prev.fixes, ...extra], aiPending: false };
              });
            }
          } catch (e) {
            setFixJobs((prev) => ({
              ...prev,
              [ruleId]: {
                ...prev[ruleId],
                status: "error",
                error: e instanceof Error ? e.message : "poll failed",
              },
            }));
          }
        }
      })();
    }, 2000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fixJobs]);

  const applyFixDiff = () => {
    if (!fixDiff) return;
    setUndoSnapshot({ headers: [...sheetsHeaders], rows: sheetsRows.map((r) => ({ ...r })) });
    const next = sheetsRows.map((r) => ({ ...r }));
    const toDelete: number[] = [];
    for (const f of fixDiff.fixes) {
      if (f.action === "keep") continue;
      if (f.action === "delete_row") {
        toDelete.push(f.rowIndex);
        continue;
      }
      if (next[f.rowIndex]) next[f.rowIndex] = { ...next[f.rowIndex], [f.column]: f.newValue ?? "" };
    }
    toDelete
      .sort((a, b) => b - a)
      .forEach((i) => {
        if (i >= 0 && i < next.length) next.splice(i, 1);
      });
    setSheetsData(sheetsHeaders, next);
    setProcessed([]);
    setFixDiff(null);
    if (reviewRules) setReviewIssues(runReviewChecks(next, reviewRules));
  };

  const undoFix = () => {
    if (!undoSnapshot) return;
    setSheetsData(undoSnapshot.headers, undoSnapshot.rows);
    setUndoSnapshot(null);
    setProcessed([]);
    if (reviewRules) setReviewIssues(runReviewChecks(undoSnapshot.rows, reviewRules));
  };

  const applyFilterForColumn = (col: string) => {
    const hasSelected = selectedValuesTemp.length > 0;
    const hasCondition = filterOpTemp === "notEmpty" || filterOpTemp === "isEmpty" || filterValueTemp.trim() !== "";
    if (!hasSelected && !hasCondition) return;
    const next: ColumnFilter = hasSelected
      ? { column: col, op: "equals", selectedValues: [...selectedValuesTemp] }
      : { column: col, op: filterOpTemp, value: filterValueTemp };
    setColumnFilters((prev) => ({ ...prev, [col]: next }));
    setOpenFilterColumn(null);
  };

  const clearFilterForColumn = (col: string) => {
    setColumnFilters((prev) => {
      const next = { ...prev };
      delete next[col];
      return next;
    });
    setOpenFilterColumn(null);
  };

  const clearAllFilters = () => {
    setColumnFilters({});
    setOpenFilterColumn(null);
  };

  const openFilterForColumn = (col: string) => {
    const existing = columnFilters[col];
    if (existing) {
      if (existing.selectedValues) {
        setSelectedValuesTemp([...existing.selectedValues]);
        setFilterOpTemp("contains");
        setFilterValueTemp("");
      } else {
        setSelectedValuesTemp([]);
        setFilterOpTemp(existing.op);
        setFilterValueTemp(existing.value ?? "");
      }
    } else {
      setSelectedValuesTemp([]);
      setFilterOpTemp("contains");
      setFilterValueTemp("");
    }
    setFilterSearch("");
    setOpenFilterColumn(col);
  };

  const runClean = () => {
    const { headers, rows } = cleanRows(sheetsRows, sheetsHeaders, {
      removeEmptyRows: cleanRemoveEmptyRows,
      trimCells: cleanTrimCells,
      removeEmptyColumns: cleanRemoveEmptyColumns,
    });
    setSheetsData(headers, rows);
    setProcessed([]);
    setColumnFilters({});
    setOpenFilterColumn(null);
    setReviewIssues([]);
  };

  const exportData = filteredData;

  const toolbar = (
    <>
      <div className="relative">
        <ToolbarIconButton
          icon={<Filter />}
          label={filterActive ? `${t("filter.title")} (${activeFilterCount})` : t("filter.title")}
          tip={t("tipFilter")}
          active={activeTool === "filter" || filterActive}
          onClick={() => toggleTool("filter")}
        />
        {activeFilterCount > 0 && activeTool !== "filter" && (
          <span className="pointer-events-none absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-medium text-primary-foreground">
            {activeFilterCount}
          </span>
        )}
      </div>
      <ToolbarIconButton
        icon={<BrushCleaning />}
        label={t("clean.title")}
        tip={t("tipClean")}
        active={activeTool === "clean"}
        onClick={() => toggleTool("clean")}
      />
      <ToolbarIconButton
        icon={<ListChecks />}
        label={t("review.title").replace(/^\d+\s·\s/, "")}
        tip={t("tipReview")}
        active={activeTool === "review"}
        onClick={() => toggleTool("review")}
      />
      <ToolbarIconButton
        icon={<Download />}
        label={t("download.title").replace(/^\d+\s·\s/, "")}
        tip={t("tipExport")}
        active={activeTool === "export"}
        onClick={() => toggleTool("export")}
      />
    </>
  );

  const rightPanel =
    activeTool === "filter" ? (
      <>
        <ToolPanelHeader
          title={t("filter.title")}
          onClose={() => setActiveTool(null)}
        />
        <p className="mb-3 text-xs text-muted-foreground">{t("filter.howTo")}</p>
        {filterActive ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium">
                {activeFilterCount} {activeFilterCount === 1 ? "filter" : "filters"} · AND
              </span>
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={clearAllFilters}>
                {t("clearFilter")} all
              </Button>
            </div>
            <div className="space-y-2">
              {Object.entries(columnFilters).map(([col, f]) => (
                <div key={col} className="flex items-center justify-between gap-2 rounded-md border bg-muted/20 px-2 py-1.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium">{col}</p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {f.selectedValues ? `${f.selectedValues.length} selected` : f.op === "notEmpty" ? t("filterNotEmpty") : f.op === "isEmpty" ? t("filterIsEmpty") : `${f.op === "contains" ? t("filterContains") : t("filterEquals")} "${f.value}"`}
                    </p>
                  </div>
                  <Button size="icon" variant="ghost" className="size-6 shrink-0" onClick={() => clearFilterForColumn(col)}>
                    <X className="size-3.5" />
                  </Button>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">Matches all filters (AND). Use column header funnel to add more.</p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">No active filters. Click the funnel icon in any column header to filter.</p>
          </div>
        )}
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
        {lastIgnored ? (
          <div className="mb-3 flex items-center justify-between gap-2 rounded-md border bg-muted/50 px-3 py-2 text-xs">
            <span className="min-w-0 flex-1 truncate">{t("ignored", { label: lastIgnored.label })}</span>
            <Button size="sm" variant="ghost" onClick={handleUndoIgnore}>
              {t("ignoreUndo")}
            </Button>
          </div>
        ) : null}
        <div className="space-y-3">
          <Button size="sm" className="w-full" onClick={runReview}>
            {t("runReview")}
          </Button>
          {!visibleReviewRules ? (
            <p className="text-xs text-muted-foreground">{t("reviewNoRules")}</p>
          ) : null}
          {focusNotice ? (
            <p className="rounded border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-600">
              {focusNotice}
            </p>
          ) : null}
          {undoSnapshot ? (
            <Button size="sm" variant="outline" className="w-full" onClick={undoFix}>
              {t("aiFixUndo")}
            </Button>
          ) : null}
          {visibleReviewIssues.length > 0 ? (
            (() => {
              const TYPE_LABEL: Record<string, string> = {
                empty: t("reviewTypeMissing"),
                email: t("reviewTypeEmail"),
                phone: t("reviewTypePhone"),
                date: t("reviewTypeDate"),
                duplicate: t("reviewTypeDuplicate"),
              };
              const typeGroups = (() => {
                const byType = new Map<string, { type: string; total: number; byRule: Map<string, { rule: ReviewRule; issues: ReviewIssue[] }> }>();
                for (const issue of visibleReviewIssues) {
                  const rule = visibleReviewRules?.find((r) => r.id === issue.ruleId);
                  if (!rule) continue;
                  if (!byType.has(rule.type)) byType.set(rule.type, { type: rule.type, total: 0, byRule: new Map() });
                  const g = byType.get(rule.type)!;
                  g.total++;
                  if (!g.byRule.has(rule.id)) g.byRule.set(rule.id, { rule, issues: [] });
                  g.byRule.get(rule.id)!.issues.push(issue);
                }
                return Array.from(byType.values());
              })();
              return (
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-1">
                    {typeGroups.map((g) => (
                      <span key={g.type} className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium">
                        {TYPE_LABEL[g.type] ?? g.type} · {g.total}
                      </span>
                    ))}
                  </div>
                  <div className="space-y-3">
                    {typeGroups.map((g) => {
                      const first = Array.from(g.byRule.values())[0];
                      if (!first) return null;
                      const rule = first.rule;
                      const list = Array.from(g.byRule.values()).flatMap((v) => v.issues);
                      const job = fixJobs[rule.id];
                      const busy = job?.status === "queued" || job?.status === "running";
                      const showQueue = !!job && (busy || job.status === "error") && job.position > 0;
                      const showUpsell = !!job && busy && job.etaMs > 20000;
                      const diff = fixDiff?.ruleId === rule.id ? fixDiff : null;
                      return (
                        <div key={g.type} className="space-y-1 rounded-lg border p-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="min-w-0 flex-1 break-words text-xs font-semibold" title={rule.label}>
                              {TYPE_LABEL[g.type] ?? g.type}
                            </span>
                            <div className="flex shrink-0 items-center gap-1">
                              {rule && !diff ? (
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="size-7 hover:bg-primary/10 hover:text-primary hover:scale-105 transition-all"
                                  title={t("aiFix")}
                                  aria-label={t("aiFix")}
                                  disabled={busy}
                                  onClick={() => void startAiFix(rule)}
                                >
                                  <Sparkles className="size-4" />
                                </Button>
                              ) : null}
                              {rule ? (
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="size-7 hover:bg-destructive/10 hover:text-destructive hover:scale-105 transition-all"
                                  title={t("ignore")}
                                  aria-label={t("ignore")}
                                  onClick={() => handleIgnoreRule(rule)}
                                >
                                  <X className="size-4" />
                                </Button>
                              ) : null}
                            </div>
                          </div>
                              {busy ? (
                                <div className="space-y-1">
                                  {job?.sending ? (
                                    <p className="text-[11px] text-muted-foreground">{t("aiFixSending")}</p>
                                  ) : job?.status === "running" ? (
                                    <p className="text-[11px] text-muted-foreground">{t("aiFixAiWorking")}</p>
                                  ) : null}
                                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                                    <div className="h-full w-1/3 animate-pulse rounded-full bg-primary" />
                                  </div>
                                  {showQueue ? (
                                    <p className="text-[11px] text-muted-foreground">
                                      {t("queueAhead", { n: job.position + 1, s: Math.max(1, Math.ceil(job.etaMs / 1000)) })}
                                    </p>
                                  ) : null}
                                  {showUpsell ? (
                                    <p className="rounded bg-primary/10 p-1.5 text-[11px] text-primary">
                                      {t("queueUpgrade")}
                                    </p>
                                  ) : null}
                                </div>
                              ) : null}
                              {job?.status === "error" ? (
                                <p className="text-[11px] text-destructive">{job.error ?? t("aiFixError")}</p>
                              ) : null}
                              {diff ? (
                                <div className="space-y-1">
                                  <button
                                    onClick={() => setFixPreviewOpen((v) => !v)}
                                    className="flex w-full items-center gap-1 rounded px-1 py-0.5 text-left hover:bg-muted"
                                  >
                                    {fixPreviewOpen ? <ChevronDown className="size-3.5 shrink-0" /> : <ChevronRight className="size-3.5 shrink-0" />}
                                    <span className="text-[11px] font-medium">{t("aiFixPreview", { n: diff.fixes.length })}</span>
                                    <span className="ml-auto text-[11px] text-muted-foreground">{fixPreviewOpen ? "▾" : "▸"}</span>
                                  </button>
                                  {diff.aiPending ? (
                                    <p className="text-[11px] text-muted-foreground">{t("aiFixAiPending")}</p>
                                  ) : null}
                                  {fixPreviewOpen ? (
                                    <>
                                      <div className="max-h-48 space-y-1 overflow-auto rounded bg-background p-1">
                                        {diff.fixes.slice(0, 30).map((f, i) => {
                                          const oldVal = String(mapped[f.rowIndex]?.[f.column] ?? "");
                                          const newVal = f.newValue ?? "";
                                          return (
                                            <div
                                              key={i}
                                              className="break-words whitespace-pre-wrap font-mono text-[11px]"
                                              title={f.action === "set" ? `${oldVal} → ${newVal}${f.reason ? ` · ${f.reason}` : ""}` : undefined}
                                            >
                                              <span className="font-semibold">
                                                {t("reviewRow")} {f.rowIndex + 2} [{f.column}]:
                                              </span>{" "}
                                              {f.action === "delete_row" ? (
                                                <span className="text-destructive">— {t("aiFixDeleteRow")}</span>
                                              ) : f.action === "keep" ? (
                                                <span className="text-muted-foreground">{t("aiFixKeep")}</span>
                                              ) : (
                                                <span>
                                                  <span className="break-all line-through decoration-destructive/50">{oldVal || "∅"}</span>{" "}
                                                  <span className="text-primary break-all">→ {newVal || "∅"}</span>
                                                </span>
                                              )}
                                              {f.deterministic ? (
                                                <span className="ml-1 rounded bg-primary/10 px-1 text-primary">{t("aiFixLocal")}</span>
                                              ) : null}
                                              {f.reason ? <span className="text-muted-foreground"> · {f.reason}</span> : null}
                                            </div>
                                          );
                                        })}
                                      </div>
                                      <div className="flex gap-2">
                                        <Button size="sm" className="flex-1" onClick={applyFixDiff}>
                                          {t("aiFixApply")}
                                        </Button>
                                        <Button size="sm" variant="ghost" onClick={() => setFixDiff(null)}>
                                          {t("aiFixDiscard")}
                                        </Button>
                                      </div>
                                    </>
                                  ) : null}
                                </div>
                              ) : null}
                              <div className="max-h-40 space-y-1 overflow-auto">
                                {list.slice(0, 50).map((issue, i) => {
                                  const active =
                                    focusedIssue?.ruleId === issue.ruleId &&
                                    focusedIssue?.rowIndex === issue.rowIndex;
                                  const key = `${issue.ruleId}:${issue.rowIndex}`;
                                  const expanded = expandedIssue === key;
                                  return (
                                    <div
                                      key={i}
                                      className={`rounded px-1 py-0.5 ${active ? "bg-amber-500/15 ring-1 ring-amber-500/50" : ""}`}
                                    >
                                      <div className="flex w-full items-center gap-1 text-[11px]">
                                        <button
                                          onClick={() => focusIssue(issue)}
                                          className="flex min-w-0 flex-1 items-center justify-between gap-2 rounded text-left hover:bg-muted"
                                        >
                                          <span className="truncate font-mono">
                                            {t("reviewRow")} {issue.rowIndex + 2} [{issue.column}]: {issue.message}
                                          </span>
                                          <span
                                            className={
                                              issue.severity === "warning"
                                                ? "shrink-0 rounded bg-amber-500/10 px-1 py-0.5 text-amber-600"
                                                : "shrink-0 rounded bg-muted px-1 py-0.5 text-muted-foreground"
                                            }
                                          >
                                            {issue.severity}
                                          </span>
                                        </button>
                                        <button
                                          aria-label={expanded ? "collapse" : "expand"}
                                          onClick={() => setExpandedIssue(expanded ? null : key)}
                                          className="shrink-0 rounded p-0.5 hover:bg-muted"
                                        >
                                          {expanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
                                        </button>
                                      </div>
                                      {expanded ? (
                                        <div className="mt-1 space-y-0.5 break-words rounded bg-muted/50 p-1.5 font-mono text-[11px]">
                                          <p>
                                            {t("reviewRow")} {issue.rowIndex + 2} · {issue.column}
                                          </p>
                                          <p>{issue.message}</p>
                                          <p className="text-muted-foreground">{String(issue.value ?? "")}</p>
                                        </div>
                                      ) : null}
                                    </div>
                                  );
                                })}
                              </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()
            ) : processed.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs text-primary">{t("reviewAllClean")}</p>
              <Button size="sm" className="w-full" onClick={() => setActiveTool("export")}>
                {t("goExport")}
              </Button>
            </div>
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
        </div>
      </>
    ) : null;

  const rowCount = filteredData.length;
  const totalRows = baseData.length;

  return (
    <ToolWorkspaceShell
      fileName={fileName}
      onNewFile={handleNewFile}
      toolbar={toolbar}
      rightPanel={rightPanel}
      preview={
        <div ref={previewScrollRef} className="relative min-h-full p-4 md:p-6">
          {visibleReviewRules && visibleReviewRules.length > 0 ? (
            <div className="sticky top-0 z-20 mb-3 flex flex-wrap items-center gap-2 rounded-lg border bg-card p-2">
              <span className="text-xs font-medium">{t("reviewRules")}:</span>
              {visibleReviewRules.map((r) => {
                const counts = countIssuesByRule(visibleReviewIssues);
                const n = counts[r.id] ?? 0;
                return (
                  <label key={r.id} className="flex items-center gap-1.5 rounded-full border bg-background px-2.5 py-1 text-xs">
                    <Checkbox checked={r.enabled} onCheckedChange={(v) => toggleReviewRule(r.id, v === true)} />
                    <span title={r.label}>
                      {r.label}
                      {r.confidence === "low" ? <span className="text-muted-foreground"> ({t("reviewGuessed")})</span> : null}
                    </span>
                    {n > 0 ? (
                      <span className="shrink-0 rounded-full bg-destructive/10 px-1.5 py-0.5 text-[10px] text-destructive">
                        {n}
                      </span>
                    ) : null}
                  </label>
                );
              })}
            </div>
          ) : null}
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
          {filterActive && (
            <div className="sticky top-[48px] z-10 mb-3 flex flex-wrap items-center gap-1.5 rounded-lg border bg-card/90 px-2 py-1.5 text-xs backdrop-blur">
              <span className="font-medium">Filters:</span>
              {Object.entries(columnFilters).map(([col, f]) => (
                <span key={col} className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5">
                  <span className="max-w-[120px] truncate font-medium">{col}:</span>
                  <span className="max-w-[140px] truncate text-muted-foreground">
                    {f.selectedValues
                      ? `${f.selectedValues.length} selected`
                      : f.op === "notEmpty"
                        ? t("filterNotEmpty")
                        : f.op === "isEmpty"
                          ? t("filterIsEmpty")
                          : `${f.op === "contains" ? t("filterContains") : t("filterEquals")} "${f.value}"`}
                  </span>
                  <button
                    onClick={() => clearFilterForColumn(col)}
                    className="ml-1 rounded-full p-0.5 hover:bg-primary/20"
                    aria-label={`Clear ${col} filter`}
                  >
                    <X className="size-3" />
                  </button>
                </span>
              ))}
              <Button size="sm" variant="ghost" className="ml-1 h-6 text-xs" onClick={clearAllFilters}>
                Clear all
              </Button>
              <span className="ml-auto shrink-0 text-muted-foreground">AND · {rowCount} of {totalRows}</span>
            </div>
          )}
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
                  <TableHead className="sticky left-0 w-12 bg-background text-xs">#</TableHead>
                  {displayHeaders.map((h) => {
                    const isActive = !!columnFilters[h];
                    const isOpen = openFilterColumn === h;
                    const uniqueVals = uniqueColumnValues(baseData, h, 100);
                    const filteredVals = filterSearch
                      ? uniqueVals.filter((v) => v.toLowerCase().includes(filterSearch.toLowerCase()))
                      : uniqueVals;
                    const allSelected =
                      filteredVals.length > 0 && filteredVals.every((v) => selectedValuesTemp.includes(v));
                    return (
                      <TableHead key={h} className="whitespace-nowrap text-xs group">
                        <Popover open={isOpen} onOpenChange={(open) => setOpenFilterColumn(open ? h : null)}>
                          <div className="flex items-center justify-between gap-1">
                            <span className="truncate" title={h}>
                              {h}
                            </span>
                            <PopoverTrigger asChild>
                              <button
                                onClick={() => {
                                  if (!isOpen) openFilterForColumn(h);
                                }}
                                className={`flex size-5 shrink-0 items-center justify-center rounded hover:bg-muted ${isActive ? "bg-primary/10 text-primary opacity-100" : "opacity-0 group-hover:opacity-60"} ${isOpen ? "!opacity-100 bg-muted" : ""}`}
                                aria-label={`Filter ${h}`}
                              >
                                <Filter className="size-3" />
                              </button>
                            </PopoverTrigger>
                          </div>
                          <PopoverContent align="start" side="bottom" sideOffset={4} collisionPadding={8} className="w-64 p-2">
                            <div className="space-y-2">
                              <Input
                                placeholder="Search values"
                                value={filterSearch}
                                onChange={(e) => setFilterSearch(e.target.value)}
                                className="h-7 text-xs"
                              />
                              <label className="flex items-center gap-2 rounded px-1 py-0.5 text-xs hover:bg-muted">
                                <Checkbox
                                  checked={allSelected}
                                  onCheckedChange={(v) => {
                                    if (v) setSelectedValuesTemp([...filteredVals]);
                                    else setSelectedValuesTemp([]);
                                  }}
                                />
                                <span className="font-medium">Select All</span>
                                <span className="ml-auto text-[11px] text-muted-foreground">{filteredVals.length}</span>
                              </label>
                              <div className="max-h-36 space-y-0.5 overflow-auto rounded border bg-background p-1">
                                {filteredVals.length ? (
                                  filteredVals.map((val) => (
                                    <label key={val} className="flex items-center gap-2 rounded px-1 py-0.5 text-xs hover:bg-muted">
                                      <Checkbox
                                        checked={selectedValuesTemp.includes(val)}
                                        onCheckedChange={(v) => {
                                          setSelectedValuesTemp((prev) =>
                                            v ? [...prev, val] : prev.filter((x) => x !== val)
                                          );
                                        }}
                                      />
                                      <span className="truncate" title={val}>
                                        {val || "(empty)"}
                                      </span>
                                    </label>
                                  ))
                                ) : (
                                  <p className="px-1 py-2 text-center text-xs text-muted-foreground">No values</p>
                                )}
                              </div>
                              <div className="border-t pt-2">
                                <p className="mb-1 text-[11px] font-medium text-muted-foreground">Filter by condition</p>
                                <div className="flex gap-1">
                                  <Select value={filterOpTemp} onValueChange={(v) => setFilterOpTemp(v as FilterOp)}>
                                    <SelectTrigger className="h-7 flex-1 text-xs">
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
                                {(filterOpTemp === "contains" || filterOpTemp === "equals") && (
                                  <Input
                                    placeholder={t("filterValue")}
                                    value={filterValueTemp}
                                    onChange={(e) => setFilterValueTemp(e.target.value)}
                                    className="mt-1 h-7 text-xs"
                                  />
                                )}
                              </div>
                              <div className="flex gap-1 pt-1">
                                <Button size="sm" variant="ghost" className="flex-1 h-7 text-xs" onClick={() => clearFilterForColumn(h)}>
                                  Clear
                                </Button>
                                <Button size="sm" className="flex-1 h-7 text-xs" onClick={() => applyFilterForColumn(h)}>
                                  Apply
                                </Button>
                              </div>
                              <p className="text-center text-[10px] text-muted-foreground">OR within column · AND across columns</p>
                            </div>
                          </PopoverContent>
                        </Popover>
                      </TableHead>
                    );
                  })}
                </TableRow>
              </TableHeader>
              <TableBody>
                {displayRows.map((row, i) => {
                  const mappedIndex = mapped.indexOf(row);
                  const excelRow = mappedIndex >= 0 ? mappedIndex + 2 : i + 2;
                  const isFocused =
                    !!focusedIssue && mappedIndex === focusedIssue.rowIndex;
                  return (
                    <TableRow
                      key={i}
                      ref={(el) => {
                        if (mappedIndex >= 0) {
                          if (el) rowRefs.current.set(mappedIndex, el);
                          else rowRefs.current.delete(mappedIndex);
                        }
                      }}
                      className={isFocused ? "bg-amber-500/15 hover:bg-amber-500/20" : undefined}
                    >
                      <TableCell className="sticky left-0 w-12 bg-background font-mono text-[11px] text-muted-foreground">
                        {excelRow}
                      </TableCell>
                      {displayHeaders.map((h) => {
                        const cellError =
                          isFocused && h === focusedIssue.column;
                        return (
                          <TableCell
                            key={h}
                            className={`max-w-[200px] truncate text-xs ${
                              cellError ? "bg-destructive/10 ring-1 ring-inset ring-destructive/50" : ""
                            }`}
                          >
                            {String(row[h] ?? "")}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      }
    />
  );
}
