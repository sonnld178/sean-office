"use client";

import { useLocale, useTranslations } from "next-intl";
import { AppShell } from "@/components/layout/app-shell";
import { usePendingRouter } from "@/components/layout/navigation-pending";
import { FeatureCard } from "@/components/board/feature-card";
import { stepStatus, useAppStore } from "@/store/app-store";

export default function HrBoardPage() {
  const t = useTranslations("board");
  const th = useTranslations("hr");
  const locale = useLocale();
  const router = usePendingRouter();
  const prefix = locale === "en" ? "" : `/${locale}`;
  const done = useAppStore((s) => s.hrDone);

  const cards = [
    { slug: "criteria", title: th("criteria.title"), preview: th("criteria.preview") },
    { slug: "upload", title: th("upload.title"), preview: th("upload.preview") },
    { slug: "review-table", title: th("reviewTable.title"), preview: th("reviewTable.preview") },
    { slug: "score", title: th("score.title"), preview: th("score.preview") },
    { slug: "mail", title: th("mail.title"), preview: th("mail.preview") },
  ];

  return (
    <AppShell>
      <p className="text-sm text-muted-foreground">{t("sequentialHint")}</p>
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {cards.map(({ slug, title, preview }, i) => (
          <FeatureCard
            key={slug}
            title={title}
            category={t("step")}
            preview={preview}
            status={stepStatus(i + 1, done)}
            onOpen={() => router.push(`${prefix}/workflows/hr-cv/${slug}`)}
          />
        ))}
      </div>
    </AppShell>
  );
}
