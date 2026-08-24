import type { HrCandidate } from "@/store/app-store";
import { extractPdfText } from "./pdfjs-client";
import * as XLSX from "xlsx";

export const DEMO_CVS: Omit<HrCandidate, "status" | "hits">[] = [
  {
    id: "demo-1",
    name: "Alex Chen",
    email: "alex.chen@email.com",
    phone: "+61400111222",
    title: "Senior React Developer",
    yearsExp: "6",
    skills: "React, TypeScript, Next.js, Node.js, AWS",
    rawText:
      "Alex Chen. Senior React Developer with 6 years experience. Skills: React, TypeScript, Next.js, Node.js, AWS. alex.chen@email.com",
  },
  {
    id: "demo-2",
    name: "Maria Santos",
    email: "maria.s@email.com",
    phone: "+61400333444",
    title: "Product Designer",
    yearsExp: "4",
    skills: "Figma, UX research, Design systems, Prototyping",
    rawText:
      "Maria Santos. Product Designer, 4 years. Figma, UX research, design systems. maria.s@email.com",
  },
  {
    id: "demo-3",
    name: "James Wilson",
    email: "j.wilson@email.com",
    phone: "+61400555666",
    title: "Data Analyst",
    yearsExp: "3",
    skills: "Python, SQL, Excel, Power BI, statistics",
    rawText:
      "James Wilson. Data Analyst 3 years. Python, SQL, Excel, Power BI. j.wilson@email.com",
  },
];

export function scoreCandidate(
  text: string,
  keywords: string[],
  mustHave: string[]
): { status: HrCandidate["status"]; hits: string[] } {
  const lower = text.toLowerCase();
  const hits = keywords.filter((k) => k && lower.includes(k.toLowerCase()));
  const mustHits = mustHave.filter(
    (m) => m && lower.includes(m.toLowerCase())
  );
  const mustMiss = mustHave.filter(
    (m) => m && !lower.includes(m.toLowerCase())
  );

  if (mustHave.length > 0 && mustMiss.length > 0) {
    return { status: "no", hits: [...hits, ...mustHits] };
  }
  if (hits.length >= Math.max(2, keywords.length * 0.6)) {
    return { status: "fit", hits };
  }
  if (hits.length >= 1) {
    return { status: "maybe", hits };
  }
  return { status: "no", hits };
}

export async function parseCvPdf(
  file: File,
  buffer?: ArrayBuffer
): Promise<Partial<HrCandidate>> {
  const buf = buffer ?? (await file.arrayBuffer());
  const text = await extractPdfText(buf);
  const email = text.match(/[\w.-]+@[\w.-]+\.\w+/)?.[0] ?? "";
  const phone = text.match(/\+?\d[\d\s-]{8,}/)?.[0]?.trim() ?? "";
  const lines = text.split("\n").filter(Boolean);
  const name = lines[0]?.slice(0, 60) ?? file.name.replace(".pdf", "");
  return {
    id: crypto.randomUUID(),
    name,
    email,
    phone,
    title: lines[1]?.slice(0, 80) ?? "",
    yearsExp: text.match(/(\d+)\+?\s*years?/i)?.[1] ?? "",
    skills: text.match(/skills?[:\s]+([^\n]+)/i)?.[1]?.slice(0, 120) ?? "",
    rawText: text,
  };
}

export function applyKeywordScoring(
  candidates: Partial<HrCandidate>[],
  keywords: string,
  mustHave: string
): HrCandidate[] {
  const kw = keywords
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const must = mustHave
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  return candidates.map((c) => {
    const text = c.rawText ?? `${c.name} ${c.skills} ${c.title}`;
    const { status, hits } = scoreCandidate(text, kw, must);
    return {
      id: c.id ?? crypto.randomUUID(),
      name: c.name ?? "",
      email: c.email ?? "",
      phone: c.phone ?? "",
      title: c.title ?? "",
      yearsExp: c.yearsExp ?? "",
      skills: c.skills ?? "",
      status,
      hits,
      selected: status === "fit",
    };
  });
}

export function exportCandidatesXlsx(candidates: HrCandidate[]): Blob {
  const rows = candidates.map((c) => ({
    Name: c.name,
    Email: c.email,
    Phone: c.phone,
    Title: c.title,
    Years: c.yearsExp,
    Skills: c.skills,
    Status: c.status,
    Hits: c.hits.join("; "),
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Candidates");
  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  return new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}
