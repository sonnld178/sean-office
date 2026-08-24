import { PDFDocument, rgb, degrees } from "pdf-lib";
import * as XLSX from "xlsx";

export const PDF_RENDER_SCALE = 1.2;

export interface PageMetrics {
  renderWidth: number;
  renderHeight: number;
  pdfWidth: number;
  pdfHeight: number;
}

export interface SignaturePlacement {
  id: string;
  pageIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  imageDataUrl: string;
  opacity?: number;
  rotation?: number;
}

export interface StampPlacement {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  metrics: PageMetrics;
}

function toPdfRect(
  overlay: { x: number; y: number; width: number; height: number },
  metrics: PageMetrics,
  pageH: number
) {
  const scaleX = metrics.pdfWidth / metrics.renderWidth;
  const scaleY = metrics.pdfHeight / metrics.renderHeight;
  return {
    x: overlay.x * scaleX,
    y: pageH - (overlay.y + overlay.height) * scaleY,
    width: overlay.width * scaleX,
    height: overlay.height * scaleY,
  };
}

export interface TextOverlayExport {
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

export interface BakedPlacement {
  pageIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  imageDataUrl: string;
  opacity?: number;
}

/** WYSIWYG export — overlays pre-rendered to PNG (rotation baked in) */
export async function exportPdfWithBakedOverlays(
  file: ArrayBuffer,
  placements: BakedPlacement[],
  metricsByPage: Map<number, PageMetrics>
): Promise<Blob> {
  const pdf = await PDFDocument.load(file);
  const pages = pdf.getPages();

  for (const p of placements) {
    const page = pages[p.pageIndex];
    const metrics = metricsByPage.get(p.pageIndex);
    if (!page || !metrics) continue;

    const pngBytes = dataUrlToUint8(p.imageDataUrl);
    const img = p.imageDataUrl.includes("image/jpeg")
      ? await pdf.embedJpg(pngBytes)
      : await pdf.embedPng(pngBytes);

    const { height: pageH } = page.getSize();
    const rect = toPdfRect(p, metrics, pageH);
    page.drawImage(img, { ...rect, opacity: p.opacity ?? 1 });
  }

  const bytes = await pdf.save();
  return new Blob([bytes.buffer as ArrayBuffer], { type: "application/pdf" });
}

export async function exportPdfWithOverlays(
  file: ArrayBuffer,
  images: SignaturePlacement[],
  watermarks: TextOverlayExport[],
  metricsByPage: Map<number, PageMetrics>
): Promise<Blob> {
  const pdf = await PDFDocument.load(file);
  const pages = pdf.getPages();

  for (const w of watermarks) {
    const page = pages[w.pageIndex];
    const metrics = metricsByPage.get(w.pageIndex);
    if (!page || !metrics) continue;

    const { height: pageH, width: pageW } = page.getSize();
    const relX = w.x / metrics.renderWidth;
    const relY = w.y / metrics.renderHeight;
    const relBoxH = w.height / metrics.renderHeight;
    const x = relX * pageW;
    const y = pageH - (relY + relBoxH) * pageH;
    const fontSize =
      w.fontSize ??
      Math.max(16, Math.round((w.height / metrics.renderHeight) * pageH * 0.12));

    page.drawText(w.text, {
      x,
      y,
      size: fontSize,
      color: rgb(0.7, 0.7, 0.7),
      opacity: w.opacity,
      rotate: degrees(w.rotation),
    });
  }

  for (const p of images) {
    const page = pages[p.pageIndex];
    const metrics = metricsByPage.get(p.pageIndex);
    if (!page || !metrics) continue;

    const pngBytes = dataUrlToUint8(p.imageDataUrl);
    const img = p.imageDataUrl.includes("image/jpeg")
      ? await pdf.embedJpg(pngBytes)
      : await pdf.embedPng(pngBytes);

    const { height: pageH } = page.getSize();
    const rect = toPdfRect(p, metrics, pageH);
    const rotation = p.rotation ?? 0;
    page.drawImage(img, {
      ...rect,
      opacity: p.opacity ?? 1,
      rotate: degrees(rotation),
    });
  }

  const bytes = await pdf.save();
  return new Blob([bytes.buffer as ArrayBuffer], { type: "application/pdf" });
}

export async function stampPdf(
  file: ArrayBuffer,
  text: string,
  opacity: number,
  placement: StampPlacement
): Promise<Blob> {
  const pdf = await PDFDocument.load(file);
  const pages = pdf.getPages();
  const { metrics } = placement;
  const relX = placement.x / metrics.renderWidth;
  const relY = placement.y / metrics.renderHeight;
  const fontSize = 48;

  for (const page of pages) {
    const { width, height } = page.getSize();
    const x = relX * width;
    const y = height - (relY + relH(metrics, placement)) * height;
    page.drawText(text, {
      x,
      y,
      size: fontSize,
      color: rgb(0.7, 0.7, 0.7),
      opacity,
      rotate: degrees(placement.rotation),
    });
  }

  const bytes = await pdf.save();
  return new Blob([bytes.buffer as ArrayBuffer], { type: "application/pdf" });
}

function relH(metrics: PageMetrics, placement: StampPlacement) {
  return placement.height / metrics.renderHeight;
}

export async function signPdf(
  file: ArrayBuffer,
  placements: SignaturePlacement[],
  metricsByPage: Map<number, PageMetrics>
): Promise<Blob> {
  const pdf = await PDFDocument.load(file);
  const pages = pdf.getPages();

  for (const p of placements) {
    const page = pages[p.pageIndex];
    const metrics = metricsByPage.get(p.pageIndex);
    if (!page || !metrics) continue;

    const pngBytes = dataUrlToUint8(p.imageDataUrl);
    const img = p.imageDataUrl.includes("image/jpeg")
      ? await pdf.embedJpg(pngBytes)
      : await pdf.embedPng(pngBytes);

    const { height: pageH } = page.getSize();
    const rect = toPdfRect(p, metrics, pageH);
    page.drawImage(img, rect);
  }

  const bytes = await pdf.save();
  return new Blob([bytes.buffer as ArrayBuffer], { type: "application/pdf" });
}

function dataUrlToUint8(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(",")[1] ?? "";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function textToTableRows(text: string): string[][] {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  return lines.map((line) => line.split(/\s{2,}|\t|,/).map((c) => c.trim()));
}

export function rowsToXlsx(rows: string[][]): Blob {
  return tablesToXlsx([rows]);
}

export function tablesToXlsx(tables: string[][][], sheetNames?: string[]): Blob {
  const wb = XLSX.utils.book_new();
  tables.forEach((rows, i) => {
    if (!rows.length) return;
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const name = (sheetNames?.[i] ?? `Table ${i + 1}`).slice(0, 31);
    XLSX.utils.book_append_sheet(wb, ws, name);
  });
  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  return new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

export function defaultStampPlacement(metrics: PageMetrics): StampPlacement {
  const width = 280;
  const height = 80;
  return {
    x: (metrics.renderWidth - width) / 2,
    y: (metrics.renderHeight - height) / 2,
    width,
    height,
    rotation: -30,
    metrics,
  };
}

export function estimateWatermarkBox(text: string, metrics: PageMetrics) {
  const width = Math.min(metrics.renderWidth * 0.8, Math.max(160, text.length * 18));
  const height = 72;
  return { width, height };
}

export function fitTextFontSize(text: string, width: number, height: number) {
  const byHeight = height * 0.72;
  const byWidth = width / Math.max(text.length * 0.55, 1);
  return Math.max(10, Math.round(Math.min(byHeight, byWidth)));
}

export function estimateTextFontSize(text: string, width: number, height: number) {
  return fitTextFontSize(text, width, height);
}
