"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { cn } from "@/lib/utils";
import { ModeToggle } from "@/components/common/mode-toggle";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  FileSpreadsheet,
  FileText,
  FileType,
  Users,
} from "lucide-react";

const toolLinks = [
  { href: "/sheets", key: "sheets", icon: FileSpreadsheet, active: "sheets" },
  { href: "/word", key: "word", icon: FileText, active: "word" },
  { href: "/pdf", key: "pdf", icon: FileType, active: "pdf" },
] as const;

export function AppSidebar() {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const locale = useLocale();
  const prefix = locale === "en" ? "" : `/${locale}`;

  const isActive = (segment: string) => pathname.includes(segment);

  return (
    <aside className="hidden w-36 shrink-0 border-r border-border bg-sidebar p-3 md:block lg:w-40">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Tools
      </p>
      <nav className="space-y-1">
        {toolLinks.map(({ href, key, icon: Icon, active }) => (
          <Link
            key={href}
            href={`${prefix}${href}`}
            className={cn(
              "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
              isActive(active)
                ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground"
            )}
          >
            <Icon className="size-4 shrink-0" />
            {t(key)}
          </Link>
        ))}
      </nav>

      <p className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {t("workflows")}
      </p>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="flex cursor-not-allowed items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground/60">
            <Users className="size-4 shrink-0" />
            {t("hrCv")}
          </span>
        </TooltipTrigger>
        <TooltipContent side="right">{t("inDevelopment")}</TooltipContent>
      </Tooltip>

      <div className="mt-6 border-t border-sidebar-border pt-4">
        <ModeToggle />
      </div>
    </aside>
  );
}
