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

// ---------------------------------------------------------------------------
// Review: header-first rule detection + checks
//
// Priority: header keywords (VI+EN) decide the rule; content profiling is only
// a fallback for unknown headers and yields low-confidence rules that the user
// must confirm. Headers like passcode/OTP never trigger phone rules even when
// the content is all digits.
// ---------------------------------------------------------------------------

export type ReviewRuleType = "email" | "phone" | "date" | "empty" | "duplicate";
export type ReviewConfidence = "high" | "low";
export type ReviewSeverity = "warning" | "info";

export interface ReviewRule {
  id: string;
  type: ReviewRuleType;
  column: string;
  label: string;
  confidence: ReviewConfidence;
  source: "header" | "content";
  enabled: boolean;
  /** For type-wide rules (id === type), the list of columns this type applies to */
  columns?: string[];
}

export interface ReviewIssue {
  rowIndex: number;
  column: string;
  ruleId: string;
  severity: ReviewSeverity;
  message: string;
  value: string | number | null;
}

function normalizeHeader(h: string): string {
  return h
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const HEADER_KEYWORDS: Record<"email" | "phone" | "date", string[]> = {
  email: ["email", "e-mail", "e mail", "mail", "thu dien tu"],
  phone: ["phone", "sdt", "sdt", "mobile", "tel", "dien thoai", "so dien thoai", "phone number"],
  date: ["date", "ngay", "dob", "birthday", "ngay sinh", "sinh"],
};

// Headers that describe secrets/codes: never infer phone (or any content)
// rules from them, even when every value is numeric. e.g. passcode columns.
const SECRET_HEADER_KEYWORDS = ["pass", "password", "mat khau", "otp", "pin", "code", "ma ", "ma_"];

const ID_LIKE_KEYWORDS = ["id", "ma", "code", "username", "email", "phone", "sdt", "cccd", "cmnd"];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function headerMatches(norm: string, keywords: string[]): boolean {
  return keywords.some((k) => norm === k || norm.includes(k));
}

function isSecretHeader(norm: string): boolean {
  return headerMatches(norm, SECRET_HEADER_KEYWORDS);
}

function looksLikeEmail(v: string): boolean {
  return EMAIL_RE.test(v.trim());
}

export function validateEmailDetail(value: string): { valid: boolean; reason: string } {
  const s = String(value).trim();
  if (s === "") return { valid: false, reason: "empty" };
  if (/\s/.test(s)) return { valid: false, reason: "contains spaces" };
  const atCount = (s.match(/@/g) || []).length;
  if (atCount === 0) return { valid: false, reason: "missing @" };
  if (atCount > 1) return { valid: false, reason: "multiple @" };
  const [local, domain] = s.split("@");
  if (!local) return { valid: false, reason: "missing local part" };
  if (!domain) return { valid: false, reason: "missing domain" };
  if (!domain.includes(".")) return { valid: false, reason: "missing dot in domain" };
  if (!EMAIL_RE.test(s)) return { valid: false, reason: "missing dot in domain" };
  return { valid: true, reason: "valid" };
}

export function validatePhoneDetail(value: string): { valid: boolean; reason: string } {
  const trimmed = String(value).trim();
  if (trimmed === "") return { valid: false, reason: "empty" };
  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (/[a-zA-Z]/.test(ch)) {
      return { valid: false, reason: "contains letters" };
    }
    const isDigit = ch >= "0" && ch <= "9";
    const isAllowed = isDigit || ch === "-" || ch === "(" || ch === ")" || ch === "." || ch === " " || ch === "+";
    if (!isAllowed) {
      return { valid: false, reason: `contains forbidden character "${ch}"` };
    }
    if (ch === "+") {
      if (i !== 0) {
        const before = trimmed.slice(0, i);
        if (!/^[\(\s]*$/.test(before)) {
          return { valid: false, reason: `contains forbidden character "${ch}"` };
        }
      }
    }
  }
  const digits = trimmed.replace(/\D/g, "");
  const count = digits.length;
  if (count < 7) return { valid: false, reason: `too short (${count} digits)` };
  if (count > 15) return { valid: false, reason: `too long (${count} digits)` };
  return { valid: true, reason: "valid" };
}

export function phoneDigits(v: string): string | null {
  const s = String(v).trim().replace(/\D/g, "");
  return s || null;
}

export function looksLikePhone(v: string): boolean {
  return validatePhoneDetail(v).valid;
}

function looksLikeDate(v: string): boolean {
  const s = v.trim();
  if (!s || /^\d+$/.test(s)) return false; // bare numbers are not dates
  return !isNaN(new Date(s).getTime());
}

export function isValidEmail(v: string): boolean {
  return validateEmailDetail(v).valid;
}

export function isValidPhone(v: string): boolean {
  return validatePhoneDetail(v).valid;
}

export function isValidDateValue(v: string): boolean {
  return looksLikeDate(v);
}

export function isEmptyValue(v: string | number | null | undefined): boolean {
  return v == null || String(v).trim() === "";
}

export interface DetectedReviewRules {
  rules: ReviewRule[];
  autoRun: boolean;
}

export function detectReviewRules(
  headers: string[],
  rows: SheetRow[],
  sampleSize = 200
): DetectedReviewRules {
  // Type-wide: one rule per type covering all matching columns (gọn cho UI).
  // We still need per-column stats to decide which columns belong to each type.
  const sample = rows.slice(0, sampleSize);

  const profile = (column: string) => {
    let total = 0;
    let email = 0;
    let phone = 0;
    let date = 0;
    for (const row of sample) {
      const raw = row[column];
      if (isEmptyValue(raw)) continue;
      const s = String(raw);
      total++;
      if (looksLikeEmail(s)) email++;
      else if (looksLikePhone(s)) phone++;
      if (looksLikeDate(s)) date++;
    }
    const fillRate =
      sample.length > 0
        ? sample.filter((r) => !isEmptyValue(r[column])).length / sample.length
        : 0;
    return {
      total,
      fillRate,
      emailRatio: total ? email / total : 0,
      phoneRatio: total ? phone / total : 0,
      dateRatio: total ? date / total : 0,
    };
  };

  type PerType = { columns: string[]; hasHigh: boolean; hasHeader: boolean };
  const perType = new Map<ReviewRuleType, PerType>();
  const ensure = (t: ReviewRuleType) => {
    if (!perType.has(t)) perType.set(t, { columns: [], hasHigh: false, hasHeader: false });
    return perType.get(t)!;
  };

  for (const column of headers) {
    const norm = normalizeHeader(column);
    const secret = isSecretHeader(norm);
    const stats = profile(column);

    const push = (
      type: ReviewRuleType,
      confidence: ReviewConfidence,
      source: "header" | "content",
      label: string,
      enabled: boolean
    ) => {
      rules.push({
        id: `${type}:${column}`,
        type,
        column,
        label,
        confidence,
        source,
        enabled,
      });
    };

    // 1) Header decides the type (high confidence). Secret headers opt out.
    const emailByHeader = headerMatches(norm, HEADER_KEYWORDS.email);
    const phoneByHeader =
      !secret && headerMatches(norm, HEADER_KEYWORDS.phone);
    const dateByHeader = headerMatches(norm, HEADER_KEYWORDS.date);

    // type-wide collectors
    const add = (type: ReviewRuleType, high: boolean, header: boolean) => {
      const e = ensure(type);
      if (!e.columns.includes(column)) e.columns.push(column);
      if (high) e.hasHigh = true;
      if (header) e.hasHeader = true;
    };

    if (emailByHeader) add("email", true, true);
    else if (!secret && stats.total >= 3 && stats.emailRatio >= 0.7) add("email", false, false);

    if (phoneByHeader) add("phone", true, true);
    else if (!secret && stats.total >= 3 && stats.phoneRatio >= 0.7) add("phone", false, false);

    if (dateByHeader) add("date", true, true);
    else if (!secret && stats.total >= 3 && stats.dateRatio >= 0.7) add("date", false, false);

    if (stats.fillRate >= 0.3) {
      const high = stats.fillRate >= 0.8;
      const e = ensure("empty");
      if (!e.columns.includes(column)) e.columns.push(column);
      if (high) e.hasHigh = true;
      if (high) e.hasHeader = true;
    }

    if (emailByHeader || phoneByHeader || headerMatches(norm, ID_LIKE_KEYWORDS)) {
      const high = emailByHeader || phoneByHeader;
      const e = ensure("duplicate");
      if (!e.columns.includes(column)) e.columns.push(column);
      if (high) e.hasHigh = true;
      if (high) e.hasHeader = true;
    }
  }

  const TYPE_LABEL: Record<ReviewRuleType, string> = {
    email: "Invalid email",
    phone: "Invalid phone number",
    date: "Invalid date",
    empty: "Missing value",
    duplicate: "Duplicate value",
  };
  const rules: ReviewRule[] = [];
  for (const [type, info] of perType) {
    const confidence: ReviewConfidence = info.hasHigh ? "high" : "low";
    const source = info.hasHeader ? "header" : "content";
    const enabled = info.hasHigh;
    rules.push({
      id: type,
      type,
      column: type,
      label: TYPE_LABEL[type],
      confidence,
      source,
      enabled,
      columns: info.columns,
    });
  }

  return { rules, autoRun: rules.some((r) => r.enabled) };
}

const MAX_ISSUES = 500;

export function runReviewChecks(
  rows: SheetRow[],
  rules: ReviewRule[]
): ReviewIssue[] {
  const issues: ReviewIssue[] = [];
  const seenByRule = new Map<string, Set<string>>();

  // duplicate needs per-column seen sets for type-wide rules
  const seenByRuleCol = new Map<string, Set<string>>();
  for (const rule of rules) {
    if (!rule.enabled || rule.type !== "duplicate") continue;
    const cols = (rule.columns ?? [rule.column]) as string[];
    for (const col of cols) seenByRuleCol.set(`${rule.id}:${col}`, new Set());
  }

  rows.forEach((row, rowIndex) => {
    for (const rule of rules) {
      if (!rule.enabled || issues.length >= MAX_ISSUES) continue;
      const cols = (rule.columns ?? [rule.column]) as string[];
      for (const col of cols) {
        if (issues.length >= MAX_ISSUES) break;
        const raw = row[col] ?? null;
        const empty = isEmptyValue(raw);
        const s = empty ? "" : String(raw);

        switch (rule.type) {
          case "empty":
            if (empty) {
              issues.push({
                rowIndex,
                column: col,
                ruleId: rule.id,
                severity: "info",
                message: "Missing value",
                value: raw,
              });
            }
            break;
          case "email":
            if (!empty && !isValidEmail(s)) {
              const detail = validateEmailDetail(s);
              issues.push({
                rowIndex,
                column: col,
                ruleId: rule.id,
                severity: "warning",
                message: `Email ${detail.reason}: ${s.slice(0, 40)}`,
                value: raw,
              });
            }
            break;
          case "phone":
            if (!empty && !isValidPhone(s)) {
              const detail = validatePhoneDetail(s);
              issues.push({
                rowIndex,
                column: col,
                ruleId: rule.id,
                severity: "warning",
                message: `Phone ${detail.reason}: ${s.slice(0, 40)}`,
                value: raw,
              });
            }
            break;
          case "date":
            if (!empty && !isValidDateValue(s)) {
              issues.push({
                rowIndex,
                column: col,
                ruleId: rule.id,
                severity: "warning",
                message: `Invalid date: ${s.slice(0, 60)}`,
                value: raw,
              });
            }
            break;
          case "duplicate": {
            if (empty) break;
            const seen = seenByRuleCol.get(`${rule.id}:${col}`);
            if (!seen) break;
            const key = s.trim().toLowerCase();
            if (seen.has(key)) {
              issues.push({
                rowIndex,
                column: col,
                ruleId: rule.id,
                severity: "warning",
                message: `Duplicate value: ${s.slice(0, 60)}`,
                value: raw,
              });
            } else {
              seen.add(key);
            }
            break;
          }
        }
      }
    }
    if (issues.length >= MAX_ISSUES) return;
  });

  return issues;
}

export function countIssuesByRule(issues: ReviewIssue[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const i of issues) counts[i.ruleId] = (counts[i.ruleId] ?? 0) + 1;
  return counts;
}

export function countIssuesByRuleAndColumn(
  issues: ReviewIssue[]
): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {};
  for (const i of issues) {
    (out[i.ruleId] ??= {})[i.column] = ((out[i.ruleId]?.[i.column] ?? 0) + 1);
  }
  return out;
}

