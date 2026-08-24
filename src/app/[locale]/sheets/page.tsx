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
  const { setSheetsData, setSheetsMappings } = useAppStore();

  const handleNewFile = useCallback(() => {
    setLoaded(false);
    setFileName("");
    setSheetsData([], []);
    setSheetsMappings([]);
  }, [setSheetsData, setSheetsMappings]);

  return (
    <AppShell contentWidth="wide">
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
          onFiles={async (items, { setProgress }) => {
            setProgress(90);
            const { headers, rows } = await parseSpreadsheet(items[0].buffer);
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
