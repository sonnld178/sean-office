"use client";

import { useTranslations } from "next-intl";
import { Check, Copy, Plus, RotateCw, Trash2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { ReactBitsLoader } from "@/components/ReactBitsLoader";

interface ThumbnailPage {
  pageIndex: number;
  canvas: HTMLCanvasElement;
}

interface PdfPageThumbnailListProps {
  pages: ThumbnailPage[];
  loading: boolean;
  activePage: number;
  selectedPages: Set<number>;
  multiSelectEnabled: boolean;
  multiSelect: boolean;
  onMultiSelectChange: (value: boolean) => void;
  pageCount: number;
  busy?: boolean;
  onThumbClick: (index: number, e: React.MouseEvent) => void;
  onDuplicate: (pageIndex: number) => void;
  onRotate: (pageIndex: number) => void;
  onDelete: (pageIndex: number) => void;
  onInsertAfter: (afterIndex: number) => void;
}

function InsertPageButton({
  afterIndex,
  disabled,
  onInsertAfter,
  label,
}: {
  afterIndex: number;
  disabled?: boolean;
  onInsertAfter: (afterIndex: number) => void;
  label: string;
}) {
  return (
    <div className="flex justify-center py-1">
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            aria-label={label}
            onClick={() => onInsertAfter(afterIndex)}
            className="flex size-7 items-center justify-center rounded-full bg-primary/15 text-primary shadow-sm transition-colors hover:bg-primary hover:text-primary-foreground disabled:pointer-events-none disabled:opacity-40"
          >
            <Plus className="size-4" strokeWidth={2.5} />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">{label}</TooltipContent>
      </Tooltip>
    </div>
  );
}

function PageThumbnail({
  pageIndex,
  canvas,
  isActive,
  isSelected,
  canDelete,
  busy,
  onThumbClick,
  onDuplicate,
  onRotate,
  onDelete,
  labels,
}: {
  pageIndex: number;
  canvas: HTMLCanvasElement;
  isActive: boolean;
  isSelected: boolean;
  canDelete: boolean;
  busy?: boolean;
  onThumbClick: (index: number, e: React.MouseEvent) => void;
  onDuplicate: (pageIndex: number) => void;
  onRotate: (pageIndex: number) => void;
  onDelete: (pageIndex: number) => void;
  labels: {
    duplicate: string;
    rotate: string;
    delete: string;
  };
}) {
  const stop = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <div className="group/thumb relative">
      <button
        type="button"
        onClick={(e) => onThumbClick(pageIndex, e)}
        disabled={busy}
        className={cn(
          "relative w-full overflow-hidden rounded-md border bg-white transition-all hover:ring-2 hover:ring-primary/20",
          isSelected && !isActive && "ring-2 ring-primary/45",
          isActive && "ring-2 ring-primary",
          isSelected && isActive && "ring-offset-2 ring-offset-background"
        )}
      >
        {isSelected && (
          <span className="absolute right-1 top-1 z-10 flex size-4 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Check className="size-2.5" />
          </span>
        )}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={canvas.toDataURL()} alt="" className="block w-full" />
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center pb-2 opacity-0 transition-opacity group-hover/thumb:pointer-events-auto group-hover/thumb:opacity-100"
          onClick={stop}
        >
          <div className="pointer-events-auto flex items-center gap-0.5 rounded-lg border border-border/60 bg-background/95 px-1 py-0.5 shadow-md backdrop-blur-sm">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  disabled={busy}
                  aria-label={labels.duplicate}
                  onClick={(e) => {
                    stop(e);
                    onDuplicate(pageIndex);
                  }}
                  className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
                >
                  <Copy className="size-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent>{labels.duplicate}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  disabled={busy}
                  aria-label={labels.rotate}
                  onClick={(e) => {
                    stop(e);
                    onRotate(pageIndex);
                  }}
                  className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
                >
                  <RotateCw className="size-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent>{labels.rotate}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  disabled={busy || !canDelete}
                  aria-label={labels.delete}
                  onClick={(e) => {
                    stop(e);
                    onDelete(pageIndex);
                  }}
                  className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-40"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent>{labels.delete}</TooltipContent>
            </Tooltip>
          </div>
        </div>
      </button>
      <span className="block py-1 text-center text-[10px] text-muted-foreground">
        {pageIndex + 1}
      </span>
    </div>
  );
}

export function PdfPageThumbnailList({
  pages,
  loading,
  activePage,
  selectedPages,
  multiSelectEnabled,
  multiSelect,
  onMultiSelectChange,
  pageCount,
  busy,
  onThumbClick,
  onDuplicate,
  onRotate,
  onDelete,
  onInsertAfter,
}: PdfPageThumbnailListProps) {
  const t = useTranslations("pdf");

  if (loading) {
    return (
      <div className="flex min-h-[12rem] items-center justify-center p-4">
        <ReactBitsLoader size="sm" label={t("loadingPages")} />
      </div>
    );
  }

  const labels = {
    duplicate: t("duplicatePage"),
    rotate: t("rotatePage"),
    delete: t("deletePage"),
  };

  return (
    <>
      {multiSelectEnabled && (
        <label className="mb-2 flex cursor-pointer items-start gap-1.5 text-[10px] leading-tight text-muted-foreground">
          <Checkbox
            checked={multiSelect}
            onCheckedChange={(v) => onMultiSelectChange(v === true)}
            className="mt-0.5 size-3.5"
          />
          <span>{t("selectMultiple")}</span>
        </label>
      )}

      <InsertPageButton
        afterIndex={-1}
        disabled={busy}
        onInsertAfter={onInsertAfter}
        label={t("insertPage")}
      />

      {pages.map(({ pageIndex, canvas }, idx) => (
        <div key={pageIndex}>
          <PageThumbnail
            pageIndex={pageIndex}
            canvas={canvas}
            isActive={activePage === pageIndex}
            isSelected={selectedPages.has(pageIndex)}
            canDelete={pageCount > 1}
            busy={busy}
            onThumbClick={onThumbClick}
            onDuplicate={onDuplicate}
            onRotate={onRotate}
            onDelete={onDelete}
            labels={labels}
          />
          {idx < pages.length - 1 && (
            <InsertPageButton
              afterIndex={pageIndex}
              disabled={busy}
              onInsertAfter={onInsertAfter}
              label={t("insertPage")}
            />
          )}
        </div>
      ))}

      {pages.length > 0 && (
        <InsertPageButton
          afterIndex={pages[pages.length - 1]!.pageIndex}
          disabled={busy}
          onInsertAfter={onInsertAfter}
          label={t("insertPage")}
        />
      )}
    </>
  );
}
