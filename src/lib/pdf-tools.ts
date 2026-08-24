import { PDFDocument, degrees } from "pdf-lib";
import { tablesToXlsx } from "@/lib/pdf-processor";

export type PageRotation = 90 | 180 | 270;

export async function mergePdfs(buffers: ArrayBuffer[]): Promise<Blob> {
  if (!buffers.length) throw new Error("No PDF files");
  const merged = await PDFDocument.create();
  for (const buf of buffers) {
    const src = await PDFDocument.load(buf);
    const copied = await merged.copyPages(src, src.getPageIndices());
    copied.forEach((page) => merged.addPage(page));
  }
  const bytes = await merged.save();
  return new Blob([bytes.buffer as ArrayBuffer], { type: "application/pdf" });
}

export async function splitPdfEveryPage(buf: ArrayBuffer): Promise<Blob[]> {
  const src = await PDFDocument.load(buf);
  const count = src.getPageCount();
  const out: Blob[] = [];
  for (let i = 0; i < count; i++) {
    const doc = await PDFDocument.create();
    const [page] = await doc.copyPages(src, [i]);
    doc.addPage(page);
    const bytes = await doc.save();
    out.push(
      new Blob([bytes.buffer as ArrayBuffer], { type: "application/pdf" })
    );
  }
  return out;
}

export async function extractPageRange(
  buf: ArrayBuffer,
  start: number,
  end: number
): Promise<Blob> {
  const src = await PDFDocument.load(buf);
  const indices: number[] = [];
  for (let i = start; i <= end && i < src.getPageCount(); i++) indices.push(i);
  if (!indices.length) throw new Error("Invalid page range");
  const doc = await PDFDocument.create();
  const pages = await doc.copyPages(src, indices);
  pages.forEach((p) => doc.addPage(p));
  const bytes = await doc.save();
  return new Blob([bytes.buffer as ArrayBuffer], { type: "application/pdf" });
}

export async function rotatePdfPages(
  buf: ArrayBuffer,
  pageIndices: number[],
  angle: PageRotation
): Promise<Blob> {
  const pdf = await PDFDocument.load(buf);
  const set = new Set(pageIndices);
  pdf.getPages().forEach((page, i) => {
    if (set.has(i)) {
      const current = page.getRotation().angle;
      page.setRotation(degrees(current + angle));
    }
  });
  const bytes = await pdf.save();
  return new Blob([bytes.buffer as ArrayBuffer], { type: "application/pdf" });
}

export async function duplicatePdfPage(
  buf: ArrayBuffer,
  pageIndex: number
): Promise<Blob> {
  const src = await PDFDocument.load(buf);
  const count = src.getPageCount();
  if (pageIndex < 0 || pageIndex >= count) {
    throw new Error("Invalid page index");
  }
  const doc = await PDFDocument.create();
  const indices: number[] = [];
  for (let i = 0; i < count; i++) {
    indices.push(i);
    if (i === pageIndex) indices.push(i);
  }
  const pages = await doc.copyPages(src, indices);
  pages.forEach((page) => doc.addPage(page));
  const bytes = await doc.save();
  return new Blob([bytes.buffer as ArrayBuffer], { type: "application/pdf" });
}

/** Insert all pages from `insertBuf` after `afterIndex` (-1 = before first page). */
export async function insertPdfAt(
  buf: ArrayBuffer,
  insertBuf: ArrayBuffer,
  afterIndex: number
): Promise<Blob> {
  const src = await PDFDocument.load(buf);
  const insert = await PDFDocument.load(insertBuf);
  const srcCount = src.getPageCount();
  if (afterIndex < -1 || afterIndex >= srcCount) {
    throw new Error("Invalid insert position");
  }
  const doc = await PDFDocument.create();

  if (afterIndex >= 0) {
    const before: number[] = [];
    for (let i = 0; i <= afterIndex; i++) before.push(i);
    const pages = await doc.copyPages(src, before);
    pages.forEach((page) => doc.addPage(page));
  }

  const inserted = await doc.copyPages(insert, insert.getPageIndices());
  inserted.forEach((page) => doc.addPage(page));

  if (afterIndex + 1 < srcCount) {
    const after: number[] = [];
    for (let i = afterIndex + 1; i < srcCount; i++) after.push(i);
    const pages = await doc.copyPages(src, after);
    pages.forEach((page) => doc.addPage(page));
  }

  const bytes = await doc.save();
  return new Blob([bytes.buffer as ArrayBuffer], { type: "application/pdf" });
}

export async function deletePdfPages(
  buf: ArrayBuffer,
  pageIndices: number[]
): Promise<Blob> {
  const pdf = await PDFDocument.load(buf);
  const toRemove = [...new Set(pageIndices)].sort((a, b) => b - a);
  for (const idx of toRemove) {
    if (idx >= 0 && idx < pdf.getPageCount()) pdf.removePage(idx);
  }
  if (pdf.getPageCount() === 0) throw new Error("Cannot delete all pages");
  const bytes = await pdf.save();
  return new Blob([bytes.buffer as ArrayBuffer], { type: "application/pdf" });
}

export async function compressPdf(buf: ArrayBuffer): Promise<Blob> {
  const pdf = await PDFDocument.load(buf, { ignoreEncryption: true });
  const bytes = await pdf.save({ useObjectStreams: true });
  return new Blob([bytes.buffer as ArrayBuffer], { type: "application/pdf" });
}

export async function extractPdfToExcel(
  tables: string[][][],
  sheetNames?: string[]
): Promise<Blob> {
  if (!tables.length || tables.every((t) => !t.length)) {
    throw new Error("No tables selected");
  }
  return tablesToXlsx(tables, sheetNames);
}

export async function getPdfPageCountFromLib(buf: ArrayBuffer): Promise<number> {
  const pdf = await PDFDocument.load(buf);
  return pdf.getPageCount();
}
