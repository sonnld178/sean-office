"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Download, FlaskConical, Loader2 } from "lucide-react";
import { FileDropzone } from "@/components/common/file-dropzone";
import type { LoadedFile } from "@/lib/file-upload";
import type { UploadHelpers } from "@/components/common/file-dropzone";
import ClickSpark from "@/components/ClickSpark";
import SpotlightCard from "@/components/SpotlightCard";
import BlurText from "@/components/BlurText";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type SampleFile = {
  href: string;
  label: string;
  /** if true, hide Load in app button (download only) */
  downloadOnly?: boolean;
};

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
  samples?: SampleFile[];
  onLoadSample?: (href: string, label: string, helpers: UploadHelpers) => void | Promise<void>;
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
  samples,
  onLoadSample,
}: ToolUploadScreenProps) {
  const tSample = useTranslations("sample");
  const [loadingHref, setLoadingHref] = useState<string | null>(null);
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
        {samples && samples.length > 0 && (
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            <span className="text-xs text-muted-foreground">{tSample("noFile")}</span>
            {samples.map((s) => (
              <div key={s.href} className="flex items-center gap-1.5">
                <Button asChild variant="outline" size="sm" className="h-7 gap-1.5">
                  <a href={s.href} download>
                    <Download className="size-3.5" />
                    {s.label}
                  </a>
                </Button>
                {onLoadSample && !s.downloadOnly && (
                  <Button
                    variant="secondary"
                    size="sm"
                    className="h-7 gap-1.5"
                    disabled={loadingHref !== null}
                    onClick={async () => {
                      setLoadingHref(s.href);
                      try {
                        await onLoadSample(s.href, s.label, { setProgress: () => {} });
                      } finally {
                        setLoadingHref(null);
                      }
                    }}
                  >
                    {loadingHref === s.href ? <Loader2 className="size-3.5 animate-spin" /> : <FlaskConical className="size-3.5" />}
                    {tSample("trySample")}
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
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

      {samples && samples.length > 0 && (
        <div className="shrink-0 rounded-xl border border-border bg-card/60 px-3 py-3 shadow-sm backdrop-blur-sm md:px-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex min-w-0 items-center gap-2.5">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 text-primary">
                <FlaskConical className="size-4" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium leading-none">{tSample("noFile")}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {samples.map((s) => s.label).join("  •  ")}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {samples.map((s) => (
                <div key={s.href} className="flex items-center gap-1.5">
                  <Button asChild variant="outline" size="sm" className="h-8 gap-1.5">
                    <a href={s.href} download>
                      <Download className="size-3.5" />
                      {s.label}
                    </a>
                  </Button>
                  {onLoadSample && !s.downloadOnly && (
                    <Button
                      variant="secondary"
                      size="sm"
                      className="h-8 gap-1.5"
                      disabled={loadingHref !== null}
                      onClick={async () => {
                        setLoadingHref(s.href);
                        try {
                          await onLoadSample(s.href, s.label, {
                            setProgress: () => {},
                          });
                        } finally {
                          setLoadingHref(null);
                        }
                      }}
                    >
                      {loadingHref === s.href ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <FlaskConical className="size-3.5" />
                      )}
                      {loadingHref === s.href ? tSample("loading") : tSample("trySample")}
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
