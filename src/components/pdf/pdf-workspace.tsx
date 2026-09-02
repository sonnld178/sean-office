"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import SignaturePad from "signature_pad";
import {
  createOverlayId,
  type EditorOverlay,
  type ImageOverlay,
  type TextOverlay,
} from "@/components/pdf/pdf-page-editor";
import { PdfPageCanvas } from "@/components/pdf/pdf-page-canvas";
import { PdfPageThumbnailList } from "@/components/pdf/pdf-page-thumbnail-list";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  estimateTextFontSize,
  estimateWatermarkBox,
  exportPdfWithBakedOverlays,
  type BakedPlacement,
  type PageMetrics,
} from "@/lib/pdf-processor";
import { bakeOverlayPlacement } from "@/lib/pdf-overlay-bake";
import { remapOverlaysForPageRotation } from "@/lib/pdf-overlay-transform";
import {
  PdfToolSidebar,
  type PdfSidebarTool,
} from "@/components/pdf/pdf-tool-sidebars";
import { ToolPanelHeader } from "@/components/tool/tool-workspace-shell";
import { ToolbarIconButton } from "@/components/tool/toolbar-icon-button";
import ClickSpark from "@/components/ClickSpark";
import { ReactBitsLoaderPanel } from "@/components/ReactBitsLoader";
import { renderAllPdfPages } from "@/lib/pdfjs-client";
import {
  deletePdfPages,
  duplicatePdfPage,
  getPdfPageCountFromLib,
  insertPdfAt,
  rotatePdfPages,
} from "@/lib/pdf-tools";
import { AiImageTranslatePanel } from "@/components/ai/ai-image-translate-panel";
import { downloadSeanOfficeBlob } from "@/lib/download-names";
import {
  Check,
  Copy,
  Download,
  Droplets,
  Languages,
  FileSpreadsheet,
  FileText,
  GitMerge,
  ImageIcon,
  Layers,
  Minimize2,
  PenLine,
  RotateCcw,
  Save,
  Scissors,
  Type,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

type ToolPanel = PdfSidebarTool | "aiTranslate" | null;
type WatermarkMode = "text" | "image";

const DEFAULT_SIG = { width: 140, height: 48 };
const DEFAULT_IMAGE_WM = { width: 200, height: 200 };
const MIN_IMAGE_H = 40;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.1;

interface PdfWorkspaceProps {
  pdfBuf: ArrayBuffer;
  fileName: string;
  onClose: () => void;
  onPdfUpdate: (buf: ArrayBuffer, fileName?: string) => void;
}

interface RenderedPage {
  pageIndex: number;
  canvas: HTMLCanvasElement;
  metrics: PageMetrics;
}

function OpacityInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (opacity: number) => void;
}) {
  const pct = Math.round(value * 100);

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex items-center gap-2">
        <Input
          type="number"
          min={0}
          max={100}
          step={1}
          value={pct}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (Number.isNaN(n)) return;
            onChange(Math.max(0, Math.min(100, n)) / 100);
          }}
          className="w-24 tabular-nums"
        />
        <span className="text-sm text-muted-foreground">%</span>
      </div>
    </div>
  );
}

function RotationInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (rotation: number) => void;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex items-center gap-2">
        <Input
          type="number"
          min={-180}
          max={180}
          step={1}
          value={value}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (Number.isNaN(n)) return;
            onChange(Math.max(-180, Math.min(180, Math.round(n))));
          }}
          className="w-24 tabular-nums"
        />
        <span className="text-sm text-muted-foreground">°</span>
      </div>
    </div>
  );
}

function overlayOpacity(overlay: EditorOverlay): number {
  if (overlay.type === "text") return overlay.opacity;
  return overlay.opacity ?? 1;
}

function overlayRotation(overlay: EditorOverlay): number {
  if (overlay.type === "text") return overlay.rotation;
  return overlay.rotation ?? 0;
}

function supportsOpacity(overlay: EditorOverlay): boolean {
  if (overlay.type === "text") return true;
  return overlay.kind === "watermark";
}

function isWatermarkOverlay(overlay: EditorOverlay): boolean {
  if (overlay.type === "text") return true;
  return overlay.kind === "watermark";
}

function clampZoom(z: number) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(z * 10) / 10));
}

