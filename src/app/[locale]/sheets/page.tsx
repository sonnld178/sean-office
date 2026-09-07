"use client";

import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import { FileSpreadsheet } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { ToolUploadScreen } from "@/components/tool/tool-upload-screen";
import { SheetsWorkspace } from "@/components/sheets/sheets-workspace";
import { parseSpreadsheet } from "@/lib/sheets-processor";
import { useAppStore } from "@/store/app-store";

export default function SheetsPage() {
  const t = useTranslations("sheets");
  const [fileName, setFileName] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [limitWarning, setLimitWarning] = useState<string | null>(null);
  const [limitInfo, setLimitInfo] = useState<string | null>(null);
  const { setSheetsData, setSheetsMappings } = useAppStore();

  const handleNewFile = useCallback(() => {
    setLoaded(false);
    setFileName("");
    setLimitWarning(null);
    setLimitInfo(null);
    setSheetsData([], []);
    setSheetsMappings([]);
  }, [setSheetsData, setSheetsMappings]);

  return (
    <AppShell contentWidth="wide">
      {limitWarning ? (
        <div
          role="alert"
          className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200"
        >
          <p className="font-medium">{limitWarning}</p>
          {limitInfo ? <p className="mt-1 text-xs opacity-80">{limitInfo}</p> : null}
        </div>
      ) : null}
      {!loaded ? (
        <ToolUploadScreen
          title={t("title")}
          subtitle={t("upload.howTo")}
          label={t("dropzone")}
          secondaryLabel={t("uploadDragHint")}
          icon={<FileSpreadsheet className="size-6" />}
          accept={{
            "text/csv": [".csv"],
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
              [".xlsx"],
            "application/vnd.ms-excel": [".xls"],
          }}
          samples={[{ href: "/samples/sheets-messy.xlsx", label: "Sample XLSX" }]}
          onLoadSample={async (href) => {
            const res = await fetch(href);
            if (!res.ok) throw new Error("Failed to load sample");
            const buffer = await res.arrayBuffer();
            let { headers, rows } = await parseSpreadsheet(buffer);
            if (rows.length > 500) {
              const originalN = rows.length;
              rows = rows.slice(0, 500);
              setLimitWarning(t("rowLimitExceeded", { n: originalN }));
              setLimitInfo(t("rowLimitInfo", { n: originalN }));
            } else {
              setLimitWarning(null);
              setLimitInfo(null);
            }
            setSheetsData(headers, rows);
            setSheetsMappings(
              headers.map((h) => ({
                source: h,
                target: h,
                transform: "none" as const,
              }))
            );
            setFileName(href.split("/").pop() || "sheets-messy.xlsx");
            setLoaded(true);
          }}
          onFiles={async (items, { setProgress }) => {
            setProgress(90);
            let { headers, rows } = await parseSpreadsheet(items[0].buffer);
            if (rows.length > 500) {
              const originalN = rows.length;
              rows = rows.slice(0, 500);
              setLimitWarning(t("rowLimitExceeded", { n: originalN }));
              setLimitInfo(t("rowLimitInfo", { n: originalN }));
            } else {
              setLimitWarning(null);
              setLimitInfo(null);
            }
            setSheetsData(headers, rows);
            setSheetsMappings(
              headers.map((h) => ({
                source: h,
                target: h,
                transform: "none" as const,
              }))
            );
            setFileName(items[0].file.name || "spreadsheet.csv");
            setLoaded(true);
            setProgress(100);
          }}
        />
      ) : (
        <SheetsWorkspace fileName={fileName} onNewFile={handleNewFile} />
      )}
    </AppShell>
  );
}
