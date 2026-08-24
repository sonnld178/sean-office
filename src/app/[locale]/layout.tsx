import { NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import type { Locale } from "@/i18n/routing";
import { localeFontClass } from "@/lib/fonts";
import { LocaleHtmlAttributes } from "@/components/locale-html-attributes";
import { NavigationPendingProvider } from "@/components/layout/navigation-pending";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!routing.locales.includes(locale as Locale)) notFound();
  setRequestLocale(locale);
  const messages = await getMessages();

  return (
    <NextIntlClientProvider messages={messages}>
      <LocaleHtmlAttributes locale={locale} />
      <div className={cn("min-h-screen", localeFontClass())}>
        <TooltipProvider delayDuration={200}>
          <NavigationPendingProvider>{children}</NavigationPendingProvider>
        </TooltipProvider>
      </div>
    </NextIntlClientProvider>
  );
}
