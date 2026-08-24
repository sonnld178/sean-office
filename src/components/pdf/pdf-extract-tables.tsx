"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { ReactBitsLoader } from "@/components/ReactBitsLoader";
import { SparkHoverButton } from "@/components/SparkHoverButton";
import { Checkbox } from "@/components/ui/checkbox";
import { extractPdfToExcel } from "@/lib/pdf-tools";
import { detectPdfTables, type DetectedTable } from "@/lib/pdf-table-detector";
import { downloadSeanOfficeBlob } from "@/lib/download-names";
import { Loader2 } from "lucide-react";

interface PdfExtractTablesProps {
  pdfBuf: ArrayBuffer;
  fileName: string;
  compact?: boolean;
}

export function PdfExtractTables({
  pdfBuf,
  fileName,
  compact = false,
}: PdfExtractTablesProps) {
  const t = useTranslations("pdf");
  const [scanning, setScanning] = useState(true);
  const [tables, setTables] = useState<DetectedTable[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);

  const scan = useCallback(async () => {
    setScanning(true);
    setTables([]);
    setSelected(new Set());
    try {
      const found = await detectPdfTables(pdfBuf);
      setTables(found);
      setSelected(new Set(found.map((tbl) => tbl.id)));
    } finally {
      setScanning(false);
    }
  }, [pdfBuf]);

  useEffect(() => {
    void scan();
  }, [scan]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const runExport = async () => {
    const picked = tables.filter((tbl) => selected.has(tbl.id));
    if (!picked.length) return;
    setExporting(true);
    try {
      const out = await extractPdfToExcel(
        picked.map((tbl) => tbl.rows),
        picked.map((tbl) => tbl.id)
      );
      downloadSeanOfficeBlob(out, "pdf", fileName, "xlsx", "extract");
    } finally {
      setExporting(false);
    }
  };

  if (scanning) {
    return (
      <div className={compact ? "py-6" : "py-10"}>
        <ReactBitsLoader size={compact ? "sm" : "md"} label={t("scanTables")} />
        <p className="mt-3 text-center text-xs text-muted-foreground">
          {t("scanTables")}
        </p>
      </div>
    );
  }

  if (!tables.length) {
    return (
      <div className="space-y-3">
        <p className="text-xs text-muted-foreground">{t("extractHint")}</p>
        <div className="rounded-md border border-dashed px-3 py-6 text-center">
          <p className="text-sm text-muted-foreground">{t("noTablesFound")}</p>
        </div>
        <SparkHoverButton size="sm" disabled>
          {t("extractBtn")}
        </SparkHoverButton>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">{t("extractHint")}</p>
      <p className="text-xs font-medium">
        {t("tablesFoundCount", { count: tables.length })}
      </p>
      <p className="text-xs text-muted-foreground">{t("selectTables")}</p>
      <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
        {tables.map((tbl) => (
          <label
            key={tbl.id}
            className="flex cursor-pointer gap-2 rounded-md border p-2 hover:bg-muted/40"
          >
            <Checkbox
              checked={selected.has(tbl.id)}
              onCheckedChange={() => toggle(tbl.id)}
              className="mt-0.5"
            />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium">
                {tbl.id} · {t("page")} {tbl.pageIndex + 1} · {tbl.rowCount}×
                {tbl.colCount}
              </p>
              <p className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                {t("tablePreview")}
              </p>
              <div className="mt-1 overflow-x-auto">
                <table className="w-full border-collapse text-[10px]">
                  <tbody>
                    {tbl.rows.slice(0, 3).map((row, ri) => (
                      <tr key={ri}>
                        {row.map((cell, ci) => (
                          <td
                            key={ci}
                            className="border px-1 py-0.5 align-top text-muted-foreground"
                          >
                            {cell || "—"}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </label>
        ))}
      </div>
      <SparkHoverButton
        size="sm"
        disabled={exporting || selected.size === 0}
        onClick={() => void runExport()}
      >
        {exporting ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          t("extractBtn")
        )}
      </SparkHoverButton>
    </div>
  );
}
