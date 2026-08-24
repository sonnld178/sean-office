"use client";

import { useEffect } from "react";
import { useLocale } from "next-intl";
import { usePendingRouter } from "@/components/layout/navigation-pending";

export default function DocsRedirectPage() {
  const router = usePendingRouter();
  const locale = useLocale();
  const prefix = locale === "en" ? "" : `/${locale}`;

  useEffect(() => {
    router.replace(`${prefix}/word`);
  }, [router, prefix]);

  return null;
}
