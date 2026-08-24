"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import SpotlightCard from "@/components/SpotlightCard";
import { useTranslations } from "next-intl";

export type CardStatus = "open" | "locked" | "done";

interface FeatureCardProps {
  title: string;
  category: string;
  preview: string;
  status?: CardStatus;
  onOpen?: () => void;
}

export function FeatureCard({
  title,
  category,
  preview,
  status = "open",
  onOpen,
}: FeatureCardProps) {
  const t = useTranslations("board");
  const clickable = status !== "locked" && !!onOpen;

  const badge =
    status === "done" ? (
      <Badge className="bg-primary/90">{t("done")}</Badge>
    ) : status === "locked" ? (
      <Badge variant="secondary">{t("locked")}</Badge>
    ) : (
      <Badge variant="outline" className="border-primary/40 text-primary">
        {t("ready")}
      </Badge>
    );

  const inner = (
    <div
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={clickable ? onOpen : undefined}
      onKeyDown={
        clickable
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") onOpen?.();
            }
          : undefined
      }
      className={cn(
        "flex h-[118px] flex-col gap-1.5 rounded-lg border bg-card p-2 transition-all",
        status === "open" && "border-primary/30 shadow-sm",
        status === "locked" && "cursor-not-allowed opacity-55",
        clickable && "cursor-pointer hover:border-primary hover:shadow-md"
      )}
    >
      <div className="relative shrink-0">
        <div className="flex h-12 items-center justify-center rounded-md border border-dashed border-border bg-muted/40 px-2">
          <span className="line-clamp-2 text-center text-[10px] text-muted-foreground">
            {preview}
          </span>
        </div>
        <div className="absolute left-1 top-1">{badge}</div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-0.5">
        <p className="line-clamp-2 text-xs font-semibold leading-tight">
          {title}
        </p>
        <p className="text-[10px] text-muted-foreground">
          {status === "locked" ? t("finishPrevious") : category}
        </p>
      </div>
    </div>
  );

  if (clickable) {
    return (
      <SpotlightCard
        className="!rounded-lg !border-border !bg-card !p-0 dark:!bg-card"
        spotlightColor="rgba(0, 120, 212, 0.12)"
      >
        {inner}
      </SpotlightCard>
    );
  }

  return inner;
}
