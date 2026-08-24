"use client";

import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import { FileType } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { ToolUploadScreen } from "@/components/tool/tool-upload-screen";
import { PdfWorkspace } from "@/components/pdf/pdf-workspace";

export default function PdfPage() {
  const t = useTranslations("pdf");
  const [pdfBuf, setPdfBuf] = useState<ArrayBuffer | null>(null);
  const [fileName, setFileName] = useState("document.pdf");

  const handleClose = useCallback(() => {
    setPdfBuf(null);
    setFileName("document.pdf");
  }, []);

  const handlePdfUpdate = useCallback((buf: ArrayBuffer, name?: string) => {
    setPdfBuf(buf.slice(0));
    if (name) setFileName(name);
  }, []);

  return (
    <AppShell contentWidth="wide">
      {!pdfBuf ? (
        <ToolUploadScreen
          title={t("title")}
          subtitle={t("subtitle")}
          label={t("uploadHint")}
          secondaryLabel={t("uploadDragHint")}
          icon={<FileType className="size-6" />}
          accept={{ "application/pdf": [".pdf"] }}
          onFiles={async (items, { setProgress }) => {
            setPdfBuf(items[0].buffer);
            setFileName(items[0].file.name || "document.pdf");
            setProgress(100);
          }}
        />
      ) : (
        <PdfWorkspace
          pdfBuf={pdfBuf}
          fileName={fileName}
          onClose={handleClose}
          onPdfUpdate={handlePdfUpdate}
        />
      )}
    </AppShell>
  );
}
