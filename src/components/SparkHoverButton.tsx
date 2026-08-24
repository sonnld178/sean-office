"use client";

import type { ComponentProps, ReactNode } from "react";
import ClickSpark from "@/components/ClickSpark";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface SparkHoverButtonProps extends ComponentProps<typeof Button> {
  children: ReactNode;
  sparkColor?: string;
  tone?: "primary" | "destructive";
}

export function SparkHoverButton({
  className,
  sparkColor,
  tone = "primary",
  children,
  ...props
}: SparkHoverButtonProps) {
  const resolvedSpark =
    sparkColor ??
    (tone === "destructive"
      ? "rgba(239, 68, 68, 0.9)"
      : "rgba(0, 120, 212, 0.85)");

  return (
    <ClickSpark className="block w-full" sparkColor={resolvedSpark}>
      <Button
        className={cn(
          "relative w-full overflow-hidden transition-all duration-200",
          "hover:scale-[1.02] hover:shadow-md active:scale-[0.98]",
          tone === "destructive"
            ? "hover:ring-2 hover:ring-destructive/35 hover:shadow-destructive/15"
            : "hover:ring-2 hover:ring-primary/30 hover:shadow-primary/10",
          className
        )}
        {...props}
      >
        {children}
      </Button>
    </ClickSpark>
  );
}
