"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Braces, Undo2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { DocxPreviewRenderer } from "@/components/docs/docx-preview-renderer";
import { type DocxParagraph, type ParagraphEdit } from "@/lib/docs-processor";

interface TextSelection {
  index: number;
  start: number;
  end: number;
  selectedText: string;
}

interface DocTemplatePreviewProps {
  buffer: ArrayBuffer;
  paragraphs: DocxParagraph[];
  onInsert: (edit: ParagraphEdit) => void;
  onUndo: () => void;
  canUndo: boolean;
  zoom?: number;
  className?: string;
}

function normalizeText(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function findSelectionInParagraphs(
  paragraphs: DocxParagraph[],
  selectedText: string
): TextSelection | null {
  const needle = selectedText.trim();
  if (!needle) return null;

  for (const p of paragraphs) {
    const idx = p.text.indexOf(needle);
    if (idx !== -1) {
      return {
        index: p.index,
        start: idx,
        end: idx + needle.length,
        selectedText: needle,
      };
    }
  }

  const normalizedNeedle = normalizeText(needle);
  if (!normalizedNeedle) return null;

  for (const p of paragraphs) {
    const normalizedText = normalizeText(p.text);
    if (!normalizedText.includes(normalizedNeedle)) continue;

    const rawIdx = p.text.indexOf(needle);
    if (rawIdx !== -1) {
      return {
        index: p.index,
        start: rawIdx,
        end: rawIdx + needle.length,
        selectedText: needle,
      };
    }
  }

  return null;
}

export function DocTemplatePreview({
  buffer,
  paragraphs,
  onInsert,
  onUndo,
  canUndo,
  zoom = 1,
  className,
}: DocTemplatePreviewProps) {
  const t = useTranslations("docs.template");
  const previewRef = useRef<HTMLDivElement>(null);
  const [placeholderName, setPlaceholderName] = useState("");
  const [selection, setSelection] = useState<TextSelection | null>(null);

  const captureSelection = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !previewRef.current) {
      setSelection(null);
      return;
    }

    const range = sel.getRangeAt(0);
    if (!previewRef.current.contains(range.commonAncestorContainer)) {
      setSelection(null);
      return;
    }

    const selectedText = sel.toString();
    const match = findSelectionInParagraphs(paragraphs, selectedText);
    setSelection(match);
  }, [paragraphs]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key !== "z" || e.shiftKey) return;

      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;
      if (!canUndo) return;

      e.preventDefault();
      onUndo();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [canUndo, onUndo]);

  const submitEdit = (edit: ParagraphEdit) => {
    onInsert(edit);
    setPlaceholderName("");
    setSelection(null);
    window.getSelection()?.removeAllRanges();
  };

  const insertPlaceholder = () => {
    const name = placeholderName.trim();
    if (!name) return;

    const token = `{{${name}}}`;

    if (selection) {
      submitEdit({
        index: selection.index,
        start: selection.start,
        end: selection.end,
        replacement: token,
      });
    } else {
      const lastParagraph = paragraphs[paragraphs.length - 1];
      if (!lastParagraph) return;
      submitEdit({
        index: lastParagraph.index,
        start: lastParagraph.text.length,
        end: lastParagraph.text.length,
        replacement: token,
      });
    }
  };

  const convertSelectionToPlaceholder = () => {
    const name = placeholderName.trim();
    if (!name || !selection) return;

    submitEdit({
      index: selection.index,
      start: selection.start,
      end: selection.end,
      replacement: `{{${name}}}`,
    });
  };

  const canConvertSelection =
    selection != null && placeholderName.trim() !== "";

  const canInsert = placeholderName.trim() !== "";

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col", className)}>
      <div className="sticky top-0 z-10 border-b border-border bg-background/95 px-4 py-2 backdrop-blur-sm">
        <div className="mx-auto flex max-w-[210mm] flex-wrap items-end gap-2">
          <div className="min-w-[140px] flex-1">
            <label className="mb-1 block text-xs font-medium">
              {t("insertPlaceholder")}
            </label>
            <Input
              value={placeholderName}
              onChange={(e) => setPlaceholderName(e.target.value)}
              placeholder={t("placeholderName")}
              className="h-8 text-sm"
              onKeyDown={(e) => {
                if (e.key === "Enter") insertPlaceholder();
              }}
            />
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="shrink-0"
            disabled={!canInsert}
            onClick={insertPlaceholder}
          >
            <Braces className="mr-1 size-3.5" />
            {t("insert")}
          </Button>
          {canConvertSelection && (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="shrink-0"
              onClick={convertSelectionToPlaceholder}
            >
              {t("convertSelection")}
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="shrink-0"
            disabled={!canUndo}
            onClick={onUndo}
            title={t("undoHint")}
          >
            <Undo2 className="mr-1 size-3.5" />
            {t("undo")}
          </Button>
        </div>
        <p className="mx-auto mt-1 max-w-[210mm] text-[10px] text-muted-foreground">
          {selection
            ? t("selectionFound", { text: selection.selectedText })
            : t("previewHint")}
          {canUndo ? ` · ${t("undoHint")}` : ""}
        </p>
      </div>

      <div
        ref={previewRef}
        className="flex-1 select-text"
        onMouseUp={captureSelection}
        onKeyUp={captureSelection}
      >
        <DocxPreviewRenderer buffer={buffer} zoom={zoom} />
      </div>
    </div>
  );
}
