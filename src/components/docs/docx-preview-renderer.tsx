"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

interface DocxPreviewRendererProps {
  buffer: ArrayBuffer;
  className?: string;
  zoom?: number;
}

export function DocxPreviewRenderer({
  buffer,
  className,
  zoom = 1,
}: DocxPreviewRendererProps) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const styleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const bodyEl = bodyRef.current;
    const styleEl = styleRef.current;
    if (!bodyEl || !styleEl) return;

    let cancelled = false;
    bodyEl.innerHTML = "";
    styleEl.innerHTML = "";

    void (async () => {
      const { renderAsync } = await import("docx-preview");
      if (cancelled) return;
      const blob = new Blob([buffer.slice(0)], {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      });
      await renderAsync(blob, bodyEl, styleEl, {
        className: "docx-preview",
        inWrapper: true,
        ignoreWidth: false,
        ignoreHeight: false,
        breakPages: true,
        renderHeaders: true,
        renderFooters: true,
      });
    })().catch(() => {
      if (!cancelled && bodyEl) {
        bodyEl.innerHTML =
          '<p class="p-4 text-sm text-destructive">Preview failed</p>';
      }
    });

    return () => {
      cancelled = true;
    };
  }, [buffer]);

  return (
    <div className={cn("flex justify-center p-4 md:p-8", className)}>
      <div ref={styleRef} className="hidden" aria-hidden />
      <div
        className="docx-preview-shell mx-auto w-full origin-top overflow-x-auto rounded-sm border bg-white shadow-lg"
        style={{
          maxWidth: `${Math.round(820 * zoom)}px`,
          width: `${Math.round(100 * zoom)}%`,
        }}
      >
        <div
          ref={bodyRef}
          className="docx-preview-body min-h-[120px]"
          style={{ zoom }}
        />
      </div>
    </div>
  );
}