export interface DeterministicFix {
  rowIndex: number;
  column: string;
  action: "set";
  newValue: string;
  reason: string;
}

const MAX_FIXES = 200;

export function deterministicFixes(
  rows: SheetRow[],
  issues: ReviewIssue[],
  rules: ReviewRule[]
): DeterministicFix[] {
  const enabledById = new Map(
    rules.filter((r) => r.enabled).map((r) => [r.id, r] as const)
  );
  const fixes: DeterministicFix[] = [];
  for (const issue of issues) {
    if (fixes.length >= MAX_FIXES) break;
    const rule = enabledById.get(issue.ruleId);
    if (!rule) continue;
    if (rule.type === "empty" || rule.type === "duplicate") continue;
    const raw =
      issue.value ?? rows[issue.rowIndex]?.[issue.column] ?? null;
    if (raw == null) continue;
    const original = String(raw);

    if (rule.type === "email") {
      const normalized = original.trim().toLowerCase();
      if (normalized !== original && isValidEmail(normalized)) {
        fixes.push({
          rowIndex: issue.rowIndex,
          column: issue.column,
          action: "set",
          newValue: normalized,
          reason: "Chuẩn hóa email (thường + trim)",
        });
      }
    } else if (rule.type === "phone") {
      let d = original.replace(/\D/g, "");
      if (/^84\d{9}$/.test(d)) d = "0" + d.slice(-9);
      if (d !== original && isValidPhone(d)) {
        fixes.push({
          rowIndex: issue.rowIndex,
          column: issue.column,
          action: "set",
          newValue: d,
          reason: "Chuẩn hóa SĐT",
        });
      }
    } else if (rule.type === "date") {
      if (!isValidDateValue(original)) continue;
      const parsed = new Date(original);
      if (isNaN(parsed.getTime())) continue;
      const iso = parsed.toISOString().slice(0, 10);
      if (iso !== original) {
        fixes.push({
          rowIndex: issue.rowIndex,
          column: issue.column,
          action: "set",
          newValue: iso,
          reason: "Chuẩn hóa ngày YYYY-MM-DD",
        });
      }
    }
  }
  return fixes;
}

/** @deprecated Use detectReviewRules + runReviewChecks instead. */
export function validateRows(rows: SheetRow[]): string[] {
  if (!rows.length) return [];
  const headers = Object.keys(rows[0]);
  const { rules } = detectReviewRules(headers, rows);
  return runReviewChecks(rows, rules)
    .slice(0, 20)
    .map((i) => `Row ${i.rowIndex + 1} [${i.column}]: ${i.message}`);
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
