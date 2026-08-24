"use client";

import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import type { PDFDocumentProxy } from "pdfjs-dist";
import type { PageMetrics } from "@/lib/pdf-processor";

export const PDF_RENDER_SCALE = 1.2;

let workerReady = false;

function ensureWorker() {
  if (workerReady || typeof window === "undefined") return;
  pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  workerReady = true;
}

export async function loadPdfDocument(
  file: ArrayBuffer
): Promise<PDFDocumentProxy> {
  ensureWorker();
  const data = file.slice(0);
  return pdfjsLib.getDocument({ data }).promise;
}

export async function getPdfPageCount(file: ArrayBuffer): Promise<number> {
  const doc = await loadPdfDocument(file);
  const count = doc.numPages;
  await doc.destroy();
  return count;
}

export async function renderPdfPage(
  file: ArrayBuffer,
  pageIndex: number,
  scale = PDF_RENDER_SCALE
): Promise<{ canvas: HTMLCanvasElement; metrics: PageMetrics }> {
  const doc = await loadPdfDocument(file);
  try {
    return await renderPdfPageFromDoc(doc, pageIndex, scale);
  } finally {
    await doc.destroy();
  }
}

async function renderPdfPageFromDoc(
  doc: PDFDocumentProxy,
  pageIndex: number,
  scale: number
): Promise<{ canvas: HTMLCanvasElement; metrics: PageMetrics }> {
  const page = await doc.getPage(pageIndex + 1);
  const viewport = page.getViewport({ scale: 1 });
  const scaled = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = scaled.width;
  canvas.height = scaled.height;
  const ctx = canvas.getContext("2d")!;
  await page.render({ canvasContext: ctx, viewport: scaled, canvas }).promise;
  return {
    canvas,
    metrics: {
      renderWidth: scaled.width,
      renderHeight: scaled.height,
      pdfWidth: viewport.width,
      pdfHeight: viewport.height,
    },
  };
}

export async function renderAllPdfPages(
  file: ArrayBuffer,
  scale = PDF_RENDER_SCALE
): Promise<
  Array<{ pageIndex: number; canvas: HTMLCanvasElement; metrics: PageMetrics }>
> {
  const doc = await loadPdfDocument(file);
  try {
    const pages = await Promise.all(
      Array.from({ length: doc.numPages }, (_, pageIndex) =>
        renderPdfPageFromDoc(doc, pageIndex, scale).then((result) => ({
          pageIndex,
          ...result,
        }))
      )
    );
    return pages;
  } finally {
    await doc.destroy();
  }
}

export async function extractPdfText(file: ArrayBuffer): Promise<string> {
  const doc = await loadPdfDocument(file);
  try {
    let text = "";
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      text +=
        content.items
          .map((item) => ("str" in item ? item.str : ""))
          .join(" ") + "\n";
    }
    return text;
  } finally {
    await doc.destroy();
  }
}
