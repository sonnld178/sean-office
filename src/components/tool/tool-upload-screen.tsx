"use client";

import type { ReactNode } from "react";
import { FileDropzone } from "@/components/common/file-dropzone";
import type { LoadedFile } from "@/lib/file-upload";
import type { UploadHelpers } from "@/components/common/file-dropzone";
import ClickSpark from "@/components/ClickSpark";
import SpotlightCard from "@/components/SpotlightCard";
import BlurText from "@/components/BlurText";
import { cn } from "@/lib/utils";

interface ToolUploadScreenProps {
  title: string;
  subtitle?: string;
  label: string;
  secondaryLabel?: string;
  icon?: ReactNode;
  accept: Record<string, string[]>;
  multiple?: boolean;
  onFiles: (items: LoadedFile[], helpers: UploadHelpers) => void | Promise<void>;
  variant?: "default" | "hero";
}

export function ToolUploadScreen({
  title,
  subtitle,
  label,
  secondaryLabel,
  icon,
  accept,
  multiple,
  onFiles,
  variant = "hero",
}: ToolUploadScreenProps) {
  if (variant === "default") {
    return (
      <div className="mx-auto flex min-h-[calc(100dvh-10rem)] max-w-xl flex-col justify-center py-8">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {subtitle && (
            <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>
          )}
        </div>
        <FileDropzone
          size="large"
          label={label}
          secondaryLabel={secondaryLabel}
          accept={accept}
          multiple={multiple}
          onFiles={onFiles}
        />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col gap-5">
      <div className="shrink-0 space-y-3">
        <div className="flex flex-wrap items-start gap-4">
          {icon && (
            <div className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary shadow-sm">
              {icon}
            </div>
          )}
          <div className="min-w-0 flex-1 space-y-2">
            <BlurText
              text={title}
              className="text-2xl font-bold tracking-tight text-foreground md:text-3xl"
              delay={60}
            />
            {subtitle && (
              <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground md:text-base">
                {subtitle}
              </p>
            )}
          </div>
        </div>
      </div>

      <ClickSpark
        className="flex min-h-0 flex-1 flex-col"
        sparkColor="rgba(0, 120, 212, 0.85)"
      >
        <SpotlightCard
          className={cn(
            "!flex !h-full !min-h-0 !flex-1 !flex-col !rounded-2xl !border-border !bg-card/70 !p-3 shadow-sm backdrop-blur-sm dark:!bg-card/50 md:!p-4"
          )}
          spotlightColor="rgba(0, 120, 212, 0.18)"
        >
          <FileDropzone
            size="hero"
            label={label}
            secondaryLabel={secondaryLabel}
            accept={accept}
            multiple={multiple}
            onFiles={onFiles}
            className="h-full min-h-0 flex-1"
          />
        </SpotlightCard>
      </ClickSpark>
    </div>
  );
}
