import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";
import JSZip from "jszip";
import mammoth from "mammoth";
import * as XLSX from "xlsx";
import { parseSheetFile } from "./sheets-processor";

export interface FillValidation {
  placeholders: string[];
  headers: string[];
  matched: string[];
  missing: string[];
  canFill: boolean;
}

export function validateFillData(
  placeholders: string[],
  headers: string[]
): FillValidation {
  const headerSet = new Set(headers.map((h) => h.trim()));
  const matched = placeholders.filter((p) => headerSet.has(p));
  const missing = placeholders.filter((p) => !headerSet.has(p));
  return {
    placeholders,
    headers,
    matched,
    missing,
    canFill: placeholders.length > 0 && missing.length === 0,
  };
}

export function formatDocxtemplaterError(error: unknown): string {
  if (error && typeof error === "object" && "properties" in error) {
    const props = (
      error as {
        properties?: {
          errors?: Array<{ properties?: { explanation?: string } }>;
        };
      }
    ).properties;
    const explanations = (props?.errors ?? [])
      .map((e) => e.properties?.explanation)
      .filter((msg): msg is string => Boolean(msg));
    if (explanations.length > 0) {
      return explanations.join("; ");
    }
  }
  if (error instanceof Error) return error.message;
  return String(error);
}

function countOccurrences(text: string, needle: string): number {
  let count = 0;
  let pos = 0;
  while ((pos = text.indexOf(needle, pos)) !== -1) {
    count++;
    pos += needle.length;
  }
  return count;
}

function hasBrokenPlaceholderFragments(
  fullText: string,
  textNodes: { node: Element; start: number; end: number }[]
): boolean {
  const openCount = countOccurrences(fullText, "{{");
  const closeCount = countOccurrences(fullText, "}}");
  if (openCount !== closeCount) return true;

  for (const { node } of textNodes) {
    const text = node.textContent ?? "";
    if (!text.includes("{{") && !text.includes("}}")) continue;

    const nodeOpen = countOccurrences(text, "{{");
    const nodeClose = countOccurrences(text, "}}");
    if (nodeOpen !== nodeClose) return true;

    if (text.includes("{{") && !/\{\{[^}]+\}\}/.test(text)) {
      return true;
    }
  }

  return false;
}

function hasSplitPlaceholders(
  fullText: string,
  p: Element
): boolean {
  const regex = /\{\{[^}]+\}\}/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(fullText)) !== null) {
    const start = match.index;
    const end = match.index + match[0].length;
    const textNodes = collectParagraphTextNodes(p);
    let firstAffected = -1;
    let lastAffected = -1;
    for (let j = 0; j < textNodes.length; j++) {
      const { start: nodeStart, end: nodeEnd } = textNodes[j];
      if (nodeEnd <= start || nodeStart >= end) continue;
      if (firstAffected === -1) firstAffected = j;
      lastAffected = j;
    }
    if (firstAffected !== -1 && firstAffected !== lastAffected) {
      return true;
    }
  }
  return false;
}

function flattenWtNodesInParagraph(p: Element, fullText: string) {
  const pPr = Array.from(p.children).find(
    (child) => child.localName === "pPr" || child.tagName === "w:pPr"
  );

  const brRuns: Element[] = [];
  for (const child of Array.from(p.children)) {
    if (child === pPr) continue;
    const isRun =
      child.localName === "r" || child.tagName === "w:r";
    if (isRun && child.getElementsByTagName("w:br").length > 0) {
      brRuns.push(child.cloneNode(true) as Element);
    }
  }

  for (const child of Array.from(p.childNodes)) {
    if (child !== pPr) {
      p.removeChild(child);
    }
  }

  const doc = p.ownerDocument!;
  const run = doc.createElementNS(W_NS, "w:r");
  const textNode = doc.createElementNS(W_NS, "w:t");
  setTextNodeContent(textNode, fullText);
  run.appendChild(textNode);

  if (pPr) {
    p.insertBefore(run, pPr.nextSibling);
  } else {
    p.appendChild(run);
  }

  for (const brRun of brRuns) {
    p.appendChild(brRun);
  }
}

