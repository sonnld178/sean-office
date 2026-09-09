"use client";

import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import { FileText } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { ToolUploadScreen } from "@/components/tool/tool-upload-screen";
import { DocsWorkspace } from "@/components/docs/docs-workspace";

export default function WordPage() {
  const t = useTranslations("docs");
  const [docBuf, setDocBuf] = useState<ArrayBuffer | null>(null);
  const [fileName, setFileName] = useState("document.docx");
  const [templateSource, setTemplateSource] = useState<"sample" | "upload">("upload");

  const handleNewFile = useCallback(() => {
    setDocBuf(null);
    setFileName("document.docx");
    setTemplateSource("upload");
  }, []);

  const handleLoadSampleFile = useCallback((buf: ArrayBuffer, name: string) => {
    setDocBuf(buf.slice(0));
    setFileName(name);
  }, []);

  return (
    <AppShell contentWidth="wide">
      {!docBuf ? (
        <ToolUploadScreen
          title={t("title")}
          subtitle={t("subtitle")}
          label={t("dropDocx")}
          secondaryLabel={t("uploadDragHint")}
          icon={<FileText className="size-6" />}
          accept={{
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
              [".docx"],
          }}
          samples={[
            { href: "/samples/word-template.docx", label: "Template .docx", tryOnly: true },
            { href: "/samples/word-data.xlsx", label: "Data .xlsx", downloadOnly: true },
          ]}
          onLoadSample={async (href) => {
            const res = await fetch(href);
            if (!res.ok) throw new Error("Failed to load sample");
            const buffer = await res.arrayBuffer();
            setDocBuf(buffer);
            setFileName(href.split("/").pop() || "word-template.docx");
            setTemplateSource("sample");
          }}
          onFiles={async (items, { setProgress }) => {
            setDocBuf(items[0].buffer);
            setFileName(items[0].file.name || "document.docx");
            setTemplateSource("upload");
            setProgress(100);
          }}
        />
      ) : (
        <DocsWorkspace
          docBuf={docBuf}
          fileName={fileName}
          onNewFile={handleNewFile}
          onDocUpdate={setDocBuf}
          templateSource={templateSource}
          onLoadSampleFile={handleLoadSampleFile}
        />
      )}
    </AppShell>
  );
}
