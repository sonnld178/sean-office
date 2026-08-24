import type { Locale } from "@/i18n/routing";

const LOCALES: Locale[] = ["en", "vi"];

export const LOCALE_META: Record<
  Locale,
  { label: string; short: string }
> = {
  en: { label: "English", short: "EN" },
  vi: { label: "Tiếng Việt", short: "VI" },
};

/** Path without /en prefix */
export function stripLocalePrefix(pathname: string): string {
  const stripped = pathname.replace(/^\/(en|vi)(?=\/|$)/, "");
  return stripped || "/";
}

export function localizedPath(pathname: string): string {
  return stripLocalePrefix(pathname);
}

export { LOCALES };