function consolidateSplitPlaceholdersInParagraph(p: Element) {
  const fullText = getParagraphText(p);
  if (!fullText.includes("{{")) return;

  const textNodes = collectParagraphTextNodes(p);
  const broken = hasBrokenPlaceholderFragments(fullText, textNodes);
  const split = hasSplitPlaceholders(fullText, p);

  if (broken || split) {
    flattenWtNodesInParagraph(p, fullText);
    return;
  }

  const regex = /\{\{[^}]+\}\}/g;
  const matches: { start: number; end: number; placeholder: string }[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(fullText)) !== null) {
    matches.push({
      start: match.index,
      end: match.index + match[0].length,
      placeholder: match[0],
    });
  }

  for (let i = matches.length - 1; i >= 0; i--) {
    const { start, end, placeholder } = matches[i];
    const nodes = collectParagraphTextNodes(p);
    let firstAffected = -1;
    let lastAffected = -1;
    for (let j = 0; j < nodes.length; j++) {
      const { start: nodeStart, end: nodeEnd } = nodes[j];
      if (nodeEnd <= start || nodeStart >= end) continue;
      if (firstAffected === -1) firstAffected = j;
      lastAffected = j;
    }
    if (firstAffected !== -1 && firstAffected !== lastAffected) {
      insertTextInParagraph(p, start, end, placeholder);
    }
  }
}

export function consolidateSplitPlaceholders(file: ArrayBuffer): ArrayBuffer {
  const zip = new PizZip(file);
  const serializer = new XMLSerializer();
  const parser = new DOMParser();

  const xmlPaths = Object.keys(zip.files).filter(
    (path) =>
      !zip.files[path].dir &&
      (path === "word/document.xml" ||
        /^word\/header\d+\.xml$/.test(path) ||
        /^word\/footer\d+\.xml$/.test(path))
  );

  for (const path of xmlPaths) {
    const xml = zip.file(path)?.asText();
    if (!xml) continue;
    const doc = parser.parseFromString(xml, "application/xml");
    for (const p of Array.from(doc.getElementsByTagName("w:p"))) {
      consolidateSplitPlaceholdersInParagraph(p);
    }
    zip.file(path, serializer.serializeToString(doc));
  }

  const out = zip.generate({ type: "uint8array" });
  return out.buffer.slice(0) as ArrayBuffer;
}

export async function fillDocxSingle(
  template: ArrayBuffer,
  data: Record<string, string>
): Promise<ArrayBuffer> {
  const consolidated = consolidateSplitPlaceholders(template);
  const content = new Uint8Array(consolidated);
  const doc = new Docxtemplater(new PizZip(content), {
    paragraphLoop: true,
    linebreaks: true,
    delimiters: { start: "{{", end: "}}" },
  });
  try {
    doc.render(data);
  } catch (error) {
    throw new Error(formatDocxtemplaterError(error));
  }
  const out = doc.getZip().generate({ type: "uint8array" });
  return out.buffer.slice(0) as ArrayBuffer;
}

export async function fillDocxTemplate(
  template: ArrayBuffer,
  dataRows: Record<string, string>[]
): Promise<Blob> {
  const zip = new JSZip();
  for (let i = 0; i < dataRows.length; i++) {
    const out = await fillDocxSingle(template, dataRows[i]);
    zip.file(`document-${i + 1}.docx`, out);
  }
  return zip.generateAsync({ type: "blob" });
}

