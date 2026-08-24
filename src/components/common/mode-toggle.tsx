"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app-store";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function ModeToggle() {
  const t = useTranslations("mode");
  const { mode, setMode } = useAppStore();

  useEffect(() => {
    if (mode === "server") setMode("local");
  }, [mode, setMode]);

  return (
    <div className="flex items-center gap-1.5">
      <div className="flex min-w-0 flex-1 rounded-lg border border-border p-0.5">
        <button
          type="button"
          onClick={() => setMode("local")}
          className={cn(
            "flex-1 rounded-md px-2 py-1 text-xs font-medium transition-colors",
            mode === "local"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {t("local")}
        </button>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="flex-1 cursor-not-allowed rounded-md px-2 py-1 text-center text-xs font-medium text-muted-foreground/60">
              {t("server")}
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-48">
            {t("inDevelopment")}
          </TooltipContent>
        </Tooltip>
      </div>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="inline-flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label={t("localHint")}
          >
            <Info className="size-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right" className="max-w-48">
          {t("localHint")}
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
