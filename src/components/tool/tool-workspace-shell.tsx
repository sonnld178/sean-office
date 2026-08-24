"use client";

import type { ReactNode } from "react";
import ClickSpark from "@/components/ClickSpark";
import { Button } from "@/components/ui/button";
import { ToolbarIconButton } from "@/components/tool/toolbar-icon-button";
import { FileText, RotateCcw, X } from "lucide-react";

interface ToolWorkspaceShellProps {
  fileName: string;
  toolbar: ReactNode;
  preview: ReactNode;
  previewAside?: ReactNode;
  rightPanel?: ReactNode;
  onNewFile: () => void;
  newFileLabel?: string;
}

export function ToolWorkspaceShell({
  fileName,
  toolbar,
  preview,
  previewAside,
  rightPanel,
  onNewFile,
  newFileLabel = "New file",
}: ToolWorkspaceShellProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-background shadow-sm">
      <div className="z-20 flex shrink-0 flex-wrap items-center gap-2 border-b border-border bg-background px-3 py-2 md:px-4">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <FileText className="size-4 shrink-0 text-primary" />
          <span className="truncate text-sm font-medium">{fileName}</span>
        </div>
        <ClickSpark className="flex flex-wrap items-center gap-1.5">
          {toolbar}
          <ToolbarIconButton
            icon={<RotateCcw />}
            label={newFileLabel}
            onClick={onNewFile}
            variant="ghost"
          />
        </ClickSpark>
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {previewAside}
        <div className="min-h-0 flex-1 overflow-auto bg-muted/30">{preview}</div>
        {rightPanel && (
          <aside className="w-full shrink-0 overflow-y-auto border-t border-border bg-card p-4 sm:w-64 sm:border-l sm:border-t-0 md:w-72">
            {rightPanel}
          </aside>
        )}
      </div>
    </div>
  );
}

export function ToolPanelHeader({
  title,
  onClose,
}: {
  title: string;
  onClose: () => void;
}) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h3 className="text-sm font-semibold">{title}</h3>
      <Button size="icon" variant="ghost" className="size-7" onClick={onClose}>
        <X className="size-4" />
      </Button>
    </div>
  );
}