export async function cleanDocx(
  file: ArrayBuffer,
  options: { comments: boolean; revisions: boolean; meta: boolean }
): Promise<Blob> {
  const zip = new PizZip(file);
  if (options.comments) {
    zip.remove("word/comments.xml");
    zip.remove("word/commentsExtended.xml");
  }
  if (options.revisions) {
    const docXml = zip.file("word/document.xml")?.asText() ?? "";
    const cleaned = docXml
      .replace(/<w:ins[^>]*>/g, "")
      .replace(/<\/w:ins>/g, "")
      .replace(/<w:del[^>]*>[\s\S]*?<\/w:del>/g, "");
    zip.file("word/document.xml", cleaned);
  }
  if (options.meta) {
    zip.remove("docProps/core.xml");
    zip.remove("docProps/app.xml");
  }
  const out = zip.generate({ type: "uint8array" });
  return new Blob([out.buffer as ArrayBuffer], {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
}

export interface ExtractedTable {
  index: number;
  rows: string[][];
  previewHtml: string;
}

export async function extractTablesFromDocx(
  file: ArrayBuffer
): Promise<string[][][]> {
  const scanned = await scanTablesFromDocx(file);
  return scanned.map((t) => t.rows);
}

export async function scanTablesFromDocx(
  file: ArrayBuffer
): Promise<ExtractedTable[]> {
  const result = await mammoth.convertToHtml({ arrayBuffer: file });
  const parser = new DOMParser();
  const doc = parser.parseFromString(result.value, "text/html");
  const tables = Array.from(doc.querySelectorAll("table"));
  return tables.map((table, index) => {
    const rows = Array.from(table.querySelectorAll("tr")).map((tr) =>
      Array.from(tr.querySelectorAll("th, td")).map(
        (cell) => cell.textContent?.trim() ?? ""
      )
    );
    const clone = table.cloneNode(true) as HTMLTableElement;
    const bodyRows = Array.from(clone.querySelectorAll("tr"));
    bodyRows.slice(4).forEach((tr) => tr.remove());
    return { index, rows, previewHtml: clone.outerHTML };
  });
}

export function tablesToXlsx(tables: string[][][]): Blob | null {
  if (tables.length === 0) return null;
  const wb = XLSX.utils.book_new();
  tables.forEach((table, i) => {
    const ws = XLSX.utils.aoa_to_sheet(table);
    XLSX.utils.book_append_sheet(wb, ws, `Table${i + 1}`);
  });
  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  return new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

const W_NS =
  "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

export interface DocxParagraph {
  index: number;
  text: string;
}

export interface ParagraphEdit {
  index: number;
  start: number;
  end: number;
  replacement: string;
}

export function getParagraphTextWithEdits(
  index: number,
  fallback: string,
  edits: ParagraphEdit[]
): string {
  let text = fallback;
  for (const edit of edits.filter((e) => e.index === index)) {
    text =
      text.slice(0, edit.start) + edit.replacement + text.slice(edit.end);
  }
  return text;
}

function isParagraphElement(el: Element): boolean {
  return el.localName === "p" || el.tagName === "w:p";
}

function getBodyParagraphElements(doc: Document): Element[] {
  const bodies = doc.getElementsByTagName("w:body");
  if (bodies.length === 0) return [];
  return Array.from(bodies[0].children).filter(isParagraphElement);
}

function getParagraphText(p: Element): string {
  const textNodes = p.getElementsByTagName("w:t");
  let text = "";
  for (const node of Array.from(textNodes)) {
    text += node.textContent ?? "";
  }
  return text;
}

export function parseDocxParagraphs(file: ArrayBuffer): DocxParagraph[] {
  const zip = new PizZip(file);
  const docXml = zip.file("word/document.xml")?.asText() ?? "";
  const parser = new DOMParser();
  const doc = parser.parseFromString(docXml, "application/xml");
  return getBodyParagraphElements(doc).map((p, index) => ({
    index,
    text: getParagraphText(p),
  }));
}

export function scanPlaceholders(text: string): string[] {
  const found: string[] = [];
  const regex = /\{\{([^}]+)\}\}/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    found.push(match[1].trim());
  }
  return found;
}

export function scanDocxPlaceholders(file: ArrayBuffer): string[] {
  const zip = new PizZip(file);
  const docXml = zip.file("word/document.xml")?.asText() ?? "";
  const fromXml = scanPlaceholders(docXml);
  const fromParagraphs = parseDocxParagraphs(file).flatMap((p) =>
    scanPlaceholders(p.text)
  );
  return Array.from(new Set([...fromXml, ...fromParagraphs]));
}

function setTextNodeContent(node: Element, text: string) {
  node.textContent = text;
  if (/^\s|\s$/.test(text)) {
    node.setAttribute("xml:space", "preserve");
  } else {
    node.removeAttribute("xml:space");
  }
}

function collectParagraphTextNodes(
  p: Element
): { node: Element; start: number; end: number }[] {
  const nodes: { node: Element; start: number; end: number }[] = [];
  let pos = 0;
  for (const node of Array.from(p.getElementsByTagName("w:t"))) {
    const text = node.textContent ?? "";
    nodes.push({ node, start: pos, end: pos + text.length });
    pos += text.length;
  }
  return nodes;
}

function insertTextInParagraph(
  p: Element,
  start: number,
  end: number,
  replacement: string
) {
  const safeStart = Math.max(0, start);
  const safeEnd = Math.max(safeStart, end);
  const textNodes = collectParagraphTextNodes(p);

  if (textNodes.length === 0) {
    setParagraphText(p, replacement);
    return;
  }

  let firstAffected = -1;
  let lastAffected = -1;

  for (let i = 0; i < textNodes.length; i++) {
    const { start: nodeStart, end: nodeEnd } = textNodes[i];
    if (nodeEnd <= safeStart || nodeStart >= safeEnd) continue;
    if (firstAffected === -1) firstAffected = i;
    lastAffected = i;
  }

  if (firstAffected === -1) {
    const last = textNodes[textNodes.length - 1];
    setTextNodeContent(
      last.node,
      (last.node.textContent ?? "") + replacement
    );
    return;
  }

  const first = textNodes[firstAffected];
  const last = textNodes[lastAffected];
  const firstText = first.node.textContent ?? "";
  const lastText = last.node.textContent ?? "";
  const prefix = firstText.slice(0, Math.max(0, safeStart - first.start));
  const suffix = lastText.slice(Math.max(0, safeEnd - last.start));

  setTextNodeContent(
    first.node,
    prefix + replacement + (firstAffected === lastAffected ? suffix : "")
  );

  for (let i = firstAffected + 1; i < lastAffected; i++) {
    setTextNodeContent(textNodes[i].node, "");
  }

  if (firstAffected !== lastAffected) {
    setTextNodeContent(last.node, suffix);
  }
}

function setParagraphText(p: Element, newText: string) {
  const pPr = Array.from(p.children).find(
    (child) => child.localName === "pPr" || child.tagName === "w:pPr"
  );
  for (const child of Array.from(p.childNodes)) {
    if (child !== pPr) {
      p.removeChild(child);
    }
  }
  const doc = p.ownerDocument!;
  const run = doc.createElementNS(W_NS, "w:r");
  const textNode = doc.createElementNS(W_NS, "w:t");
  setTextNodeContent(textNode, newText);
  run.appendChild(textNode);
  if (pPr) {
    p.insertBefore(run, pPr.nextSibling);
  } else {
    p.appendChild(run);
  }
}

export function applyParagraphEditsToDocx(
  file: ArrayBuffer,
  edits: ParagraphEdit[]
): Blob {
  const zip = new PizZip(file);
  const docXml = zip.file("word/document.xml")?.asText() ?? "";
  const parser = new DOMParser();
  const doc = parser.parseFromString(docXml, "application/xml");
  const paragraphs = getBodyParagraphElements(doc);

  for (const edit of edits) {
    const paragraph = paragraphs[edit.index];
    if (!paragraph) continue;
    insertTextInParagraph(
      paragraph,
      edit.start,
      edit.end,
      edit.replacement
    );
  }

  const serializer = new XMLSerializer();
  zip.file("word/document.xml", serializer.serializeToString(doc));
  const out = zip.generate({ type: "uint8array" });
  return new Blob([out.buffer as ArrayBuffer], {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
}

export { parseSheetFile };
