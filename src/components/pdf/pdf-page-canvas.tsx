"use client";

import { useCallback, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { fitTextFontSize, type PageMetrics } from "@/lib/pdf-processor";
import { getOverlayExportBounds } from "@/lib/pdf-overlay-bake";
import { RotateCw, X } from "lucide-react";
import type { EditorOverlay } from "@/components/pdf/pdf-page-editor";

const MIN_W = 40;
const MIN_H = 24;

type Corner = "nw" | "ne" | "sw" | "se";

type OverlaysChange = (
  next: EditorOverlay[] | ((prev: EditorOverlay[]) => EditorOverlay[])
) => void;

function pct(value: number, total: number) {
  return `${(value / total) * 100}%`;
}

function pointerToRender(
  clientX: number,
  clientY: number,
  rect: DOMRect,
  metrics: PageMetrics
) {
  return {
    x: ((clientX - rect.left) / rect.width) * metrics.renderWidth,
    y: ((clientY - rect.top) / rect.height) * metrics.renderHeight,
  };
}

function overlayRotation(overlay: EditorOverlay): number {
  if (overlay.type === "text") return overlay.rotation;
  return overlay.rotation ?? 0;
}

function canRotateOverlay(overlay: EditorOverlay): boolean {
  if (overlay.type === "text") return true;
  return overlay.kind === "watermark";
}

function lockAspectSize(
  width: number,
  height: number,
  aspect: number,
  preferWidth: boolean
) {
  if (preferWidth) {
    const w = Math.max(MIN_W, width);
    return { width: w, height: Math.max(MIN_H, w / aspect) };
  }
  const h = Math.max(MIN_H, height);
  return { width: Math.max(MIN_W, h * aspect), height: h };
}

function clampBox(
  x: number,
  y: number,
  width: number,
  height: number,
  metrics: PageMetrics
) {
  let w = Math.min(width, metrics.renderWidth);
  let h = Math.min(height, metrics.renderHeight);
  const nx = Math.max(0, Math.min(x, metrics.renderWidth - w));
  const ny = Math.max(0, Math.min(y, metrics.renderHeight - h));
  w = Math.min(w, metrics.renderWidth - nx);
  h = Math.min(h, metrics.renderHeight - ny);
  return { x: nx, y: ny, width: w, height: h };
}

const CORNER_CLASS: Record<Corner, string> = {
  nw: "absolute -left-1.5 -top-1.5 cursor-nw-resize",
  ne: "absolute -right-1.5 -top-1.5 cursor-ne-resize",
  sw: "absolute -bottom-1.5 -left-1.5 cursor-sw-resize",
  se: "absolute -bottom-1.5 -right-1.5 cursor-se-resize",
};

interface PdfPageCanvasProps {
  pageIndex: number;
  canvas: HTMLCanvasElement | null;
  metrics: PageMetrics | null;
  overlays: EditorOverlay[];
  onOverlaysChange: OverlaysChange;
  allOverlays: EditorOverlay[];
  selectedOverlayId?: string | null;
  onSelectOverlay?: (id: string | null) => void;
  active?: boolean;
  removeLabel: string;
  rotateLabel?: string;
  id?: string;
  zoom?: number;
}

export function PdfPageCanvas({
  canvas,
  metrics,
  overlays,
  onOverlaysChange,
  selectedOverlayId,
  onSelectOverlay,
  active,
  removeLabel,
  rotateLabel = "Rotate",
  id,
  zoom = 1,
}: PdfPageCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasNodeRef = useRef<HTMLCanvasElement>(null);
  const overlayNodeRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const contentNodeRefs = useRef<Map<string, HTMLElement>>(new Map());
  const textNodeRefs = useRef<Map<string, HTMLSpanElement>>(new Map());

  const dragRef = useRef<{
    id: string;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    width: number;
    height: number;
  } | null>(null);

  const resizeRef = useRef<{
    id: string;
    corner: Corner;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    origW: number;
    origH: number;
    aspect: number;
    lockAspect: boolean;
    isText: boolean;
    text: string;
  } | null>(null);

  const rotateRef = useRef<{
    id: string;
    startAngle: number;
    origRotation: number;
    cx: number;
    cy: number;
  } | null>(null);

  const liveRef = useRef<{
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
    rotation?: number;
    fontSize?: number;
  } | null>(null);

  useEffect(() => {
    const node = canvasNodeRef.current;
    if (!node || !canvas) return;
    node.width = canvas.width;
    node.height = canvas.height;
    const ctx = node.getContext("2d");
    ctx?.drawImage(canvas, 0, 0);
  }, [canvas]);

  const applyLiveDom = useCallback(
    (geo: {
      id: string;
      x: number;
      y: number;
      width: number;
      height: number;
      rotation?: number;
      fontSize?: number;
    }) => {
      if (!metrics) return;
      const base = overlays.find((o) => o.id === geo.id);
      if (!base) return;

      const rotation =
        geo.rotation ??
        (base.type === "text" ? base.rotation : base.rotation ?? 0);
      const draft: EditorOverlay =
        base.type === "text"
          ? {
              ...base,
              x: geo.x,
              y: geo.y,
              width: geo.width,
              height: geo.height,
              rotation,
              fontSize:
                geo.fontSize ??
                base.fontSize ??
                fitTextFontSize(base.text, geo.width, geo.height),
            }
          : {
              ...base,
              x: geo.x,
              y: geo.y,
              width: geo.width,
              height: geo.height,
              rotation,
            };

      const bounds = getOverlayExportBounds(draft);
      const offsetX = geo.x + geo.width / 2 - bounds.x;
      const offsetY = geo.y + geo.height / 2 - bounds.y;

      const node = overlayNodeRefs.current.get(geo.id);
      if (node) {
        node.style.left = pct(bounds.x, metrics.renderWidth);
        node.style.top = pct(bounds.y, metrics.renderHeight);
        node.style.width = pct(bounds.width, metrics.renderWidth);
        node.style.height = pct(bounds.height, metrics.renderHeight);
      }

      const content = contentNodeRefs.current.get(geo.id);
      if (content) {
        content.style.left = pct(offsetX - geo.width / 2, bounds.width);
        content.style.top = pct(offsetY - geo.height / 2, bounds.height);
        content.style.width = pct(geo.width, bounds.width);
        content.style.height = pct(geo.height, bounds.height);
        content.style.transform = `rotate(${rotation}deg)`;
      }

      if (geo.fontSize != null) {
        const text = textNodeRefs.current.get(geo.id);
        if (text) text.style.fontSize = `${geo.fontSize}px`;
      }
      liveRef.current = geo;
    },
    [metrics, overlays]
  );

  const commitLive = useCallback(() => {
    const live = liveRef.current;
    if (!live) return;
    onOverlaysChange((prev) =>
      prev.map((o) => {
        if (o.id !== live.id) return o;
        if (o.type === "text") {
          return {
            ...o,
            x: live.x,
            y: live.y,
            width: live.width,
            height: live.height,
            rotation: live.rotation ?? o.rotation,
            fontSize:
              live.fontSize ??
              fitTextFontSize(o.text, live.width, live.height),
          };
        }
        return {
          ...o,
          x: live.x,
          y: live.y,
          width: live.width,
          height: live.height,
          rotation: live.rotation ?? o.rotation,
        };
      })
    );
    liveRef.current = null;
  }, [onOverlaysChange]);

  const removeOverlay = useCallback(
    (overlayId: string) => {
      onOverlaysChange((prev) => prev.filter((o) => o.id !== overlayId));
      if (selectedOverlayId === overlayId) onSelectOverlay?.(null);
    },
    [onOverlaysChange, onSelectOverlay, selectedOverlayId]
  );

  const onDragPointerDown = (e: React.PointerEvent, overlay: EditorOverlay) => {
    if (!metrics || !containerRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    onSelectOverlay?.(overlay.id);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = {
      id: overlay.id,
      startX: e.clientX,
      startY: e.clientY,
      origX: overlay.x,
      origY: overlay.y,
      width: overlay.width,
      height: overlay.height,
    };
    liveRef.current = {
      id: overlay.id,
      x: overlay.x,
      y: overlay.y,
      width: overlay.width,
      height: overlay.height,
      rotation: overlayRotation(overlay),
    };
  };

  const onResizePointerDown = (
    e: React.PointerEvent,
    overlay: EditorOverlay,
    corner: Corner
  ) => {
    if (!metrics || !containerRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    onSelectOverlay?.(overlay.id);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const aspect = overlay.width / Math.max(overlay.height, 1);
    resizeRef.current = {
      id: overlay.id,
      corner,
      startX: e.clientX,
      startY: e.clientY,
      origX: overlay.x,
      origY: overlay.y,
      origW: overlay.width,
      origH: overlay.height,
      aspect,
      lockAspect: overlay.type === "image",
      isText: overlay.type === "text",
      text: overlay.type === "text" ? overlay.text : "",
    };
    liveRef.current = {
      id: overlay.id,
      x: overlay.x,
      y: overlay.y,
      width: overlay.width,
      height: overlay.height,
      rotation: overlayRotation(overlay),
      fontSize:
        overlay.type === "text"
          ? overlay.fontSize ??
            fitTextFontSize(overlay.text, overlay.width, overlay.height)
          : undefined,
    };
  };

  const onRotatePointerDown = (e: React.PointerEvent, overlay: EditorOverlay) => {
    if (!metrics || !containerRef.current || !canRotateOverlay(overlay)) return;
    e.preventDefault();
    e.stopPropagation();
    onSelectOverlay?.(overlay.id);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const rect = containerRef.current.getBoundingClientRect();
    const pointer = pointerToRender(e.clientX, e.clientY, rect, metrics);
    const cx = overlay.x + overlay.width / 2;
    const cy = overlay.y + overlay.height / 2;
    const startAngle =
      (Math.atan2(pointer.y - cy, pointer.x - cx) * 180) / Math.PI;
    rotateRef.current = {
      id: overlay.id,
      startAngle,
      origRotation: overlayRotation(overlay),
      cx,
      cy,
    };
    liveRef.current = {
      id: overlay.id,
      x: overlay.x,
      y: overlay.y,
      width: overlay.width,
      height: overlay.height,
      rotation: overlayRotation(overlay),
    };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!metrics || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const scaleX = metrics.renderWidth / rect.width;
    const scaleY = metrics.renderHeight / rect.height;

    const drag = dragRef.current;
    if (drag) {
      const dx = (e.clientX - drag.startX) * scaleX;
      const dy = (e.clientY - drag.startY) * scaleY;
      const box = clampBox(
        drag.origX + dx,
        drag.origY + dy,
        drag.width,
        drag.height,
        metrics
      );
      applyLiveDom({
        id: drag.id,
        ...box,
        rotation: liveRef.current?.rotation,
      });
      return;
    }

    const resize = resizeRef.current;
    if (resize) {
      const dx = (e.clientX - resize.startX) * scaleX;
      const dy = (e.clientY - resize.startY) * scaleY;
      const { corner, origX, origY, origW, origH, aspect, lockAspect } = resize;

      let nextX = origX;
      let nextY = origY;
      let nextW = origW;
      let nextH = origH;

      if (lockAspect) {
        // Prefer the axis with larger movement; keep aspect ratio
        const preferWidth = Math.abs(dx) >= Math.abs(dy) * aspect;

        if (corner === "se") {
          const sized = lockAspectSize(origW + dx, origH + dy, aspect, preferWidth);
          nextW = sized.width;
          nextH = sized.height;
        } else if (corner === "sw") {
          const sized = lockAspectSize(origW - dx, origH + dy, aspect, preferWidth);
          nextW = sized.width;
          nextH = sized.height;
          nextX = origX + origW - nextW;
        } else if (corner === "ne") {
          const sized = lockAspectSize(origW + dx, origH - dy, aspect, preferWidth);
          nextW = sized.width;
          nextH = sized.height;
          nextY = origY + origH - nextH;
        } else {
          const sized = lockAspectSize(origW - dx, origH - dy, aspect, preferWidth);
          nextW = sized.width;
          nextH = sized.height;
          nextX = origX + origW - nextW;
          nextY = origY + origH - nextH;
        }
      } else if (corner === "se") {
        nextW = origW + dx;
        nextH = origH + dy;
      } else if (corner === "sw") {
        nextW = origW - dx;
        nextH = origH + dy;
        nextX = origX + origW - nextW;
      } else if (corner === "ne") {
        nextW = origW + dx;
        nextH = origH - dy;
        nextY = origY + origH - nextH;
      } else {
        nextW = origW - dx;
        nextH = origH - dy;
        nextX = origX + origW - nextW;
        nextY = origY + origH - nextH;
      }

      nextW = Math.max(MIN_W, nextW);
      nextH = Math.max(MIN_H, nextH);

      // Keep anchored corner when min-size clamps
      if (corner === "sw" || corner === "nw") {
        nextX = origX + origW - nextW;
      }
      if (corner === "ne" || corner === "nw") {
        nextY = origY + origH - nextH;
      }

      const box = clampBox(nextX, nextY, nextW, nextH, metrics);
      const fontSize = resize.isText
        ? fitTextFontSize(resize.text, box.width, box.height)
        : undefined;

      applyLiveDom({
        id: resize.id,
        ...box,
        rotation: liveRef.current?.rotation,
        fontSize,
      });
      return;
    }

    const rotate = rotateRef.current;
    if (rotate) {
      const pointer = pointerToRender(e.clientX, e.clientY, rect, metrics);
      const angle =
        (Math.atan2(pointer.y - rotate.cy, pointer.x - rotate.cx) * 180) /
        Math.PI;
      const rotation = Math.round(rotate.origRotation + (angle - rotate.startAngle));
      const live = liveRef.current;
      if (!live) return;
      applyLiveDom({
        ...live,
        rotation,
      });
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (dragRef.current || resizeRef.current || rotateRef.current) {
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        /* already released */
      }
      dragRef.current = null;
      resizeRef.current = null;
      rotateRef.current = null;
      commitLive();
    }
  };

  return (
    <div
      id={id}
      ref={containerRef}
      className={cn(
        "relative mx-auto overflow-visible transition-shadow",
        active && "ring-2 ring-primary/30"
      )}
      style={{
        width: `${Math.round(100 * zoom)}%`,
        maxWidth: `${Math.round(820 * zoom)}px`,
      }}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onClick={() => onSelectOverlay?.(null)}
    >
      <div className="overflow-hidden rounded-lg border bg-white shadow-md">
        {canvas ? (
          <canvas ref={canvasNodeRef} className="block h-auto w-full" />
        ) : (
          <div className="flex aspect-[8.5/11] items-center justify-center bg-muted/40 text-sm text-muted-foreground">
            …
          </div>
        )}
      </div>

      {metrics && (
        <div className="pointer-events-none absolute inset-0 overflow-visible">
          <div className="relative h-full w-full">
            {overlays.map((overlay) => {
          const selected = selectedOverlayId === overlay.id;
          const isText = overlay.type === "text";
          const fontSize = isText
            ? overlay.fontSize ??
              fitTextFontSize(overlay.text, overlay.width, overlay.height)
            : undefined;
          const rotation = overlayRotation(overlay);
          const showRotate = canRotateOverlay(overlay);
          const bounds = getOverlayExportBounds(overlay);
          const offsetX = overlay.x + overlay.width / 2 - bounds.x;
          const offsetY = overlay.y + overlay.height / 2 - bounds.y;

          return (
            <div
              key={overlay.id}
              ref={(node) => {
                if (node) overlayNodeRefs.current.set(overlay.id, node);
                else overlayNodeRefs.current.delete(overlay.id);
              }}
              className={cn(
                "group pointer-events-auto absolute touch-none overflow-visible will-change-[left,top,width,height]",
                selected && "z-10"
              )}
              style={{
                left: pct(bounds.x, metrics.renderWidth),
                top: pct(bounds.y, metrics.renderHeight),
                width: pct(bounds.width, metrics.renderWidth),
                height: pct(bounds.height, metrics.renderHeight),
              }}
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => onDragPointerDown(e, overlay)}
            >
              <div
                ref={(node) => {
                  if (node) contentNodeRefs.current.set(overlay.id, node);
                  else contentNodeRefs.current.delete(overlay.id);
                }}
                className="absolute cursor-grab active:cursor-grabbing"
                style={{
                  left: pct(offsetX - overlay.width / 2, bounds.width),
                  top: pct(offsetY - overlay.height / 2, bounds.height),
                  width: pct(overlay.width, bounds.width),
                  height: pct(overlay.height, bounds.height),
                  transform: `rotate(${rotation}deg)`,
                  transformOrigin: "center center",
                }}
              >
                {overlay.type === "image" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={overlay.imageDataUrl}
                    alt=""
                    draggable={false}
                    className="pointer-events-none h-full w-full object-contain"
                    style={{ opacity: overlay.opacity ?? 1 }}
                  />
                ) : (
                  <div
                    className="flex h-full w-full items-center justify-center overflow-visible px-1 select-none font-semibold text-muted-foreground"
                    style={{ opacity: overlay.opacity }}
                  >
                    <span
                      ref={(node) => {
                        if (node) textNodeRefs.current.set(overlay.id, node);
                        else textNodeRefs.current.delete(overlay.id);
                      }}
                      className="block whitespace-nowrap text-center leading-none"
                      style={{ fontSize: `${fontSize}px` }}
                    >
                      {overlay.text}
                    </span>
                  </div>
                )}

                {(["nw", "ne", "sw", "se"] as Corner[]).map((corner) => (
                  <div
                    key={corner}
                    role="button"
                    tabIndex={-1}
                    aria-label={`Resize ${corner}`}
                    className={cn(
                      "z-20 size-3.5 rounded-sm border-2 border-primary bg-background shadow",
                      CORNER_CLASS[corner],
                      !selected && "opacity-0 group-hover:opacity-100"
                    )}
                    onPointerDown={(e) => onResizePointerDown(e, overlay, corner)}
                  />
                ))}

                {showRotate && (
                  <div
                    role="button"
                    tabIndex={-1}
                    aria-label={rotateLabel}
                    className={cn(
                      "absolute -top-6 left-1/2 z-20 flex size-5 -translate-x-1/2 cursor-grab items-center justify-center rounded-full border-2 border-primary bg-background shadow active:cursor-grabbing",
                      !selected && "opacity-0 group-hover:opacity-100"
                    )}
                    onPointerDown={(e) => onRotatePointerDown(e, overlay)}
                  >
                    <RotateCw className="size-2.5 text-primary" />
                  </div>
                )}
              </div>

              <div
                className={cn(
                  "pointer-events-none absolute inset-0 rounded border-2 border-primary/40 transition-opacity",
                  selected ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                )}
              />

              <button
                type="button"
                aria-label={removeLabel}
                className={cn(
                  "absolute -right-2 -top-2 z-30 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow",
                  !selected && "opacity-0 group-hover:opacity-100"
                )}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => removeOverlay(overlay.id)}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          );
        })}
          </div>
        </div>
      )}
    </div>
  );
}
