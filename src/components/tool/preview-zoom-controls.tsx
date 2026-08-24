"use client";

import { useTranslations } from "next-intl";
import { ZoomIn, ZoomOut } from "lucide-react";
import { ToolbarIconButton } from "@/components/tool/toolbar-icon-button";

interface PreviewZoomControlsProps {
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
}

export function PreviewZoomControls({
  zoom,
  onZoomIn,
  onZoomOut,
  onReset,
}: PreviewZoomControlsProps) {
  const t = useTranslations("common.preview");

  return (
    <div className="flex items-center gap-1 rounded-md border border-border bg-background px-1 py-0.5 shadow-sm">
      <ToolbarIconButton
        icon={<ZoomOut className="size-3.5" />}
        label={t("zoomOut")}
        onClick={onZoomOut}
        variant="ghost"
      />
      <button
        type="button"
        className="min-w-10 px-1 text-center text-xs tabular-nums text-muted-foreground hover:text-foreground"
        onClick={onReset}
        title={t("zoomReset")}
      >
        {Math.round(zoom * 100)}%
      </button>
      <ToolbarIconButton
        icon={<ZoomIn className="size-3.5" />}
        label={t("zoomIn")}
        onClick={onZoomIn}
        variant="ghost"
      />
    </div>
  );
}
