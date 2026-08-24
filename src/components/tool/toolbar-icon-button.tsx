"use client";

import { useState, type MouseEvent, type ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

type ToolbarIconButtonProps = {
  icon: ReactNode;
  label: string;
  onClick?: () => void;
  active?: boolean;
  disabled?: boolean;
  variant?: "outline" | "secondary" | "default" | "ghost";
  className?: string;
};

export function ToolbarIconButton({
  icon,
  label,
  onClick,
  active = false,
  disabled = false,
  variant = "outline",
  className,
}: ToolbarIconButtonProps) {
  const reduceMotion = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [glare, setGlare] = useState({ x: 50, y: 50, opacity: 0 });

  const showLabel = open && !disabled;

  const handleMove = (event: MouseEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setGlare({
      x: ((event.clientX - rect.left) / rect.width) * 100,
      y: ((event.clientY - rect.top) / rect.height) * 100,
      opacity: 0.7,
    });
  };

  return (
    <motion.button
      type="button"
      aria-label={label}
      aria-pressed={active ? true : undefined}
      disabled={disabled}
      onClick={onClick}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => {
        setOpen(false);
        setGlare((g) => ({ ...g, opacity: 0 }));
      }}
      onMouseMove={handleMove}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      whileHover={reduceMotion || disabled ? undefined : { y: -1 }}
      whileTap={reduceMotion || disabled ? undefined : { scale: 0.94 }}
      transition={{ type: "spring", stiffness: 520, damping: 28 }}
      className={cn(
        "relative inline-flex h-8 shrink-0 items-center overflow-hidden rounded-md border text-sm font-medium outline-none transition-colors",
        "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
        "disabled:pointer-events-none disabled:opacity-50",
        variant === "outline" &&
          "border-border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground",
        variant === "secondary" &&
          "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        variant === "default" &&
          "border-transparent bg-primary text-primary-foreground hover:bg-primary/90",
        variant === "ghost" &&
          "border-transparent bg-transparent hover:bg-accent hover:text-accent-foreground",
        active && variant === "outline" && "bg-secondary text-secondary-foreground",
        className
      )}
    >
      <span
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-200"
        style={{
          opacity: glare.opacity,
          background: `radial-gradient(circle at ${glare.x}% ${glare.y}%, rgba(255,255,255,0.45), transparent 58%)`,
        }}
      />
      <span className="relative z-10 flex items-center px-2">
        <motion.span
          className="inline-flex [&_svg]:size-4"
          animate={
            reduceMotion
              ? undefined
              : showLabel
                ? { rotate: -8, scale: 1.12 }
                : { rotate: 0, scale: 1 }
          }
          transition={{ type: "spring", stiffness: 420, damping: 16 }}
        >
          {icon}
        </motion.span>
        <span
          className={cn(
            "grid transition-[grid-template-columns,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
            showLabel ? "grid-cols-[1fr] opacity-100" : "grid-cols-[0fr] opacity-0"
          )}
        >
          <span className="overflow-hidden whitespace-nowrap pl-1.5 text-xs font-medium">
            {label}
          </span>
        </span>
      </span>
    </motion.button>
  );
}