function remapAfterDelete(
  deleted: number[],
  oldActive: number,
  oldSelected: Set<number>,
  oldCount: number
): { active: number; selected: Set<number> } {
  const removed = new Set(deleted);
  const remaining: number[] = [];
  for (let i = 0; i < oldCount; i++) {
    if (!removed.has(i)) remaining.push(i);
  }
  const oldToNew = new Map<number, number>();
  remaining.forEach((old, next) => oldToNew.set(old, next));

  let source = oldActive;
  if (removed.has(oldActive)) {
    const after = remaining.find((i) => i > oldActive);
    const before = [...remaining].reverse().find((i) => i < oldActive);
    source = after ?? before ?? remaining[0] ?? 0;
  }

  const selected = new Set<number>();
  for (const idx of oldSelected) {
    const mapped = oldToNew.get(idx);
    if (mapped !== undefined) selected.add(mapped);
  }

  return {
    active: oldToNew.get(source) ?? 0,
    selected,
  };
}

function remapOverlaysAfterInsert(
  overlays: EditorOverlay[],
  afterIndex: number,
  insertCount: number
): EditorOverlay[] {
  return overlays.map((o) =>
    o.pageIndex > afterIndex
      ? { ...o, pageIndex: o.pageIndex + insertCount }
      : o
  );
}

function remapOverlaysAfterDuplicate(
  overlays: EditorOverlay[],
  pageIndex: number
): EditorOverlay[] {
  return overlays.map((o) =>
    o.pageIndex > pageIndex ? { ...o, pageIndex: o.pageIndex + 1 } : o
  );
}

function remapActiveAfterInsert(
  active: number,
  afterIndex: number,
  insertCount: number
): number {
  return active > afterIndex ? active + insertCount : active;
}

function remapActiveAfterDuplicate(active: number, pageIndex: number): number {
  return active > pageIndex ? active + 1 : active;
}

function cloneWatermarkToPage(
  source: EditorOverlay,
  pageIndex: number,
  sourceMetrics: PageMetrics,
  targetMetrics: PageMetrics
): EditorOverlay {
  const relX = source.x / sourceMetrics.renderWidth;
  const relY = source.y / sourceMetrics.renderHeight;
  const relW = source.width / sourceMetrics.renderWidth;
  const relH = source.height / sourceMetrics.renderHeight;

  const width = Math.max(40, relW * targetMetrics.renderWidth);
  const height = Math.max(24, relH * targetMetrics.renderHeight);
  const x = Math.max(
    0,
    Math.min(targetMetrics.renderWidth - width, relX * targetMetrics.renderWidth)
  );
  const y = Math.max(
    0,
    Math.min(
      targetMetrics.renderHeight - height,
      relY * targetMetrics.renderHeight
    )
  );

  if (source.type === "text") {
    return {
      ...source,
      id: createOverlayId(),
      pageIndex,
      x,
      y,
      width,
      height,
      fontSize: estimateTextFontSize(source.text, width, height),
    };
  }

  return {
    ...source,
    id: createOverlayId(),
    pageIndex,
    x,
    y,
    width,
    height,
  };
}

function isSameWatermarkContent(a: EditorOverlay, b: EditorOverlay): boolean {
  if (a.type === "text" && b.type === "text") return a.text === b.text;
  if (a.type === "image" && b.type === "image") {
    return (
      a.kind === "watermark" &&
      b.kind === "watermark" &&
      a.imageDataUrl === b.imageDataUrl
    );
  }
  return false;
}

