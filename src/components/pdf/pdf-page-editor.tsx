"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getPdfPageCount, renderPdfPage } from "@/lib/pdfjs-client";
import type { PageMetrics } from "@/lib/pdf-processor";
import { X } from "lucide-react";

export interface ImageOverlay {
  id: string;
  type: "image";
  kind: "signature" | "watermark";
  pageIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  imageDataUrl: string;
  opacity?: number;
  /** Degrees; used for image watermarks */
  rotation?: number;
}

export interface TextOverlay {
  id: string;
  type: "text";
  pageIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  opacity: number;
  rotation: number;
  fontSize?: number;
}

export type EditorOverlay = ImageOverlay | TextOverlay;

interface PdfPageEditorProps {
  pdfBuf: ArrayBuffer;
  pageIndex: number;
  onPageIndexChange: (index: number) => void;
  overlays: EditorOverlay[];
  onOverlaysChange: (overlays: EditorOverlay[]) => void;
  onMetricsChange?: (pageIndex: number, metrics: PageMetrics) => void;
  labels: {
    page: string;
    prev: string;
    next: string;
    dragHint: string;
    remove: string;
  };
}

function pct(value: number, total: number) {
  return `${(value / total) * 100}%`;
}

export function PdfPageEditor({
  pdfBuf,
  pageIndex,
  onPageIndexChange,
  overlays,
  onOverlaysChange,
  onMetricsChange,
  labels,
}: PdfPageEditorProps) {
  const [pageCount, setPageCount] = useState(0);
  const [metrics, setMetrics] = useState<PageMetrics | null>(null);
  const [rendering, setRendering] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    id: string;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const count = await getPdfPageCount(pdfBuf);
      if (!cancelled) setPageCount(count);
    })();
    return () => {
      cancelled = true;
    };
  }, [pdfBuf]);

  useEffect(() => {
    let cancelled = false;
    setRendering(true);
    (async () => {
      const { canvas, metrics: m } = await renderPdfPage(pdfBuf, pageIndex);
      if (cancelled) return;
      setMetrics(m);
      onMetricsChange?.(pageIndex, m);
      const target = canvasRef.current;
      if (target) {
        target.width = canvas.width;
        target.height = canvas.height;
        const ctx = target.getContext("2d");
        ctx?.drawImage(canvas, 0, 0);
      }
      setRendering(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- metrics callback is stable enough
  }, [pdfBuf, pageIndex]);

  const pageOverlays = overlays.filter((o) => o.pageIndex === pageIndex);

  const updateOverlay = useCallback(
    (id: string, patch: Partial<EditorOverlay>) => {
      onOverlaysChange(
        overlays.map((o) => (o.id === id ? { ...o, ...patch } as EditorOverlay : o))
      );
    },
    [overlays, onOverlaysChange]
  );

  const removeOverlay = useCallback(
    (id: string) => {
      onOverlaysChange(overlays.filter((o) => o.id !== id));
    },
    [overlays, onOverlaysChange]
  );

  const onPointerDown = (
    e: React.PointerEvent,
    overlay: EditorOverlay
  ) => {
    if (!metrics || !containerRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = {
      id: overlay.id,
      startX: e.clientX,
      startY: e.clientY,
      origX: overlay.x,
      origY: overlay.y,
    };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag || !metrics || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const dx = ((e.clientX - drag.startX) / rect.width) * metrics.renderWidth;
    const dy = ((e.clientY - drag.startY) / rect.height) * metrics.renderHeight;
    const overlay = overlays.find((o) => o.id === drag.id);
    if (!overlay) return;

    const maxX = metrics.renderWidth - overlay.width;
    const maxY = metrics.renderHeight - overlay.height;
    updateOverlay(drag.id, {
      x: Math.max(0, Math.min(maxX, drag.origX + dx)),
      y: Math.max(0, Math.min(maxY, drag.origY + dy)),
    });
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (dragRef.current) {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      dragRef.current = null;
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={pageIndex <= 0}
          onClick={() => onPageIndexChange(pageIndex - 1)}
        >
          {labels.prev}
        </Button>
        <span className="text-sm text-muted-foreground">
          {labels.page} {pageIndex + 1}/{pageCount || "…"}
        </span>
        <Button
          size="sm"
          variant="outline"
          disabled={pageIndex >= pageCount - 1}
          onClick={() => onPageIndexChange(pageIndex + 1)}
        >
          {labels.next}
        </Button>
      </div>

      <div
        ref={containerRef}
        className={cn(
          "relative inline-block max-w-full overflow-hidden rounded-lg border bg-muted/30 shadow-sm",
          rendering && "opacity-60"
        )}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        <canvas ref={canvasRef} className="block h-auto max-w-full" />

        {metrics &&
          pageOverlays.map((overlay) => (
            <div
              key={overlay.id}
              className="group absolute touch-none cursor-grab active:cursor-grabbing"
              style={{
                left: pct(overlay.x, metrics.renderWidth),
                top: pct(overlay.y, metrics.renderHeight),
                width: pct(overlay.width, metrics.renderWidth),
                height: pct(overlay.height, metrics.renderHeight),
              }}
              onPointerDown={(e) => onPointerDown(e, overlay)}
            >
              {overlay.type === "image" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={overlay.imageDataUrl}
                  alt=""
                  draggable={false}
                  className="pointer-events-none h-full w-full object-contain"
                />
              ) : (
                <div
                  className="flex h-full w-full items-center justify-center select-none text-2xl font-semibold text-muted-foreground"
                  style={{
                    opacity: overlay.opacity,
                    transform: `rotate(${overlay.rotation}deg)`,
                  }}
                >
                  {overlay.text}
                </div>
              )}

              <button
                type="button"
                aria-label={labels.remove}
                className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-destructive-foreground opacity-0 shadow transition-opacity group-hover:opacity-100"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => removeOverlay(overlay.id)}
              >
                <X className="h-3 w-3" />
              </button>

              <div className="pointer-events-none absolute inset-0 rounded border-2 border-primary/40 opacity-0 transition-opacity group-hover:opacity-100" />
            </div>
          ))}
      </div>

      <p className="text-xs text-muted-foreground">{labels.dragHint}</p>
    </div>
  );
}

export function createOverlayId() {
  return `overlay-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}
