"use client";

import { usePathname, useRouter } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { useLocale } from "next-intl";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FlagIcon } from "@/components/layout/flag-icon";
import { useNavigationPending } from "@/components/layout/navigation-pending";
import { LOCALE_META, LOCALES } from "@/lib/locale";

export function LocaleSwitcher() {
  const locale = useLocale() as Locale;
  const pathname = usePathname();
  const router = useRouter();
  const { startNavigation } = useNavigationPending();
  const current = LOCALE_META[locale] ?? LOCALE_META.en;
  const otherLocales = LOCALES.filter((code) => code !== locale);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 px-2 text-xs font-semibold"
          aria-label="Change language"
        >
          <FlagIcon locale={locale} />
          <span>{current.short}</span>
          <ChevronDown className="size-3.5 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[120px]">
        {otherLocales.map((code) => {
          const meta = LOCALE_META[code];
          return (
            <DropdownMenuItem
              key={code}
              className="flex cursor-pointer items-center gap-2"
              onSelect={() => {
                startNavigation();
                router.replace(pathname, { locale: code });
              }}
            >
              <FlagIcon locale={code} />
              <span>{meta.short}</span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
