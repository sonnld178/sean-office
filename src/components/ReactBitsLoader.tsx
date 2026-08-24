"use client";

import { motion } from "motion/react";
import { cn } from "@/lib/utils";

type ReactBitsLoaderProps = {
  className?: string;
  size?: "sm" | "md" | "lg";
  label?: string;
};

const sizeMap = {
  sm: {
    wrap: "size-10",
    dot: "size-1.5",
    gap: "gap-1",
  },
  md: {
    wrap: "size-14",
    dot: "size-2",
    gap: "gap-1.5",
  },
  lg: {
    wrap: "size-20",
    dot: "size-2.5",
    gap: "gap-2",
  },
} as const;

export function ReactBitsLoader({
  className,
  size = "md",
  label = "Loading",
}: ReactBitsLoaderProps) {
  const s = sizeMap[size];

  return (
    <div
      className={cn("flex items-center justify-center", className)}
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={label}
    >
      <div className={cn("relative flex items-center justify-center", s.wrap)}>
        <motion.span
          className="absolute inset-0 rounded-full border-2 border-primary/25"
          animate={{ scale: [0.85, 1.25, 0.85], opacity: [0.55, 0, 0.55] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut" }}
          aria-hidden
        />
        <motion.span
          className="absolute inset-[18%] rounded-full border border-primary/35"
          animate={{ scale: [0.9, 1.15, 0.9], opacity: [0.45, 0.1, 0.45] }}
          transition={{
            duration: 1.8,
            repeat: Infinity,
            ease: "easeOut",
            delay: 0.25,
          }}
          aria-hidden
        />
        <motion.span
          className="absolute inset-[32%] rounded-full bg-primary/10 blur-sm"
          animate={{ opacity: [0.35, 0.75, 0.35], scale: [0.95, 1.05, 0.95] }}
          transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
          aria-hidden
        />
        <div className={cn("relative flex items-center", s.gap)} aria-hidden>
          {[0, 1, 2].map((i) => (
            <motion.span
              key={i}
              className={cn("rounded-full bg-primary shadow-[0_0_10px_rgba(0,120,212,0.45)]", s.dot)}
              animate={{ y: [0, -7, 0], opacity: [0.35, 1, 0.35] }}
              transition={{
                duration: 0.85,
                repeat: Infinity,
                ease: "easeInOut",
                delay: i * 0.14,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export function ReactBitsLoaderPanel({
  className,
  size = "lg",
  label = "Loading",
}: ReactBitsLoaderProps) {
  return (
    <div
      className={cn(
        "flex min-h-[min(52vh,28rem)] w-full items-center justify-center",
        className
      )}
    >
      <ReactBitsLoader size={size} label={label} />
    </div>
  );
}
