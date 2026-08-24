"use client";

import type { EditorOverlay } from "@/components/pdf/pdf-page-editor";
import type { BakedPlacement } from "@/lib/pdf-processor";
import { fitTextFontSize } from "@/lib/pdf-processor";

const BAKE_SCALE = 2;
/** Extra room for glyph overhang and anti-aliasing */
const CONTENT_PAD = 6;

export function getRotatedAabb(width: number, height: number, rotationDeg: number) {
  const rad = (Math.abs(rotationDeg) * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  return {
    width: width * cos + height * sin,
    height: width * sin + height * cos,
  };
}

function overlayRotation(overlay: EditorOverlay): number {
  return overlay.type === "text" ? overlay.rotation : overlay.rotation ?? 0;
}

function overlayOpacity(overlay: EditorOverlay): number {
  return overlay.type === "text" ? overlay.opacity : overlay.opacity ?? 1;
}

function measureTextBox(text: string, fontSize: number) {
  if (typeof document === "undefined") {
    return { width: text.length * fontSize * 0.55, height: fontSize * 1.25 };
  }
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return { width: text.length * fontSize * 0.55, height: fontSize * 1.25 };
  }
  ctx.font = `600 ${fontSize}px system-ui, -apple-system, Segoe UI, sans-serif`;
  const metrics = ctx.measureText(text);
  return {
    width: metrics.width + CONTENT_PAD * 2,
    height: fontSize * 1.25 + CONTENT_PAD * 2,
  };
}

/** Content size that fully contains the drawn mark (may exceed the control box). */
export function getOverlayContentSize(overlay: EditorOverlay) {
  if (overlay.type === "text") {
    const fontSize =
      overlay.fontSize ??
      fitTextFontSize(overlay.text, overlay.width, overlay.height);
    const measured = measureTextBox(overlay.text, fontSize);
    return {
      width: Math.max(overlay.width, measured.width),
      height: Math.max(overlay.height, measured.height),
      fontSize,
    };
  }
  return {
    width: overlay.width,
    height: overlay.height,
    fontSize: undefined as number | undefined,
  };
}

/** Axis-aligned bounds used for preview overflow and export placement. */
export function getOverlayExportBounds(overlay: EditorOverlay) {
  const rotation = overlayRotation(overlay);
  const content = getOverlayContentSize(overlay);
  const aabb = getRotatedAabb(content.width, content.height, rotation);
  const cx = overlay.x + overlay.width / 2;
  const cy = overlay.y + overlay.height / 2;
  return {
    x: cx - aabb.width / 2,
    y: cy - aabb.height / 2,
    width: aabb.width,
    height: aabb.height,
    contentWidth: content.width,
    contentHeight: content.height,
    fontSize: content.fontSize,
    rotation,
  };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/** Render overlay like preview (center rotation) → PNG for WYSIWYG PDF export */
export async function bakeOverlayToDataUrl(
  overlay: EditorOverlay
): Promise<string> {
  const bounds = getOverlayExportBounds(overlay);
  const w = Math.max(2, Math.ceil(bounds.width * BAKE_SCALE));
  const h = Math.max(2, Math.ceil(bounds.height * BAKE_SCALE));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  ctx.clearRect(0, 0, w, h);
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.rotate((bounds.rotation * Math.PI) / 180);
  ctx.globalAlpha = overlayOpacity(overlay);

  const cw = bounds.contentWidth * BAKE_SCALE;
  const ch = bounds.contentHeight * BAKE_SCALE;

  if (overlay.type === "text") {
    const fontSize =
      (bounds.fontSize ??
        fitTextFontSize(overlay.text, overlay.width, overlay.height)) *
      BAKE_SCALE;
    ctx.font = `600 ${fontSize}px system-ui, -apple-system, Segoe UI, sans-serif`;
    ctx.fillStyle = "#737373";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(overlay.text, 0, 0);
  } else {
    const img = await loadImage(overlay.imageDataUrl);
    const boxAspect = cw / ch;
    const imgAspect = img.naturalWidth / Math.max(img.naturalHeight, 1);
    let dw = cw;
    let dh = ch;
    if (imgAspect > boxAspect) {
      dh = cw / imgAspect;
    } else {
      dw = ch * imgAspect;
    }
    ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
  }

  ctx.restore();
  return canvas.toDataURL("image/png");
}

export async function bakeOverlayPlacement(
  overlay: EditorOverlay
): Promise<BakedPlacement> {
  const bounds = getOverlayExportBounds(overlay);
  const imageDataUrl = await bakeOverlayToDataUrl(overlay);
  return {
    pageIndex: overlay.pageIndex,
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    imageDataUrl,
    opacity: overlayOpacity(overlay),
  };
}
