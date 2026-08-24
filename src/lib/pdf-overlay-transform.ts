import type { EditorOverlay } from "@/components/pdf/pdf-page-editor";
import { fitTextFontSize, type PageMetrics } from "@/lib/pdf-processor";

function overlayRotation(overlay: EditorOverlay): number {
  return overlay.type === "text" ? overlay.rotation : overlay.rotation ?? 0;
}

function clampBox(
  x: number,
  y: number,
  width: number,
  height: number,
  maxW: number,
  maxH: number
) {
  const w = Math.max(40, Math.min(width, maxW));
  const h = Math.max(24, Math.min(height, maxH));
  const nx = Math.max(0, Math.min(x, maxW - w));
  const ny = Math.max(0, Math.min(y, maxH - h));
  return {
    x: nx,
    y: ny,
    width: Math.min(w, maxW - nx),
    height: Math.min(h, maxH - ny),
  };
}

/** Remap overlay coords when the PDF page rotates 90° clockwise. */
export function remapOverlayForPageRotate90Cw(
  overlay: EditorOverlay,
  oldMetrics: PageMetrics
): EditorOverlay {
  const W0 = oldMetrics.renderWidth;
  const H0 = oldMetrics.renderHeight;
  const W1 = H0;
  const H1 = W0;

  const cx = overlay.x + overlay.width / 2;
  const cy = overlay.y + overlay.height / 2;
  const newW = overlay.height;
  const newH = overlay.width;

  const box = clampBox(
    cy - newW / 2,
    W0 - cx - newH / 2,
    newW,
    newH,
    W1,
    H1
  );
  const rotation = overlayRotation(overlay);

  if (overlay.type === "text") {
    return {
      ...overlay,
      ...box,
      rotation,
      fontSize: fitTextFontSize(overlay.text, box.width, box.height),
    };
  }

  return { ...overlay, ...box, rotation };
}

/** Remap overlay coords when the PDF page rotates 90° counter-clockwise. */
export function remapOverlayForPageRotate90Ccw(
  overlay: EditorOverlay,
  oldMetrics: PageMetrics
): EditorOverlay {
  const W0 = oldMetrics.renderWidth;
  const H0 = oldMetrics.renderHeight;
  const W1 = H0;
  const H1 = W0;

  const cx = overlay.x + overlay.width / 2;
  const cy = overlay.y + overlay.height / 2;
  const newW = overlay.height;
  const newH = overlay.width;

  const box = clampBox(
    H0 - cy - newW / 2,
    cx - newH / 2,
    newW,
    newH,
    W1,
    H1
  );
  const rotation = overlayRotation(overlay);

  if (overlay.type === "text") {
    return {
      ...overlay,
      ...box,
      rotation,
      fontSize: fitTextFontSize(overlay.text, box.width, box.height),
    };
  }

  return { ...overlay, ...box, rotation };
}

export function remapOverlaysForPageRotation(
  overlays: EditorOverlay[],
  pageIndices: number[],
  oldMetricsByPage: Map<number, PageMetrics>,
  angle: 90 | 270
): EditorOverlay[] {
  const targets = new Set(pageIndices);
  const remap =
    angle === 90
      ? remapOverlayForPageRotate90Cw
      : remapOverlayForPageRotate90Ccw;

  return overlays.map((overlay) => {
    if (!targets.has(overlay.pageIndex)) return overlay;
    const metrics = oldMetricsByPage.get(overlay.pageIndex);
    if (!metrics) return overlay;
    return remap(overlay, metrics);
  });
}
