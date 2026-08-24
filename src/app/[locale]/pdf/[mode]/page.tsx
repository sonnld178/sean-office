"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useLocale } from "next-intl";

export default function PdfModeRedirectPage() {
  const params = useParams<{ mode: string }>();
  const router = useRouter();
  const locale = useLocale();
  const prefix = locale === "en" ? "" : `/${locale}`;

  useEffect(() => {
    router.replace(`${prefix}/pdf`);
  }, [router, prefix, params.mode]);

  return null;
}
