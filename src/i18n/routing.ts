export const locales = ["en", "vi"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "en";

export const routing = {
  locales,
  defaultLocale,
  localePrefix: "as-needed" as const,
  localeDetection: false,
};
