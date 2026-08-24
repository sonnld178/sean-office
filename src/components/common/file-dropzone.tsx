"use client";

import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { useTranslations } from "next-intl";
import { Upload } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import {
  readFilesWithProgress,
  uploadFilesWithProgress,
  type LoadedFile,
} from "@/lib/file-upload";
import { useAppStore } from "@/store/app-store";

export type UploadHelpers = {
  setProgress: (percent: number, message?: string) => void;
};

interface FileDropzoneProps {
  accept?: Record<string, string[]>;
  multiple?: boolean;
  onFiles: (
    items: LoadedFile[],
    helpers: UploadHelpers
  ) => void | Promise<void>;
  label: string;
  secondaryLabel?: string;
  className?: string;
  disabled?: boolean;
  size?: "default" | "large" | "hero";
}

export function FileDropzone({
  accept,
  multiple = false,
  onFiles,
  label,
  secondaryLabel,
  className,
  disabled = false,
  size = "default",
}: FileDropzoneProps) {
  const t = useTranslations("upload");
  const mode = useAppStore((s) => s.mode);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  const reportProgress = useCallback((percent: number, message?: string) => {
    setProgress(percent);
    if (message) setStatus(message);
  }, []);

  const resetProgress = useCallback(() => {
    setTimeout(() => {
      setProgress(null);
      setStatus("");
    }, 900);
  }, []);

  const handleDrop = useCallback(
    async (accepted: File[]) => {
      if (!accepted.length || busy) return;

      setBusy(true);
      const helpers: UploadHelpers = { setProgress: reportProgress };
      reportProgress(0, t("starting"));

      try {
        let items: LoadedFile[];

        if (mode === "server") {
          reportProgress(0, t("uploading"));
          await uploadFilesWithProgress(accepted, (p, msg) => {
            reportProgress(Math.round(p * 0.85), msg ?? t("uploading"));
          });
          reportProgress(85, t("reading"));
          items = await readFilesWithProgress(accepted, (p, msg) => {
            reportProgress(85 + Math.round(p * 0.1), msg);
          });
        } else {
          items = await readFilesWithProgress(accepted, (p, msg) => {
            reportProgress(Math.round(p * 0.85), msg ?? t("reading"));
          });
        }

        reportProgress(90, t("processing"));
        await onFiles(items, helpers);
        reportProgress(100, t("done"));
      } catch {
        reportProgress(0, t("error"));
      } finally {
        setBusy(false);
        resetProgress();
      }
    },
    [busy, mode, onFiles, reportProgress, resetProgress, t]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (files) => void handleDrop(files),
    accept,
    multiple,
    disabled: disabled || busy,
    onDragEnter: () => setDragging(true),
    onDragLeave: () => setDragging(false),
  });

  const showProgress = progress !== null;

  const isHero = size === "hero";

  return (
    <div className={cn("space-y-2", isHero && "flex h-full min-h-0 flex-1 flex-col", className)}>
      <div
        {...getRootProps()}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-muted/30 px-4 py-8 text-center transition-all hover:border-primary/50 hover:bg-muted/50",
          size === "large" &&
            "min-h-[420px] gap-4 rounded-2xl border-primary/20 bg-primary/5 py-16",
          isHero &&
            "relative min-h-[min(520px,calc(100dvh-14rem))] flex-1 gap-5 overflow-hidden rounded-2xl border-primary/30 bg-[radial-gradient(circle_at_1px_1px,rgba(0,120,212,0.07)_1px,transparent_0)] [background-size:24px_24px] px-8 py-12 shadow-sm hover:border-primary/60 hover:bg-primary/[0.04] hover:shadow-md",
          size === "default" && "min-h-[100px] rounded-lg",
          (isDragActive || dragging) &&
            (isHero
              ? "scale-[1.01] border-primary bg-primary/10 shadow-lg ring-2 ring-primary/20"
              : "border-primary bg-primary/5"),
          (disabled || busy) && "pointer-events-none opacity-60"
        )}
      >
        <input {...getInputProps()} />
        <div
          className={cn(
            "flex items-center justify-center rounded-2xl bg-primary/10 text-primary transition-transform",
            isHero ? "size-20" : size === "large" ? "size-16" : "size-10"
          )}
        >
          <Upload className={cn(isHero ? "size-9" : size === "large" ? "size-8" : "size-5")} />
        </div>
        <div className="space-y-2">
          <p
            className={cn(
              "text-foreground",
              isHero ? "text-xl font-semibold tracking-tight" : size === "large" ? "text-base font-medium" : "text-sm text-muted-foreground"
            )}
          >
            {busy ? t("pleaseWait") : label}
          </p>
          {secondaryLabel && !busy && (
            <p className="text-sm text-muted-foreground">{secondaryLabel}</p>
          )}
        </div>
      </div>

      {showProgress && (
        <div className="space-y-1.5 rounded-lg border border-border bg-card px-3 py-2.5">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="truncate text-muted-foreground">
              {status || t("uploading")}
            </span>
            <span className="shrink-0 font-medium tabular-nums text-primary">
              {progress}%
            </span>
          </div>
          <Progress value={progress ?? 0} className="h-2" />
        </div>
      )}
    </div>
  );
}
