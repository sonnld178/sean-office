"use client";

import { useEffect, useState, type RefObject } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { SeanOfficeLogo } from "@/components/brand/sean-office-logo";
import { LocaleSwitcher } from "@/components/layout/locale-switcher";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Github, MessageCircle } from "lucide-react";

const SITE = {
  github: "https://github.com/sonnld178/sean-office",
  whatsapp: "https://wa.me/84947630154",
};

interface SiteHeaderProps {
  variant?: "home" | "app" | "simple";
  /** Home: shrink when this element scrolls up to the header */
  shrinkAfterRef?: RefObject<HTMLElement | null>;
}

export function SiteHeader({
  variant = "home",
  shrinkAfterRef,
}: SiteHeaderProps) {
  const t = useTranslations("nav");
  const th = useTranslations("header");
  const locale = useLocale();
  const prefix = locale === "en" ? "" : `/${locale}`;
  const [shrink, setShrink] = useState(false);
  const [contentWidth, setContentWidth] = useState<number | null>(null);

  useEffect(() => {
    if (variant !== "home") return;

    const HEADER_H = 64;

    const contentEl =
      shrinkAfterRef?.current ?? document.getElementById("home-content");
    const heroEl = document.getElementById("home-hero");

    const measureContent = () => {
      if (!contentEl) return;
      setContentWidth(contentEl.getBoundingClientRect().width);
    };

    const updateShrink = () => {
      if (heroEl) {
        setShrink(heroEl.getBoundingClientRect().bottom <= HEADER_H);
        return;
      }
      if (contentEl) {
        setShrink(contentEl.getBoundingClientRect().top <= HEADER_H);
        return;
      }
      setShrink(window.scrollY > HEADER_H);
    };

    const onChange = () => {
      measureContent();
      updateShrink();
    };

    onChange();
    window.addEventListener("scroll", updateShrink, { passive: true });
    window.addEventListener("resize", onChange, { passive: true });

    const ro =
      contentEl && typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(measureContent)
        : null;
    ro?.observe(contentEl!);

    return () => {
      window.removeEventListener("scroll", updateShrink);
      window.removeEventListener("resize", onChange);
      ro?.disconnect();
    };
  }, [variant, shrinkAfterRef]);

  const isApp = variant === "app";
  const isSimple = variant === "simple";
  const isHomeShrink = variant === "home" && shrink;

  const nav = [
    { href: `${prefix}/sheets`, label: t("tools"), disabled: false },
    { href: `${prefix}/workflows/hr-cv`, label: t("workflows"), disabled: true },
    { href: `${prefix}/privacy`, label: t("privacy"), disabled: false },
  ];

  return (
    <header
      className={cn(
        "sticky top-0 z-50 w-full transition-[padding] duration-200 motion-reduce:transition-none",
        isHomeShrink ? "pt-3 pb-2" : "pt-0"
      )}
    >
      <div
        style={
          isHomeShrink && contentWidth
            ? { width: contentWidth, maxWidth: contentWidth }
            : undefined
        }
        className={cn(
          "mx-auto flex w-full items-center transition-all duration-200 motion-reduce:transition-none",
          isHomeShrink
            ? "h-10 gap-3 rounded-full border border-border bg-background/95 px-4 shadow-md backdrop-blur-md md:h-11 md:gap-4 md:px-6"
            : isApp || isSimple
              ? "h-11 max-w-full gap-4 border-b border-border bg-background/95 px-4 backdrop-blur-md md:h-12 md:px-6"
              : "h-11 max-w-full gap-4 border-b border-border bg-background/80 px-4 backdrop-blur-sm md:h-12 md:gap-5 md:px-8"
        )}
      >
        <Link
          href={`${prefix}/`}
          className="inline-flex shrink-0 items-center self-center transition-opacity hover:opacity-90"
        >
          <SeanOfficeLogo size={isHomeShrink ? 20 : 22} showWordmark />
        </Link>

        <nav className="hidden items-center gap-0.5 sm:flex">
          {nav.map(({ href, label, disabled }) =>
            disabled ? (
              <Tooltip key={href}>
                <TooltipTrigger asChild>
                  <span className="cursor-not-allowed rounded-md px-2.5 py-1.5 text-[13px] font-medium text-muted-foreground/60">
                    {label}
                  </span>
                </TooltipTrigger>
                <TooltipContent>{t("inDevelopment")}</TooltipContent>
              </Tooltip>
            ) : (
              <Link
                key={href}
                href={href}
                className="rounded-md px-2.5 py-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
              >
                {label}
              </Link>
            )
          )}
        </nav>
        <div className="flex-1" />
        <div className="flex shrink-0 items-center gap-1.5">
          <LocaleSwitcher />
          <a
            href={SITE.whatsapp}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label={th("whatsapp")}
          >
            <MessageCircle className="size-4" />
          </a>
          <a
            href={SITE.github}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label={th("github")}
          >
            <Github className="size-4" />
          </a>
        </div>
      </div>
    </header>
  );
}
