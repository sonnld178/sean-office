"use client";

import { Button } from "@/components/ui/button";
import { HowItWorks } from "@/components/common/how-it-works";

interface StepHeaderProps {
  backLabel: string;
  current: string;
  onBack: () => void;
  howToTitle?: string;
  howToBody?: string;
}

export function StepHeader({
  backLabel,
  current,
  onBack,
  howToTitle,
  howToBody,
}: StepHeaderProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" onClick={onBack}>
          {backLabel}
        </Button>
        <h2 className="text-sm font-semibold">{current}</h2>
      </div>
      {howToTitle && howToBody && (
        <HowItWorks title={howToTitle} body={howToBody} />
      )}
    </div>
  );
}

interface StepFooterProps {
  onNext?: () => void;
  label?: string;
}

export function StepFooter({ onNext, label = "Next step" }: StepFooterProps) {
  if (!onNext) return null;
  return (
    <div className="mt-6 flex justify-end">
      <Button onClick={onNext}>{label}</Button>
    </div>
  );
}

export function StepPanel({
  children,
  minHeight = 140,
}: {
  children: React.ReactNode;
  minHeight?: number;
}) {
  return (
    <div className="mt-4" style={{ minHeight }}>
      {children}
    </div>
  );
}

export type ContentWidth = "narrow" | "uniform" | "wide";

export function ContentPane({
  width = "uniform",
  className,
  children,
}: {
  width?: ContentWidth;
  className?: string;
  children: React.ReactNode;
}) {
  const maxW =
    width === "wide"
      ? "max-w-full"
      : width === "uniform"
        ? "max-w-[960px]"
        : "max-w-[66%]";
  const centered = width !== "wide";
  return (
    <div className={cn(maxW, centered && "mx-auto w-full", className)}>
      {children}
    </div>
  );
}

function cn(...classes: (string | false | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}
