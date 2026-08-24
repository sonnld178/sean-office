"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";

interface DocWordPreviewProps {
  html: string;
  highlightPlaceholders?: boolean;
  className?: string;
}

function highlightPlaceholderHtml(html: string): string {
  return html.replace(
    /\{\{([^}]+)\}\}/g,
    '<mark class="rounded-sm bg-yellow-200 px-0.5 text-inherit dark:bg-yellow-500/40">{{$1}}</mark>'
  );
}

export function DocWordPreview({
  html,
  highlightPlaceholders = true,
  className,
}: DocWordPreviewProps) {
  const processedHtml = useMemo(
    () => (highlightPlaceholders ? highlightPlaceholderHtml(html) : html),
    [html, highlightPlaceholders]
  );

  return (
    <div className={cn("flex justify-center p-4 md:p-8", className)}>
      <article
        className="prose prose-sm mx-auto min-h-[297mm] w-full max-w-[210mm] rounded-sm border bg-white p-[20mm] shadow-lg dark:prose-invert dark:bg-zinc-950"
        dangerouslySetInnerHTML={{ __html: processedHtml }}
      />
    </div>
  );
}
