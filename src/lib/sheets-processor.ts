import * as XLSX from "xlsx";
import type { ColumnMapping, SheetRow } from "@/store/app-store";

export async function parseSpreadsheet(
  file: File | ArrayBuffer
): Promise<{
  headers: string[];
  rows: SheetRow[];
}> {
  const buffer = file instanceof ArrayBuffer ? file : await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array", cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: null,
  });
  if (json.length === 0) {
    const rows2d = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 });
    const headers = (rows2d[0] ?? []).map(String);
    const rows: SheetRow[] = rows2d.slice(1).map((r) => {
      const obj: SheetRow = {};
      headers.forEach((h, i) => {
        obj[h] = r[i] != null ? String(r[i]) : null;
      });
      return obj;
    });
    return { headers, rows };
  }
  const headers = Object.keys(json[0] ?? {});
  const rows: SheetRow[] = json.map((row) => {
    const obj: SheetRow = {};
    for (const [k, v] of Object.entries(row)) {
      obj[k] =
        v == null
          ? null
          : v instanceof Date
            ? v.toISOString().slice(0, 10)
            : String(v);
    }
    return obj;
  });
  return { headers, rows };
}

function applyTransform(
  value: string | number | null,
  transform: ColumnMapping["transform"]
): string | number | null {
  if (value == null) return null;
  const s = String(value);
  switch (transform) {
    case "trim":
      return s.trim();
    case "email":
      return s.trim().toLowerCase();
    case "phone":
      return s.replace(/[^\d+]/g, "");
    case "date": {
      const d = new Date(s);
      return isNaN(d.getTime()) ? s : d.toISOString().slice(0, 10);
    }
    default:
      return s;
  }
}

export function applyMappings(
  rows: SheetRow[],
  mappings: ColumnMapping[]
): SheetRow[] {
  return rows.map((row) => {
    const out: SheetRow = {};
    for (const m of mappings) {
      if (!m.target) continue;
      const raw = row[m.source] ?? null;
      out[m.target] = applyTransform(raw, m.transform);
    }
    return out;
  });
}

export function validateRows(rows: SheetRow[]): string[] {
  const errors: string[] = [];
  rows.forEach((row, i) => {
    const email = Object.entries(row).find(([k]) =>
      k.toLowerCase().includes("email")
    );
    if (email?.[1] && !String(email[1]).includes("@")) {
      errors.push(`Row ${i + 1}: invalid email`);
    }
  });
  return errors.slice(0, 20);
}

export type FilterOp = "contains" | "equals" | "notEmpty" | "isEmpty";

export function filterRows(
  rows: SheetRow[],
  column: string,
  op: FilterOp,
  value = ""
): SheetRow[] {
  if (!column) return rows;
  return rows.filter((row) => {
    const str =
      row[column] == null ? "" : String(row[column]).trim();
    switch (op) {
      case "contains":
        return str.toLowerCase().includes(value.trim().toLowerCase());
      case "equals":
        return str.toLowerCase() === value.trim().toLowerCase();
      case "notEmpty":
        return str !== "";
      case "isEmpty":
        return str === "";
      default:
        return true;
    }
  });
}

export interface CleanOptions {
  removeEmptyRows?: boolean;
  trimCells?: boolean;
  removeEmptyColumns?: boolean;
}

export function cleanRows(
  rows: SheetRow[],
  headers: string[],
  options: CleanOptions
): { headers: string[]; rows: SheetRow[] } {
  let resultRows = rows.map((row) => ({ ...row }));
  let resultHeaders = [...headers];

  if (options.trimCells) {
    resultRows = resultRows.map((row) => {
      const out: SheetRow = {};
      for (const [k, v] of Object.entries(row)) {
        out[k] = v == null ? null : String(v).trim();
      }
      return out;
    });
  }

  if (options.removeEmptyRows) {
    resultRows = resultRows.filter((row) =>
      Object.values(row).some((v) => v != null && String(v).trim() !== "")
    );
  }

  if (options.removeEmptyColumns) {
    const emptyCols = resultHeaders.filter((h) =>
      resultRows.every((row) => {
        const v = row[h];
        return v == null || String(v).trim() === "";
      })
    );
    resultHeaders = resultHeaders.filter((h) => !emptyCols.includes(h));
    resultRows = resultRows.map((row) => {
      const out: SheetRow = {};
      for (const h of resultHeaders) {
        out[h] = row[h] ?? null;
      }
      return out;
    });
  }

  return { headers: resultHeaders, rows: resultRows };
}

const VALID_TRANSFORMS = new Set<ColumnMapping["transform"]>([
  "none",
  "trim",
  "email",
  "phone",
  "date",
]);

export function parseMappingJson(text: string): ColumnMapping[] {
  const parsed: unknown = JSON.parse(text);
  if (!Array.isArray(parsed)) {
    throw new Error("Invalid mapping JSON");
  }
  return parsed.map((item) => {
    const o = item as Record<string, unknown>;
    const transform = String(o.transform ?? "none");
    return {
      source: String(o.source ?? ""),
      target: String(o.target ?? ""),
      transform: VALID_TRANSFORMS.has(transform as ColumnMapping["transform"])
        ? (transform as ColumnMapping["transform"])
        : "none",
    };
  });
}

export function dedupeRows(rows: SheetRow[], key: string): SheetRow[] {
  if (!key) return rows;
  const seen = new Set<string>();
  return rows.filter((r) => {
    const v = String(r[key] ?? "");
    if (seen.has(v)) return false;
    seen.add(v);
    return true;
  });
}

export function exportCsv(rows: SheetRow[]): Blob {
  const ws = XLSX.utils.json_to_sheet(rows);
  const csv = XLSX.utils.sheet_to_csv(ws);
  return new Blob([csv], { type: "text/csv;charset=utf-8" });
}

export function exportXlsx(rows: SheetRow[]): Blob {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Data");
  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  return new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

export function exportMappingJson(mappings: ColumnMapping[]): Blob {
  return new Blob([JSON.stringify(mappings, null, 2)], {
    type: "application/json",
  });
}

export async function parseSheetFile(
  file: File | ArrayBuffer
): Promise<Record<string, string>[]> {
  const { rows } = await parseSpreadsheet(file);
  return rows.map((r) => {
    const o: Record<string, string> = {};
    for (const [k, v] of Object.entries(r)) {
      o[k] = v == null ? "" : String(v);
    }
    return o;
  });
}
