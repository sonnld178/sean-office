"use client";

import { loadPdfDocument } from "@/lib/pdfjs-client";

export interface DetectedTable {
  id: string;
  pageIndex: number;
  rows: string[][];
  rowCount: number;
  colCount: number;
}

interface TextItem {
  str: string;
  x: number;
  y: number;
}

const Y_TOLERANCE = 4;
const X_GAP_THRESHOLD = 12;
const MIN_ROWS = 2;
const MIN_COLS = 2;

function extractItems(items: { str?: string; transform?: number[] }[]): TextItem[] {
  const out: TextItem[] = [];
  for (const item of items) {
    if (!item.str?.trim() || !item.transform) continue;
    const t = item.transform;
    out.push({ str: item.str, x: t[4]!, y: t[5]! });
  }
  return out;
}

function groupIntoRows(items: TextItem[]): TextItem[][] {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const rows: TextItem[][] = [];

  for (const item of sorted) {
    let placed = false;
    for (const row of rows) {
      if (Math.abs(item.y - row[0]!.y) <= Y_TOLERANCE) {
        row.push(item);
        placed = true;
        break;
      }
    }
    if (!placed) rows.push([item]);
  }

  return rows.map((row) => row.sort((a, b) => a.x - b.x));
}

function rowToCells(row: TextItem[]): string[] {
  if (!row.length) return [];
  const cells: string[] = [];
  let current = row[0]!.str;
  let lastEndX = row[0]!.x + row[0]!.str.length * 4;

  for (let i = 1; i < row.length; i++) {
    const item = row[i]!;
    if (item.x - lastEndX > X_GAP_THRESHOLD) {
      cells.push(current.trim());
      current = item.str;
    } else {
      current += (current.endsWith(" ") || item.str.startsWith(" ") ? "" : " ") + item.str;
    }
    lastEndX = item.x + item.str.length * 4;
  }
  cells.push(current.trim());
  return cells.filter(Boolean);
}

function colCountMatches(a: number, b: number): boolean {
  return Math.abs(a - b) <= 1 && Math.min(a, b) >= MIN_COLS;
}

function rowsHaveStableColumns(cellRows: string[][]): boolean {
  if (cellRows.length < MIN_ROWS) return false;
  const counts = cellRows.map((r) => r.length);
  const mode = counts.reduce(
    (best, c) => {
      const freq = counts.filter((x) => colCountMatches(x, c)).length;
      return freq > best.freq ? { col: c, freq } : best;
    },
    { col: counts[0]!, freq: 0 }
  ).col;

  const matching = cellRows.filter((r) => colCountMatches(r.length, mode));
  return matching.length >= MIN_ROWS && mode >= MIN_COLS;
}

function normalizeRow(row: string[], targetCols: number): string[] {
  if (row.length === targetCols) return row;
  if (row.length < targetCols) {
    return [...row, ...Array(targetCols - row.length).fill("")];
  }
  const head = row.slice(0, targetCols - 1);
  head.push(row.slice(targetCols - 1).join(" "));
  return head;
}

function findTableBlocks(cellRows: string[][]): string[][][] {
  const blocks: string[][][] = [];
  let current: string[][] = [];

  const flush = () => {
    if (current.length >= MIN_ROWS && rowsHaveStableColumns(current)) {
      const targetCols = Math.round(
        current.reduce((s, r) => s + r.length, 0) / current.length
      );
      blocks.push(
        current.map((r) => normalizeRow(r, Math.max(targetCols, MIN_COLS)))
      );
    }
    current = [];
  };

  for (const row of cellRows) {
    if (row.length < MIN_COLS) {
      flush();
      continue;
    }
    if (!current.length) {
      current.push(row);
      continue;
    }
    const prevCols = current[0]!.length;
    if (colCountMatches(row.length, prevCols)) {
      current.push(row);
    } else {
      flush();
      current.push(row);
    }
  }
  flush();
  return blocks;
}

async function detectTablesOnPage(
  pageIndex: number,
  doc: Awaited<ReturnType<typeof loadPdfDocument>>
): Promise<DetectedTable[]> {
  const page = await doc.getPage(pageIndex + 1);
  const content = await page.getTextContent();
  const items = extractItems(content.items as { str?: string; transform?: number[] }[]);
  if (!items.length) return [];

  const textRows = groupIntoRows(items);
  const cellRows = textRows
    .map(rowToCells)
    .filter((r) => r.some((c) => c.trim()));

  const blocks = findTableBlocks(cellRows);
  return blocks.map((rows, i) => ({
    id: `p${pageIndex + 1}-t${i + 1}`,
    pageIndex,
    rows,
    rowCount: rows.length,
    colCount: rows[0]?.length ?? 0,
  }));
}

export async function detectPdfTables(buf: ArrayBuffer): Promise<DetectedTable[]> {
  const doc = await loadPdfDocument(buf);
  try {
    const tables: DetectedTable[] = [];
    for (let i = 0; i < doc.numPages; i++) {
      tables.push(...(await detectTablesOnPage(i, doc)));
    }
    return tables;
  } finally {
    await doc.destroy();
  }
}
