#!/usr/bin/env node
/**
 * Generate per-tool sample data (full English) for Sheets / Word / PDF.
 * Output: public/samples/*
 * Uses existing prod deps: xlsx, docx, pizzip, pdf-lib
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as XLSX from "xlsx";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
  HeadingLevel,
  Header,
  Footer,
  PageNumber,
} from "docx";
import PizZip from "pizzip";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const outDir = path.join(root, "public", "samples");
fs.mkdirSync(outDir, { recursive: true });

// ---------- SHEETS ----------
function generateSheets() {
  const headers = [
    "Full Name",
    "Email Address",
    "Alternate Email",
    "Phone Number",
    "Secondary Phone",
    "Date of Birth",
    "Hire Date",
    "Street Address",
    "Company Name",
    "Department",
    "Notes",
    "EmptyCol",
  ];

  const rows = [
    // Valid rows (for AI context)
    ["John Doe", "john.doe@example.com", "john.alt@example.com", "(+1) 555-123-4567", "+44 20 7946 0958", "1990-08-15", "2022-03-01", "123 Main St, New York", "Acme Corp", "Engineering", "Team lead", ""],
    ["  Nguyen Van A  ", "  ALICE.SMITH@Example.COM  ", "alice.smith@corp.io", "0912 345 678", "(+84) 912-345-678", "1988/04/22", "01-15-2024", "  45 Le Loi, HCMC  ", "Beta Ltd", "Sales", "  Needs follow-up  ", ""],
    ["Maria Garcia", "maria.garcia@example.com", "m.garcia@outlook.com", "+1 (415) 555-0199", "415-555-0200", "1995-12-03", "2024-02-30", "789 Oak Ave, SF", "Acme Corp", "Engineering", "Top performer", ""],
    // Empty handling
    ["", "", "", "", "", "", "", "", "", "", "", ""],
    ["   ", "   ", "   ", "   ", "   ", "   ", "   ", "   ", "   ", "   ", "   ", ""],
    // Invalid email rows
    ["Bad Email User", "bademail.example.com", "also-bad", "555-0001", "", "1992-06-10", "2023-07-15", "Unknown", "Gamma Inc", "Marketing", "Invalid emails", ""],
    ["  BAD spacing  ", "  BAD@  ", "bad@bad", "  (+84) 988-777-666  ", "", "15/08/1990", "2024-03-01", "Hanoi", "Acme Corp", "Sales", "", ""],
    // Date variants
    ["Date Tester", "date.tester@example.com", "dt2@example.com", "+33 1 23 45 67 89", "", "2024/02/29", "2024-13-01", "Paris", "Delta Co", "HR", "Leap year check", ""],
    // Phone variants
    ["Phone Tester", "phone.tester@example.com", "pt2@example.com", "+1 (555) 123-4567", "0912.345.678", "1985-11-20", "2020-01-10", "London", "Acme Corp", "", "Phone formats", ""],
    // Department variants for filter
    ["Engineering Lead", "eng.lead@example.com", "eng2@example.com", "555-0100", "", "1991-09-09", "2021-06-01", "Berlin", "Acme Corp", "Engineering", "", ""],
    ["Sales Rep", "sales.rep@example.com", "sales2@example.com", "555-0101", "", "1993-02-14", "2021-07-01", "Tokyo", "Beta Ltd", "Sales", "", ""],
    ["HR Manager", "hr.manager@example.com", "hr2@example.com", "555-0102", "", "1987-07-07", "2019-09-15", "Sydney", "Delta Co", "HR", "", ""],
    // Duplicate email for dedupe
    ["John Duplicate", "john.doe@example.com", "john.dup@example.com", "555-9999", "", "1990-08-15", "2022-03-01", "123 Main St, New York", "Acme Corp", "Engineering", "Duplicate of row 1", ""],
    ["Alice Duplicate", "ALICE.SMITH@Example.COM", "alice.dup@example.com", "0912 345 678", "", "1988-04-22", "2024-01-15", "45 Le Loi, HCMC", "Beta Ltd", "Sales", "Case-insensitive duplicate", ""],
    // Trailing space header test + whitespace Notes
    ["Whitespace Notes", "ws.notes@example.com", "ws2@example.com", "555-0200", "", "2000-01-01", "2024-06-01", "  99 Test Blvd  ", "Gamma Inc", "Marketing", "   ", ""],
    // Final valid
    ["Final Valid", "final.valid@example.com", "final2@example.com", "+49 30 123456", "", "1999-10-10", "2023-12-31", "Munich", "Acme Corp", "Engineering", "All good", ""],
  ];

  // Build sheet: header row + rows
  const aoa = [headers, ...rows];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  // Set column widths for readability
  ws["!cols"] = headers.map(() => ({ wch: 18 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Contacts");

  const xlsxPath = path.join(outDir, "sheets-messy.xlsx");
  XLSX.writeFile(wb, xlsxPath);

  // CSV version (same data, comma)
  const csv = XLSX.utils.sheet_to_csv(ws);
  fs.writeFileSync(path.join(outDir, "sheets-messy.csv"), csv, "utf8");

  // Mapping examples
  const validMapping = [
    { source: "Full Name", target: "full_name", transform: "trim", confidence: 0.98, reason: "Direct name field" },
    { source: "Email Address", target: "email", transform: "email", confidence: 0.99, reason: "Primary email" },
    { source: "Alternate Email", target: "alternate_email", transform: "email", confidence: 0.9, reason: "Secondary email" },
    { source: "Phone Number", target: "phone", transform: "phone", confidence: 0.96, reason: "Primary phone" },
    { source: "Secondary Phone", target: "secondary_phone", transform: "phone", confidence: 0.88, reason: "Secondary phone" },
    { source: "Date of Birth", target: "dob", transform: "date", confidence: 0.97, reason: "Birth date" },
    { source: "Hire Date", target: "hire_date", transform: "date", confidence: 0.95, reason: "Hire date" },
    { source: "Street Address", target: "address", transform: "trim", confidence: 0.92, reason: "Address field" },
    { source: "Company Name", target: "company_name", transform: "trim", confidence: 0.94, reason: "Company" },
    { source: "Department", target: "department", transform: "trim", confidence: 0.93, reason: "Department for filtering" },
    { source: "Notes", target: "notes", transform: "trim", confidence: 0.85, reason: "Freeform notes" },
    { source: "EmptyCol", target: "", transform: "none", confidence: 0.1, reason: "Empty column - suggest dropping" },
  ];
  fs.writeFileSync(path.join(outDir, "sheets-mapping-example.json"), JSON.stringify(validMapping, null, 2), "utf8");

  // Invalid mapping (to trigger import error handling + transform fallback)
  const invalidMapping = { notAnArray: true, mappings: validMapping };
  fs.writeFileSync(path.join(outDir, "sheets-mapping-invalid.json"), JSON.stringify(invalidMapping, null, 2), "utf8");

  console.log("✓ sheets-messy.xlsx/csv + mapping jsons");
}

// ---------- WORD ----------
async function generateWord() {
  // Data sheet for Fill: must match placeholders exactly (trimmed match via headerSet)
  const dataHeaders = ["full_name", "email", "phone", "dob", "company", "address", "notes"];
  const dataRows = [
    ["John Doe", "john.doe@example.com", "+1 555-123-4567", "1990-08-15", "Acme Corp", "123 Main St, New York", "Welcome aboard!"],
    ["Alice Smith", "alice.smith@example.com", "+84 912 345 678", "1988-04-22", "Beta Ltd", "45 Le Loi, HCMC", "Needs follow-up.\nSecond line."],
    ["Maria Garcia", "maria.garcia@example.com", "+1 415-555-0199", "1995-12-03", "Acme Corp", "789 Oak Ave, SF", "Top performer - Q1"],
  ];
  const ws = XLSX.utils.aoa_to_sheet([dataHeaders, ...dataRows]);
  ws["!cols"] = dataHeaders.map(() => ({ wch: 20 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Data");
  XLSX.writeFile(wb, path.join(outDir, "word-data.xlsx"));
  fs.writeFileSync(path.join(outDir, "word-data.csv"), XLSX.utils.sheet_to_csv(ws), "utf8");

  // Missing-column variant (for validation failure)
  const missingHeaders = ["full_name", "phone", "company"]; // no email, no dob etc.
  const missingWs = XLSX.utils.aoa_to_sheet([missingHeaders, ["John Doe", "555-0100", "Acme Corp"]]);
  const missingWb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(missingWb, missingWs, "Data");
  XLSX.writeFile(missingWb, path.join(outDir, "word-data-missing.xlsx"));
  console.log("✓ word-data.xlsx/csv + missing variant");

  // Template docx - intentionally English
  const doc = new Document({
    sections: [
      {
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({ text: "Offer Letter - ", italics: true, size: 18 }),
                  new TextRun({ text: "{{company}}", bold: true, size: 18 }),
                  new TextRun({ text: "  |  Confidential", italics: true, size: 18 }),
                ],
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({ text: "Questions? Contact ", size: 16 }),
                  new TextRun({ text: "{{email}}", bold: true, size: 16 }),
                  new TextRun({ text: "  -  Page ", size: 16 }),
                  new TextRun({ children: [PageNumber.CURRENT], size: 16 }),
                ],
              }),
            ],
          }),
        },
        children: [
          new Paragraph({
            heading: HeadingLevel.TITLE,
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: "Employment Offer Letter", bold: true, size: 28 })],
          }),
          new Paragraph({
            children: [
              new TextRun({ text: "Dear ", size: 22 }),
              new TextRun({ text: "{{full_name}}", bold: true, size: 22 }),
              new TextRun({ text: ",", size: 22 }),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: "We are pleased to offer you a position at {{company}}. Your start date is {{dob}} (DOB on file) and you will be based at {{address}}.",
                size: 20,
              }),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun({ text: "Your contact phone is ", size: 20 }),
              new TextRun({ text: "{{phone}}", bold: true, size: 20 }),
              new TextRun({ text: " and your email is ", size: 20 }),
              new TextRun({ text: "{{email}}", bold: true, size: 20 }),
              new TextRun({ text: ".", size: 20 }),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun({ text: "Notes: ", bold: true, size: 20 }),
              new TextRun({ text: "{{notes}}", size: 20 }),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun({ text: "Please confirm acceptance by signing below.", size: 20 }),
            ],
          }),
          new Paragraph({ children: [new TextRun({ text: "", size: 12 })] }),
          new Paragraph({
            children: [
              new TextRun({ text: "Signature: ________________________   Date: __________", size: 20 }),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun({ text: "HR Department - {{company}}", italics: true, size: 18 }),
            ],
          }),
        ],
      },
    ],
  });

  const buf = await Packer.toBuffer(doc);
  const templatePath = path.join(outDir, "word-template.docx");
  fs.writeFileSync(templatePath, buf);

  // Patch to create a split-run placeholder: fragment {{full_name}} across 2 w:r
  // Find word/document.xml inside the docx zip and split one occurrence.
  const zip = new PizZip(buf);
  let xml = zip.file("word/document.xml").asText();
  // Replace first {{full_name}} with split version across two runs: {{ + full_name + }}
  // docx lib may emit {{full_name}} inside single w:t; we artificially split it.
  // Approach: replace the w:t containing {{full_name}} with two w:r elements.
  // We do a simple string replace: keep surrounding w:r/w:t structure but split text.
  // Look for the run that contains {{full_name}} - duplicate the run tags.
  if (xml.includes("{{full_name}}")) {
    xml = xml.replace(
      "{{full_name}}",
      "{{</w:t></w:r><w:r><w:rPr><w:b/></w:rPr><w:t>full_name}}</w:t>"
    );
    // The above creates two runs: first run ends after {{, second run starts with full_name}}
    // It's intentionally fragmented to exercise consolidateSplitPlaceholders in docs-processor.ts
    zip.file("word/document.xml", xml);
    const splitBuf = zip.generate({ type: "nodebuffer", compression: "DEFLATE" });
    fs.writeFileSync(path.join(outDir, "word-template-split.docx"), splitBuf);
    console.log("✓ word-template.docx + split variant (fragmented {{full_name}})");
  } else {
    console.warn("! could not find {{full_name}} to split - writing plain copy as split variant");
    fs.writeFileSync(path.join(outDir, "word-template-split.docx"), buf);
    console.log("✓ word-template.docx + split variant (plain fallback)");
  }

  // Docx with tables for Extract (2 tables) + comments/revisions hint
  const tableDoc = new Document({
    sections: [
      {
        children: [
          new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: "Sample Report - Tables", bold: true })] }),
          new Paragraph({ children: [new TextRun({ text: "Table 1: Employee Directory" })] }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Name", bold: true })] })] }),
                  new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Department", bold: true })] })] }),
                  new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Location", bold: true })] })] }),
                  new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Status", bold: true })] })] }),
                ],
              }),
              new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph("John Doe")] }),
                  new TableCell({ children: [new Paragraph("Engineering")] }),
                  new TableCell({ children: [new Paragraph("New York")] }),
                  new TableCell({ children: [new Paragraph("Active")] }),
                ],
              }),
              new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph("Alice Smith")] }),
                  new TableCell({ children: [new Paragraph("Sales")] }),
                  new TableCell({ children: [new Paragraph("HCMC")] }),
                  new TableCell({ children: [new Paragraph("Active")] }),
                ],
              }),
              new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph("Maria Garcia")] }),
                  new TableCell({ children: [new Paragraph("Engineering")] }),
                  new TableCell({ children: [new Paragraph("San Francisco")] }),
                  new TableCell({ children: [new Paragraph("On Leave")] }),
                ],
              }),
            ],
          }),
          new Paragraph({ children: [new TextRun({ text: "" })] }),
          new Paragraph({ children: [new TextRun({ text: "Table 2: Quarterly Summary" })] }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Quarter", bold: true })] })] }),
                  new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Revenue", bold: true })] })] }),
                  new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Growth", bold: true })] })] }),
                ],
              }),
              new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph("Q1 2024")] }),
                  new TableCell({ children: [new Paragraph("$1.2M")] }),
                  new TableCell({ children: [new Paragraph("+8%")] }),
                ],
              }),
              new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph("Q2 2024")] }),
                  new TableCell({ children: [new Paragraph("$1.5M")] }),
                  new TableCell({ children: [new Paragraph("+12%")] }),
                ],
              }),
              new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph("Q3 2024")] }),
                  new TableCell({ children: [new Paragraph("$1.8M")] }),
                  new TableCell({ children: [new Paragraph("+20%")] }),
                ],
              }),
            ],
          }),
          new Paragraph({ children: [new TextRun({ text: "End of report." })] }),
        ],
      },
    ],
  });
  const tableBuf = await Packer.toBuffer(tableDoc);
  fs.writeFileSync(path.join(outDir, "word-tables.docx"), tableBuf);
  console.log("✓ word-tables.docx (2 tables for Extract)");
}

// ---------- PDF ----------
async function generatePdf() {
  const A4 = { w: 595.28, h: 841.89 }; // pt

  async function createPdf(pages, outName) {
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    for (const pageSpec of pages) {
      const page = pdfDoc.addPage([pageSpec.w ?? A4.w, pageSpec.h ?? A4.h]);
      const { width, height } = page.getSize();
      let y = height - 50;
      if (pageSpec.title) {
        page.drawText(pageSpec.title, { x: 50, y, size: 18, font: bold, color: rgb(0.1, 0.1, 0.1) });
        y -= 22;
        page.drawText(pageSpec.subtitle ?? "", { x: 50, y, size: 10, font, color: rgb(0.4, 0.4, 0.4) });
        y -= 18;
        // underline
        page.drawLine({ start: { x: 50, y }, end: { x: width - 50, y }, thickness: 0.5, color: rgb(0.7, 0.7, 0.7) });
        y -= 18;
      }
      for (const block of pageSpec.blocks ?? []) {
        if (block.type === "text") {
          for (const line of block.lines) {
            page.drawText(line, { x: 50, y, size: block.size ?? 10, font: block.bold ? bold : font, color: rgb(0.15, 0.15, 0.15) });
            y -= block.lineGap ?? 14;
          }
          y -= 8;
        } else if (block.type === "table") {
          // Simple text-based table: draw rows as spaced text with gaps >12pt for pdf-table-detector
          // We use monospaced-ish spacing: colX positions with big gaps
          const colX = block.colX ?? [50, 180, 320, 440];
          const colW = block.colW ?? 100;
          // Header
          y -= 4;
          // header bg
          page.drawRectangle({ x: 48, y: y - 6, width: width - 96, height: 18, color: rgb(0.95, 0.95, 0.95), borderColor: rgb(0.8, 0.8, 0.8), borderWidth: 0.5 });
          for (let c = 0; c < block.header.length; c++) {
            page.drawText(block.header[c], { x: colX[c], y: y - 2, size: 9, font: bold, color: rgb(0.1, 0.1, 0.1) });
          }
          y -= 16;
          for (const row of block.rows) {
            // row line
            page.drawLine({ start: { x: 48, y: y + 10 }, end: { x: width - 48, y: y + 10 }, thickness: 0.3, color: rgb(0.9, 0.9, 0.9) });
            for (let c = 0; c < row.length; c++) {
              page.drawText(String(row[c] ?? ""), { x: colX[c], y, size: 9, font, color: rgb(0.15, 0.15, 0.15) });
            }
            y -= 14;
          }
          // bottom border
          page.drawLine({ start: { x: 48, y: y + 8 }, end: { x: width - 48, y: y + 8 }, thickness: 0.5, color: rgb(0.7, 0.7, 0.7) });
          y -= 12;
          // extra single-col paragraph after table to test negative case
          if (block.afterText) {
            for (const line of block.afterText) {
              page.drawText(line, { x: 50, y, size: 9, font, color: rgb(0.3, 0.3, 0.3) });
              y -= 12;
            }
            y -= 6;
          }
        } else if (block.type === "rect") {
          page.drawRectangle({ x: block.x, y: block.y, width: block.w, height: block.h, color: block.color ?? rgb(0.96, 0.96, 0.96), borderColor: rgb(0.8, 0.8, 0.8), borderWidth: 0.5 });
        }
      }
      // footer page number
      page.drawText(`Page ${pdfDoc.getPageCount()}  -  Sample PDF for SeanOffice testing`, { x: 50, y: 30, size: 8, font, color: rgb(0.5, 0.5, 0.5) });
    }
    const bytes = await pdfDoc.save({ useObjectStreams: true });
    fs.writeFileSync(path.join(outDir, outName), bytes);
    console.log(`✓ ${outName} (${pages.length} pages)`);
  }

  // Main demo: 3 pages, mixed portrait + landscape, each has a table
  await createPdf(
    [
      {
        title: "Acme Corp - Quarterly Report",
        subtitle: "Sample PDF for Sheets / Word / PDF tools  -  Text-based tables for Extract testing",
        blocks: [
          { type: "text", lines: ["This page contains an introduction and Table 1. The tables use text layout with column gaps >12pt", "so the Extract tool (pdf-table-detector) can detect them. Next pages test rotation and cloning."], size: 10 },
          {
            type: "table",
            colX: [50, 180, 320, 440],
            header: ["Employee", "Department", "Location", "Status"],
            rows: [
              ["John Doe", "Engineering", "New York", "Active"],
              ["Alice Smith", "Sales", "HCMC", "Active"],
              ["Maria Garcia", "Engineering", "San Francisco", "On Leave"],
              ["David Lee", "HR", "Berlin", "Active"],
            ],
            afterText: ["Note: This single-column paragraph should NOT be detected as a table.", "It tests the negative branch of the table detector."],
          },
        ],
      },
      {
        // Landscape to test overlay remapping on rotation
        w: A4.h,
        h: A4.w,
        title: "Financial Summary - Landscape Page",
        subtitle: "Landscape page to test overlay rotation (90°) and Watermark cloning across sizes",
        blocks: [
          { type: "text", lines: ["Landscape orientation. Place a watermark here and rotate the page - overlay should remap correctly.", "Use Apply to all pages to test cloning with different page sizes."], size: 10 },
          {
            type: "table",
            colX: [50, 200, 360, 520],
            header: ["Quarter", "Revenue", "Expenses", "Growth"],
            rows: [
              ["Q1 2024", "$1.2M", "$0.8M", "+8%"],
              ["Q2 2024", "$1.5M", "$0.9M", "+12%"],
              ["Q3 2024", "$1.8M", "$1.0M", "+20%"],
              ["Q4 2024", "$2.1M", "$1.1M", "+16%"],
            ],
          },
        ],
      },
      {
        title: "Appendix - Additional Tables",
        subtitle: "Third page with a wider table for split/merge and compress testing",
        blocks: [
          { type: "text", lines: ["This page will be used to test Split (every page as ZIP), Delete/Duplicate/Insert, and", "Compress (object streams). The embedded text ensures file size >30KB for compression demo."], size: 10 },
          {
            type: "table",
            colX: [50, 170, 290, 410],
            header: ["Project", "Owner", "Deadline", "Budget"],
            rows: [
              ["Phoenix", "John Doe", "2024-09-01", "$120,000"],
              ["Orion", "Alice Smith", "2024-10-15", "$85,000"],
              ["Nebula", "Maria Garcia", "2024-11-30", "$200,000"],
              ["Atlas", "David Lee", "2025-01-10", "$150,000"],
            ],
          },
          { type: "text", lines: ["Lorem ipsum dolor sit amet, consectetur adipiscing elit. ".repeat(6)], size: 8, lineGap: 10 },
          { type: "text", lines: ["Sed do eiusmod tempor incididunt ut labore. ".repeat(6)], size: 8, lineGap: 10 },
        ],
      },
    ],
    "pdf-demo-3pages.pdf"
  );

  // Insert helper: 1 page
  await createPdf(
    [
      {
        title: "Insert Sample - Single Page",
        subtitle: "Use this file with PDF -> Insert (after page or before first)",
        blocks: [
          { type: "text", lines: ["This is a single-page PDF designed to be inserted into the demo file.", "Test Insert at start (before first), between pages, and at end."], size: 10 },
          {
            type: "table",
            colX: [50, 200, 350],
            header: ["Item", "Qty", "Price"],
            rows: [
              ["Widget A", "10", "$100"],
              ["Widget B", "5", "$250"],
            ],
          },
        ],
      },
    ],
    "pdf-insert-1page.pdf"
  );

  // Merge helpers: two 2-page files
  await createPdf(
    [
      { title: "Merge Part A - Page 1", blocks: [{ type: "text", lines: ["Merge test file A, page 1. Combine with Part B via Merge PDFs tool."], size: 10 }] },
      { title: "Merge Part A - Page 2", blocks: [{ type: "text", lines: ["Merge test file A, page 2."], size: 10 }] },
    ],
    "pdf-merge-a.pdf"
  );
  await createPdf(
    [
      { title: "Merge Part B - Page 1", blocks: [{ type: "text", lines: ["Merge test file B, page 1."], size: 10 }] },
      { title: "Merge Part B - Page 2", blocks: [{ type: "text", lines: ["Merge test file B, page 2."], size: 10 }] },
    ],
    "pdf-merge-b.pdf"
  );
}

generateSheets();
await generateWord();
await generatePdf();

console.log("\nAll sample data written to", outDir);
