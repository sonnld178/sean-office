"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { Download } from "lucide-react";
import { SparkHoverButton } from "@/components/SparkHoverButton";
import { ToolPanelHeader } from "@/components/tool/tool-workspace-shell";
import { scanDocxPlaceholders } from "@/lib/docs-processor";
import { downloadSeanOfficeBlob } from "@/lib/download-names";

interface DocTemplateEditorProps {
  docBuf: ArrayBuffer;
  fileName: string;
  onClose: () => void;
}

export function DocTemplateEditor({
  docBuf,
  fileName,
  onClose,
}: DocTemplateEditorProps) {
  const t = useTranslations("docs.template");

  const placeholders = useMemo(
    () => scanDocxPlaceholders(docBuf),
    [docBuf]
  );

  const handleDownload = () => {
    const blob = new Blob([docBuf.slice(0)], {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    downloadSeanOfficeBlob(blob, "word", fileName, "docx", "template");
  };

  return (
    <>
      <ToolPanelHeader title={t("title")} onClose={onClose} />
      <p className="mb-3 text-xs text-muted-foreground">{t.raw("howTo")}</p>

      {placeholders.length > 0 ? (
        <div className="mb-3">
          <p className="mb-1 text-xs font-medium">{t("existingPlaceholders")}</p>
          <div className="flex flex-wrap gap-1">
            {placeholders.map((name) => (
              <span
                key={name}
                className="rounded bg-yellow-100 px-1.5 py-0.5 text-xs dark:bg-yellow-500/20"
              >
                {`{{${name}}}`}
              </span>
            ))}
          </div>
        </div>
      ) : (
        <p className="mb-3 text-xs text-muted-foreground">{t("noPlaceholdersYet")}</p>
      )}

      <SparkHoverButton size="sm" onClick={handleDownload}>
        <Download className="mr-1.5 size-4" />
        {t("download")}
      </SparkHoverButton>
    </>
  );
}
