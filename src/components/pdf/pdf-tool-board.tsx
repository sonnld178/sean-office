"use client";

import { useTranslations } from "next-intl";
import { FeatureCard } from "@/components/board/feature-card";

export type PdfToolId =
  | "edit"
  | "merge"
  | "split"
  | "pages"
  | "compress"
  | "extract";

interface PdfToolBoardProps {
  onSelectTool: (tool: PdfToolId) => void;
}

export function PdfToolBoard({ onSelectTool }: PdfToolBoardProps) {
  const t = useTranslations("pdf");
  const tb = useTranslations("board");

  const tools: { id: PdfToolId; title: string; preview: string }[] = [
    { id: "edit", title: t("toolEdit"), preview: t("stamp.preview") },
    { id: "merge", title: t("toolMerge"), preview: t("mergeHint") },
    { id: "split", title: t("toolSplit"), preview: t("splitEveryPage") },
    { id: "pages", title: t("toolPages"), preview: t("rotateCw") },
    { id: "compress", title: t("toolCompress"), preview: t("compressHint") },
    { id: "extract", title: t("toolExtract"), preview: t("extractHint") },
  ];

  return (
    <>
      <p className="text-sm text-muted-foreground">{t("toolsHint")}</p>
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {tools.map(({ id, title, preview }) => (
          <FeatureCard
            key={id}
            title={title}
            category={tb("independentHint").split(".")[0]?.trim() ?? "PDF"}
            preview={preview}
            status="open"
            onOpen={() => onSelectTool(id)}
          />
        ))}
      </div>
    </>
  );
}
