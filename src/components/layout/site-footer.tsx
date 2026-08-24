"use client";

import { useTranslations } from "next-intl";

const SOURCE_URL = "https://github.com/sonnld178/sean-office";

export function SiteFooter() {
  const th = useTranslations("header");

  return (
    <footer className="border-t border-border py-4 text-center text-xs text-muted-foreground">
      SeanOffice · AGPL-3.0 ·{" "}
      <a
        href={SOURCE_URL}
        className="underline hover:text-foreground"
        target="_blank"
        rel="noopener noreferrer"
      >
        {th("github")} source
      </a>
    </footer>
  );
}