export function PdfWorkspace({
  pdfBuf,
  fileName,
  onClose,
  onPdfUpdate,
}: PdfWorkspaceProps) {
  const t = useTranslations("pdf");
  const [pages, setPages] = useState<RenderedPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [activePage, setActivePage] = useState(0);
  const [overlays, setOverlays] = useState<EditorOverlay[]>([]);
  const [selectedOverlayId, setSelectedOverlayId] = useState<string | null>(null);
  const [panel, setPanel] = useState<ToolPanel>(null);
  const [watermarkMode, setWatermarkMode] = useState<WatermarkMode>("text");
  const [watermark, setWatermark] = useState("CONFIDENTIAL");
  const [watermarkImage, setWatermarkImage] = useState<string | null>(null);
  const [watermarkRotation, setWatermarkRotation] = useState(-30);
  const [sigDataUrl, setSigDataUrl] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [selectedPages, setSelectedPages] = useState<Set<number>>(new Set());
  const [multiSelect, setMultiSelect] = useState(false);
  const [pageActionBusy, setPageActionBusy] = useState(false);
  const [applyAllSuccess, setApplyAllSuccess] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const applyAllTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const insertAfterRef = useRef(-1);
  const insertFileRef = useRef<HTMLInputElement>(null);
  const pendingScrollRef = useRef<number | null>(null);
  const sigCanvasRef = useRef<HTMLCanvasElement>(null);
  const padRef = useRef<SignaturePad | null>(null);

  const activeMetrics = pages.find((p) => p.pageIndex === activePage)?.metrics;

  const selectedOverlay = useMemo(
    () => overlays.find((o) => o.id === selectedOverlayId) ?? null,
    [overlays, selectedOverlayId]
  );

  useEffect(() => {
    return () => {
      if (applyAllTimerRef.current) clearTimeout(applyAllTimerRef.current);
    };
  }, []);

  useEffect(() => {
    setApplyAllSuccess(false);
  }, [selectedOverlayId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      const rendered = await renderAllPdfPages(pdfBuf);
      if (!cancelled) {
        setPages(rendered);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pdfBuf]);

  useEffect(() => {
    if (loading || pendingScrollRef.current === null) return;
    const target = pendingScrollRef.current;
    pendingScrollRef.current = null;
    setActivePage(target);
    requestAnimationFrame(() => {
      document.getElementById(`pdf-page-${target}`)?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }, [loading, pages]);

  useEffect(() => {
    if (panel !== "signature" || !sigCanvasRef.current) return;
    padRef.current = new SignaturePad(sigCanvasRef.current, {
      backgroundColor: "rgba(255,255,255,0)",
    });
    return () => padRef.current?.off();
  }, [panel]);

  useEffect(() => {
    const root = scrollRef.current;
    if (!root || !pages.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (!visible.length) return;
        const id = visible[0].target.id;
        const match = id.match(/^pdf-page-(\d+)$/);
        if (match) setActivePage(Number(match[1]));
      },
      { root, threshold: [0.35, 0.55, 0.75] }
    );

    pages.forEach(({ pageIndex }) => {
      const el = document.getElementById(`pdf-page-${pageIndex}`);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [pages, zoom]);

  // Ctrl + mouse wheel zoom (Foxit-style)
  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return;

    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const direction = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
      setZoom((z) => clampZoom(z + direction));
    };

    root.addEventListener("wheel", onWheel, { passive: false });
    return () => root.removeEventListener("wheel", onWheel);
  }, [loading]);

  const scrollToPage = (index: number) => {
    setActivePage(index);
    document.getElementById(`pdf-page-${index}`)?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  const handleThumbClick = (index: number, e: React.MouseEvent) => {
    const additive =
      panel === "pages" && (multiSelect || e.ctrlKey || e.metaKey);
    if (additive) {
      setSelectedPages((prev) => {
        const next = new Set(prev);
        if (next.has(index)) next.delete(index);
        else next.add(index);
        return next;
      });
    } else if (panel === "pages") {
      setSelectedPages(new Set());
    }
    scrollToPage(index);
  };

  const handleAfterDelete = useCallback(
    (deleted: number[]) => {
      const next = remapAfterDelete(
        deleted,
        activePage,
        selectedPages,
        pages.length
      );
      setActivePage(next.active);
      setSelectedPages(next.selected);
      setOverlays((prev) => {
        const removed = new Set(deleted);
        const remaining: number[] = [];
        for (let i = 0; i < pages.length; i++) {
          if (!removed.has(i)) remaining.push(i);
        }
        const oldToNew = new Map<number, number>();
        remaining.forEach((old, nextIdx) => oldToNew.set(old, nextIdx));
        return prev
          .filter((o) => !removed.has(o.pageIndex))
          .map((o) => ({
            ...o,
            pageIndex: oldToNew.get(o.pageIndex) ?? o.pageIndex,
          }));
      });
    },
    [activePage, selectedPages, pages.length]
  );

  const applyPdfMutation = useCallback(
    async (blob: Blob) => {
      const ab = await blob.arrayBuffer();
      onPdfUpdate(ab.slice(0));
    },
    [onPdfUpdate]
  );

  const handleDuplicatePage = useCallback(
    async (pageIndex: number) => {
      setPageActionBusy(true);
      try {
        const out = await duplicatePdfPage(pdfBuf, pageIndex);
        await applyPdfMutation(out);
        setOverlays((prev) => remapOverlaysAfterDuplicate(prev, pageIndex));
        setActivePage((prev) => remapActiveAfterDuplicate(prev, pageIndex));
        pendingScrollRef.current = pageIndex + 1;
      } finally {
        setPageActionBusy(false);
      }
    },
    [applyPdfMutation, pdfBuf]
  );

  const handleRotatePage = useCallback(
    async (pageIndex: number) => {
      const oldMetrics = pages.find((p) => p.pageIndex === pageIndex)?.metrics;
      if (!oldMetrics) return;
      setPageActionBusy(true);
      try {
        const out = await rotatePdfPages(pdfBuf, [pageIndex], 90);
        await applyPdfMutation(out);
        setOverlays((prev) =>
          remapOverlaysForPageRotation(
            prev,
            [pageIndex],
            new Map([[pageIndex, oldMetrics]]),
            90
          )
        );
      } finally {
        setPageActionBusy(false);
      }
    },
    [applyPdfMutation, pages, pdfBuf]
  );

  const handleSidebarPageRotate = useCallback(
    (pageIndices: number[], angle: 90 | 270) => {
      const metricsByPage = new Map<number, PageMetrics>();
      for (const idx of pageIndices) {
        const metrics = pages.find((p) => p.pageIndex === idx)?.metrics;
        if (metrics) metricsByPage.set(idx, metrics);
      }
      if (!metricsByPage.size) return;
      setOverlays((prev) =>
        remapOverlaysForPageRotation(prev, pageIndices, metricsByPage, angle)
      );
    },
    [pages]
  );

  const handleDeletePage = useCallback(
    async (pageIndex: number) => {
      if (pages.length <= 1) return;
      setPageActionBusy(true);
      try {
        const out = await deletePdfPages(pdfBuf, [pageIndex]);
        await applyPdfMutation(out);
        handleAfterDelete([pageIndex]);
      } finally {
        setPageActionBusy(false);
      }
    },
    [applyPdfMutation, handleAfterDelete, pages.length, pdfBuf]
  );

  const handleInsertRequest = useCallback((afterIndex: number) => {
    insertAfterRef.current = afterIndex;
    insertFileRef.current?.click();
  }, []);

  const handleInsertFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;
      const afterIndex = insertAfterRef.current;
      setPageActionBusy(true);
      try {
        const insertBuf = await file.arrayBuffer();
        const insertCount = await getPdfPageCountFromLib(insertBuf);
        const out = await insertPdfAt(pdfBuf, insertBuf, afterIndex);
        await applyPdfMutation(out);
        setOverlays((prev) =>
          remapOverlaysAfterInsert(prev, afterIndex, insertCount)
        );
        setActivePage((prev) =>
          remapActiveAfterInsert(prev, afterIndex, insertCount)
        );
        pendingScrollRef.current = afterIndex + 1;
      } finally {
        setPageActionBusy(false);
      }
    },
    [applyPdfMutation, pdfBuf]
  );

  useEffect(() => {
    if (panel !== "pages") {
      setSelectedPages(new Set());
      setMultiSelect(false);
    }
  }, [panel]);

  useEffect(() => {
    if (!pages.length) return;
    setActivePage((i) => Math.min(i, pages.length - 1));
    setSelectedPages((prev) => {
      const next = new Set([...prev].filter((i) => i < pages.length));
      return next.size === prev.size ? prev : next;
    });
  }, [pages.length]);

  const metricsByPage = useCallback(() => {
    const map = new Map<number, PageMetrics>();
    pages.forEach(({ pageIndex, metrics }) => map.set(pageIndex, metrics));
    return map;
  }, [pages]);

  const centerPlacement = (width: number, height: number) => {
    const metrics = activeMetrics;
    const x = metrics ? (metrics.renderWidth - width) / 2 : 40;
    const y = metrics ? (metrics.renderHeight - height) / 2 : 40;
    return { x, y };
  };

  const addTextWatermark = () => {
    const metrics = activeMetrics;
    if (!metrics) return;
    const box = estimateWatermarkBox(watermark, metrics);
    const overlay: TextOverlay = {
      id: createOverlayId(),
      type: "text",
      pageIndex: activePage,
      x: (metrics.renderWidth - box.width) / 2,
      y: (metrics.renderHeight - box.height) / 2,
      width: box.width,
      height: box.height,
      text: watermark,
      opacity: 0.3,
      rotation: watermarkRotation,
      fontSize: estimateTextFontSize(watermark, box.width, box.height),
    };
    setOverlays((prev) => [...prev, overlay]);
    setSelectedOverlayId(overlay.id);
    setPanel(null);
  };

  const addImageWatermark = () => {
    if (!watermarkImage) return;

    const place = (width: number, height: number) => {
      const { x, y } = centerPlacement(width, height);
      const overlay: ImageOverlay = {
        id: createOverlayId(),
        type: "image",
        kind: "watermark",
        pageIndex: activePage,
        x,
        y,
        width,
        height,
        imageDataUrl: watermarkImage,
        opacity: 0.3,
        rotation: watermarkRotation,
      };
      setOverlays((prev) => [...prev, overlay]);
      setSelectedOverlayId(overlay.id);
      setPanel(null);
    };

    const img = new window.Image();
    img.onload = () => {
      const aspect =
        img.naturalWidth > 0 && img.naturalHeight > 0
          ? img.naturalWidth / img.naturalHeight
          : 1;
      const width = DEFAULT_IMAGE_WM.width;
      const height = Math.max(MIN_IMAGE_H, width / aspect);
      place(width, height);
    };
    img.onerror = () =>
      place(DEFAULT_IMAGE_WM.width, DEFAULT_IMAGE_WM.height);
    img.src = watermarkImage;
  };

  const addSignature = () => {
    if (!sigDataUrl) return;
    const { x, y } = centerPlacement(DEFAULT_SIG.width, DEFAULT_SIG.height);
    const overlay: ImageOverlay = {
      id: createOverlayId(),
      type: "image",
      kind: "signature",
      pageIndex: activePage,
      x,
      y,
      width: DEFAULT_SIG.width,
      height: DEFAULT_SIG.height,
      imageDataUrl: sigDataUrl,
    };
    setOverlays((prev) => [...prev, overlay]);
    setSelectedOverlayId(overlay.id);
    setPanel(null);
  };

  const applyWatermarkToAllPages = () => {
    if (!selectedOverlay || !isWatermarkOverlay(selectedOverlay)) return;
    const sourceMetrics = pages.find(
      (p) => p.pageIndex === selectedOverlay.pageIndex
    )?.metrics;
    if (!sourceMetrics) return;

    setOverlays((prev) => {
      const kept = prev.filter(
        (o) =>
          o.id === selectedOverlay.id ||
          !isSameWatermarkContent(o, selectedOverlay)
      );
      const copies = pages
        .filter((p) => p.pageIndex !== selectedOverlay.pageIndex)
        .map((p) =>
          cloneWatermarkToPage(
            selectedOverlay,
            p.pageIndex,
            sourceMetrics,
            p.metrics
          )
        );
      return [...kept, ...copies];
    });

    setApplyAllSuccess(true);
    if (applyAllTimerRef.current) clearTimeout(applyAllTimerRef.current);
    applyAllTimerRef.current = setTimeout(() => {
      setApplyAllSuccess(false);
      applyAllTimerRef.current = null;
    }, 2400);
  };

  const updateSelectedOpacity = (opacity: number) => {
    if (!selectedOverlayId) return;
    setOverlays((prev) =>
      prev.map((o) => {
        if (o.id !== selectedOverlayId) return o;
        if (o.type === "text") return { ...o, opacity };
        if (o.kind === "watermark") return { ...o, opacity };
        return o;
      })
    );
  };

  const updateSelectedRotation = (rotation: number) => {
    if (!selectedOverlayId) return;
    setOverlays((prev) =>
      prev.map((o) => {
        if (o.id !== selectedOverlayId) return o;
        if (o.type === "text") return { ...o, rotation: Math.round(rotation) };
        if (o.kind === "watermark")
          return { ...o, rotation: Math.round(rotation) };
        return o;
      })
    );
  };

  const buildBakedPlacements = useCallback(async (): Promise<BakedPlacement[]> => {
    const baked: BakedPlacement[] = [];
    for (const o of overlays) {
      baked.push(await bakeOverlayPlacement(o));
    }
    return baked;
  }, [overlays]);

  const exportBakedPdf = useCallback(async () => {
    const baked = await buildBakedPlacements();
    return exportPdfWithBakedOverlays(pdfBuf, baked, metricsByPage());
  }, [buildBakedPlacements, pdfBuf, metricsByPage]);

  const handleSave = async () => {
    if (!overlays.length) return;
    setSaving(true);
    try {
      const out = await exportBakedPdf();
      const ab = await out.arrayBuffer();
      onPdfUpdate(ab.slice(0));
      setOverlays([]);
      setSelectedOverlayId(null);
    } finally {
      setSaving(false);
    }
  };

  const handleDownload = async () => {
    setExporting(true);
    try {
      const out = overlays.length
        ? await exportBakedPdf()
        : new Blob([pdfBuf.slice(0)], { type: "application/pdf" });
      downloadSeanOfficeBlob(out, "pdf", fileName, "pdf", "edited");
    } finally {
      setExporting(false);
    }
  };

  const togglePanel = (next: ToolPanel) => {
    setPanel((p) => (p === next ? null : next));
  };

  const showSidebar =
    panel || (selectedOverlay && supportsOpacity(selectedOverlay));
  const isEditPanel = panel === "watermark" || panel === "signature";
  const isAiTranslatePanel = panel === "aiTranslate";
  const isUtilityPanel =
    panel === "merge" ||
    panel === "split" ||
    panel === "pages" ||
    panel === "compress" ||
    panel === "extract";

  const canApplyToAll =
    selectedOverlay &&
    isWatermarkOverlay(selectedOverlay) &&
    pages.length > 1;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-background shadow-sm">
      <div className="z-20 flex shrink-0 flex-wrap items-center gap-2 border-b border-border bg-background px-3 py-2 md:px-4">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <FileText className="size-4 shrink-0 text-primary" />
          <span className="truncate text-sm font-medium">{fileName}</span>
        </div>

        <ClickSpark className="flex flex-wrap items-center gap-1.5">
          <div className="flex items-center gap-1 rounded-md border border-border px-1 py-0.5">
            <ToolbarIconButton
              icon={<ZoomOut className="size-3.5" />}
              label={t("zoomOut")}
              onClick={() => setZoom((z) => clampZoom(z - ZOOM_STEP))}
              variant="ghost"
            />
            <button
              type="button"
              className="min-w-10 px-1 text-center text-xs tabular-nums text-muted-foreground hover:text-foreground"
              onClick={() => setZoom(1)}
              title={t("zoomReset")}
            >
              {Math.round(zoom * 100)}%
            </button>
            <ToolbarIconButton
              icon={<ZoomIn className="size-3.5" />}
              label={t("zoomIn")}
              onClick={() => setZoom((z) => clampZoom(z + ZOOM_STEP))}
              variant="ghost"
            />
          </div>

          <ToolbarIconButton
            icon={<Droplets />}
            label={t("addWatermark")}
            active={panel === "watermark"}
            onClick={() => togglePanel("watermark")}
          />
          <ToolbarIconButton
            icon={<PenLine />}
            label={t("addSignature")}
            active={panel === "signature"}
            onClick={() => togglePanel("signature")}
          />
          <ToolbarIconButton
            icon={<GitMerge />}
            label={t("toolMerge")}
            active={panel === "merge"}
            onClick={() => togglePanel("merge")}
          />
          <ToolbarIconButton
            icon={<Scissors />}
            label={t("toolSplit")}
            active={panel === "split"}
            onClick={() => togglePanel("split")}
          />
          <ToolbarIconButton
            icon={<Layers />}
            label={t("toolPages")}
            active={panel === "pages"}
            onClick={() => togglePanel("pages")}
          />
          <ToolbarIconButton
            icon={<Minimize2 />}
            label={t("toolCompress")}
            active={panel === "compress"}
            onClick={() => togglePanel("compress")}
          />
          <ToolbarIconButton
            icon={<FileSpreadsheet />}
            label={t("toolExtract")}
            active={panel === "extract"}
            onClick={() => togglePanel("extract")}
          />
          <ToolbarIconButton
            icon={<Languages />}
            label="AI Translate"
            active={panel === "aiTranslate"}
            onClick={() => togglePanel("aiTranslate")}
          />
          <ToolbarIconButton
            icon={<Save />}
            label={saving ? t("saving") : t("savePdf")}
            onClick={() => void handleSave()}
            disabled={saving || !overlays.length}
            variant="secondary"
          />
          <ToolbarIconButton
            icon={<Download />}
            label={t("downloadPdf")}
            onClick={() => void handleDownload()}
            disabled={exporting}
            variant="default"
          />
          <ToolbarIconButton
            icon={<RotateCcw />}
            label={t("newFile")}
            onClick={onClose}
            variant="ghost"
          />
        </ClickSpark>
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <aside className="hidden w-28 shrink-0 overflow-y-auto border-r border-border bg-muted/20 p-2 sm:block md:w-36">
          <input
            ref={insertFileRef}
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            onChange={(e) => void handleInsertFile(e)}
          />
          <PdfPageThumbnailList
            pages={pages}
            loading={loading}
            activePage={activePage}
            selectedPages={selectedPages}
            multiSelectEnabled={panel === "pages"}
            multiSelect={multiSelect}
            onMultiSelectChange={setMultiSelect}
            pageCount={pages.length}
            busy={pageActionBusy}
            onThumbClick={handleThumbClick}
            onDuplicate={(i) => void handleDuplicatePage(i)}
            onRotate={(i) => void handleRotatePage(i)}
            onDelete={(i) => void handleDeletePage(i)}
            onInsertAfter={handleInsertRequest}
          />
        </aside>

        <div
          ref={scrollRef}
          className="min-h-0 flex-1 overflow-auto bg-muted/30 p-4 md:p-8"
        >
          {loading ? (
            <ReactBitsLoaderPanel label={t("loadingPages")} />
          ) : (
            <div className="mx-auto flex w-full flex-col gap-8">
              {pages.map(({ pageIndex, canvas, metrics }) => (
                <PdfPageCanvas
                  key={pageIndex}
                  id={`pdf-page-${pageIndex}`}
                  pageIndex={pageIndex}
                  canvas={canvas}
                  metrics={metrics}
                  overlays={overlays.filter((o) => o.pageIndex === pageIndex)}
                  allOverlays={overlays}
                  onOverlaysChange={setOverlays}
                  selectedOverlayId={selectedOverlayId}
                  onSelectOverlay={setSelectedOverlayId}
                  active={activePage === pageIndex}
                  removeLabel={t("removeOverlay")}
                  rotateLabel={t("rotate")}
                  zoom={zoom}
                />
              ))}
            </div>
          )}
          {!loading && (
            <p className="mx-auto mt-4 max-w-[860px] text-xs text-muted-foreground">
              {t("dragToPosition")} · {t("zoomHint")}
            </p>
          )}
        </div>

        {showSidebar && (
          <aside className="w-full shrink-0 overflow-y-auto border-t border-border bg-card p-4 sm:w-56 sm:border-l sm:border-t-0 md:w-72">
            {isAiTranslatePanel && (
              <>
                <ToolPanelHeader title="AI Translate Image" onClose={() => setPanel(null)} />
                <AiImageTranslatePanel />
              </>
            )}
            {isUtilityPanel && panel && (
              <>
                <ToolPanelHeader
                  title={t(
                    panel === "merge"
                      ? "toolMerge"
                      : panel === "split"
                        ? "toolSplit"
                        : panel === "pages"
                          ? "toolPages"
                          : panel === "compress"
                            ? "toolCompress"
                            : "toolExtract"
                  )}
                  onClose={() => setPanel(null)}
                />
                <PdfToolSidebar
                  tool={panel}
                  pdfBuf={pdfBuf}
                  fileName={fileName}
                  onPdfUpdate={onPdfUpdate}
                  activePage={activePage}
                  selectedPages={[...selectedPages]}
                  pageCount={pages.length}
                  onAfterDelete={handleAfterDelete}
                  onAfterRotate={handleSidebarPageRotate}
                />
              </>
            )}
            {isEditPanel && panel && (
              <>
                <ToolPanelHeader
                  title={
                    panel === "watermark" ? t("addWatermark") : t("addSignature")
                  }
                  onClose={() => setPanel(null)}
                />
                {panel === "watermark" && (
                  <div className="space-y-4">
                    <p className="text-xs text-muted-foreground">
                      {t("watermarkPageHint", { page: activePage + 1 })}
                    </p>

                    <div className="flex gap-1 rounded-lg border p-1">
                      <Button
                        size="sm"
                        variant={watermarkMode === "text" ? "secondary" : "ghost"}
                        className="flex-1"
                        onClick={() => {
                          setWatermarkMode("text");
                          setWatermarkRotation(-30);
                        }}
                      >
                        <Type className="mr-1 size-3.5" />
                        {t("watermarkTextMode")}
                      </Button>
                      <Button
                        size="sm"
                        variant={watermarkMode === "image" ? "secondary" : "ghost"}
                        className="flex-1"
                        onClick={() => {
                          setWatermarkMode("image");
                          setWatermarkRotation(0);
                        }}
                      >
                        <ImageIcon className="mr-1 size-3.5" />
                        {t("watermarkImageMode")}
                      </Button>
                    </div>

                    {watermarkMode === "text" ? (
                      <div>
                        <Label>{t("watermarkText")}</Label>
                        <Input
                          value={watermark}
                          onChange={(e) => setWatermark(e.target.value)}
                        />
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed px-3 py-4 text-center text-xs text-muted-foreground hover:bg-muted/50">
                          <ImageIcon className="size-6 text-primary/70" />
                          {t("uploadWatermarkImage")}
                          <input
                            type="file"
                            accept="image/png,image/jpeg,image/webp"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              const reader = new FileReader();
                              reader.onload = () => {
                                if (typeof reader.result === "string") {
                                  setWatermarkImage(reader.result);
                                }
                              };
                              reader.readAsDataURL(file);
                            }}
                          />
                        </label>
                        {watermarkImage && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={watermarkImage}
                            alt=""
                            className="mx-auto max-h-20 object-contain"
                            style={{
                              transform: `rotate(${watermarkRotation}deg)`,
                            }}
                          />
                        )}
                      </div>
                    )}

                    <RotationInput
                      label={t("rotation")}
                      value={watermarkRotation}
                      onChange={setWatermarkRotation}
                    />

                    <Button
                      className="w-full"
                      disabled={watermarkMode === "image" && !watermarkImage}
                      onClick={() => {
                        if (watermarkMode === "text") addTextWatermark();
                        else addImageWatermark();
                      }}
                    >
                      {t("placeWatermark")}
                    </Button>
                  </div>
                )}

                {panel === "signature" && (
                  <div className="space-y-3">
                    <p className="text-xs text-muted-foreground">{t("visualOnly")}</p>
                    <p className="text-xs text-muted-foreground">
                      {t("signaturePageHint", { page: activePage + 1 })}
                    </p>
                    <Label>{t("drawSignature")}</Label>
                    <canvas
                      ref={sigCanvasRef}
                      className="h-28 w-full rounded border bg-white"
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1"
                        onClick={() => padRef.current?.clear()}
                      >
                        {t("clearPad")}
                      </Button>
                      <Button
                        size="sm"
                        className="flex-1"
                        onClick={() => {
                          if (padRef.current && !padRef.current.isEmpty()) {
                            setSigDataUrl(padRef.current.toDataURL("image/png"));
                          }
                        }}
                      >
                        {t("useSignature")}
                      </Button>
                    </div>
                    <label className="block cursor-pointer rounded-md border border-dashed px-3 py-2 text-center text-xs text-muted-foreground hover:bg-muted/50">
                      {t("uploadSignature")}
                      <input
                        type="file"
                        accept="image/png,image/jpeg"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          const reader = new FileReader();
                          reader.onload = () => {
                            if (typeof reader.result === "string") {
                              setSigDataUrl(reader.result);
                            }
                          };
                          reader.readAsDataURL(file);
                        }}
                      />
                    </label>
                    {sigDataUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={sigDataUrl} alt="" className="mx-auto h-12 object-contain" />
                    )}
                    <Button className="w-full" disabled={!sigDataUrl} onClick={addSignature}>
                      {t("placeSignature")}
                    </Button>
                  </div>
                )}
              </>
            )}

            {selectedOverlay && supportsOpacity(selectedOverlay) && (
              <div className={cn(panel && "mt-6 border-t pt-4")}>
                <h3 className="mb-3 text-sm font-semibold">{t("editSelected")}</h3>
                <OpacityInput
                  label={t("opacity")}
                  value={overlayOpacity(selectedOverlay)}
                  onChange={updateSelectedOpacity}
                />
                <div className="mt-4">
                  <RotationInput
                    label={t("rotation")}
                    value={overlayRotation(selectedOverlay)}
                    onChange={updateSelectedRotation}
                  />
                </div>
                {canApplyToAll && (
                  <ClickSpark
                    className="mt-4 block w-full"
                    sparkColor="rgba(34, 197, 94, 0.9)"
                    sparkCount={12}
                  >
                    <Button
                      className={cn(
                        "relative w-full overflow-hidden transition-all duration-300",
                        applyAllSuccess &&
                          "border-green-500/40 bg-green-500/15 text-green-700 shadow-[0_0_20px_rgba(34,197,94,0.25)] dark:text-green-400"
                      )}
                      variant="secondary"
                      size="sm"
                      onClick={applyWatermarkToAllPages}
                    >
                      {applyAllSuccess ? (
                        <>
                          <Check className="mr-1.5 size-3.5 animate-in zoom-in-50 duration-300" />
                          {t("appliedToAllPages")}
                        </>
                      ) : (
                        <>
                          <Copy className="mr-1.5 size-3.5" />
                          {t("applyToAllPages")}
                        </>
                      )}
                      {applyAllSuccess && (
                        <span
                          className="pointer-events-none absolute inset-0 animate-ping rounded-md bg-green-400/20"
                          aria-hidden
                        />
                      )}
                    </Button>
                  </ClickSpark>
                )}
              </div>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}
