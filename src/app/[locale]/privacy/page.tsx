import { SiteHeader } from "@/components/layout/site-header";
import { getTranslations, setRequestLocale } from "next-intl/server";

export default async function PrivacyPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("privacy");

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader variant="simple" />
      <article className="mx-auto max-w-2xl px-4 py-12 md:px-6">
        <h1 className="mb-8 text-3xl font-bold">{t("title")}</h1>
        <div className="space-y-8">
          <section>
            <h2 className="mb-2 text-lg font-semibold">{t("localTitle")}</h2>
            <p className="text-muted-foreground">{t("localBody")}</p>
          </section>
          <section>
            <h2 className="mb-2 text-lg font-semibold">{t("serverTitle")}</h2>
            <p className="text-muted-foreground">{t("serverBody")}</p>
          </section>
          <section>
            <h2 className="mb-2 text-lg font-semibold">{t("memoryTitle")}</h2>
            <p className="text-muted-foreground">{t("memoryBody")}</p>
          </section>
          <p className="text-sm text-muted-foreground">{t("contact")}</p>
        </div>
      </article>
    </div>
  );
}
