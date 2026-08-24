"use client";

import { useRef } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { SiteHeader } from "@/components/layout/site-header";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  ContentRouteLoading,
  useNavigationPending,
} from "@/components/layout/navigation-pending";
import { Button } from "@/components/ui/button";
import BlurText from "@/components/BlurText";
import SpotlightCard from "@/components/SpotlightCard";
import { FileSpreadsheet, FileText, FileType, ArrowRight } from "lucide-react";
import { HomeHeroOrbit } from "@/components/home/home-hero-orbit";
import { homePageContainerClass } from "@/lib/home-layout";
import { cn } from "@/lib/utils";

export default function HomePage() {
  const t = useTranslations("home");
  const tn = useTranslations("nav");
  const locale = useLocale();
  const prefix = locale === "en" ? "" : `/${locale}`;
  const contentRef = useRef<HTMLElement>(null);
  const { isPending } = useNavigationPending();

  const tools = [
    {
      href: `${prefix}/sheets`,
      icon: FileSpreadsheet,
      title: "Sheets",
      desc: t("sheetsDesc"),
    },
    {
      href: `${prefix}/word`,
      icon: FileText,
      title: "Word",
      desc: t("wordDesc"),
    },
    {
      href: `${prefix}/pdf`,
      icon: FileType,
      title: "PDF",
      desc: t("pdfDesc"),
    },
  ];

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader variant="home" shrinkAfterRef={contentRef} />

      {isPending ? (
        <main className="flex-1 px-4 py-10 md:px-6">
          <ContentRouteLoading />
        </main>
      ) : (
        <>
          <section
            id="home-hero"
            className="border-b border-border bg-gradient-to-br from-primary/5 via-background to-accent/20 py-16 md:py-20"
          >
            <div
              className={cn(
                homePageContainerClass,
                "grid items-center gap-10 md:grid-cols-2"
              )}
            >
              <div className="space-y-6">
                <p className="text-sm font-medium text-primary">{t("tagline")}</p>
                <BlurText
                  text={t("headline")}
                  className="text-3xl font-bold tracking-tight md:text-4xl lg:text-5xl"
                  delay={80}
                />
                <p className="max-w-md text-base leading-relaxed text-muted-foreground">
                  {t("subhead")}
                </p>
                <div className="flex flex-wrap gap-3">
                  <Button asChild size="lg">
                    <Link href={`${prefix}/sheets`}>
                      {t("cta")}
                      <ArrowRight className="ml-1 size-4" />
                    </Link>
                  </Button>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-flex">
                        <Button
                          variant="outline"
                          size="lg"
                          disabled
                          className="opacity-60"
                        >
                          {t("ctaWorkflow")}
                        </Button>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>{tn("inDevelopment")}</TooltipContent>
                  </Tooltip>
                </div>
              </div>
              <HomeHeroOrbit />
            </div>
          </section>

          <section
            id="home-content"
            ref={contentRef}
            className={cn(homePageContainerClass, "py-14")}
          >
            <h2 className="mb-8 text-xl font-semibold">{t("inside")}</h2>

            <h3 className="mb-4 text-sm font-medium uppercase tracking-wide text-muted-foreground">
              {t("toolsSection")}
            </h3>
            <div className="mb-10 grid gap-4 sm:grid-cols-3">
              {tools.map(({ href, icon: Icon, title, desc }) => (
                <Link key={href} href={href} className="group">
                  <SpotlightCard
                    className="!h-full !rounded-xl !border-border !bg-card !p-4 dark:!bg-card"
                    spotlightColor="rgba(0, 120, 212, 0.1)"
                  >
                    <Icon className="mb-2 size-5 text-primary" />
                    <p className="font-semibold">{title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{desc}</p>
                  </SpotlightCard>
                </Link>
              ))}
            </div>

            <h3 className="mb-4 text-sm font-medium uppercase tracking-wide text-muted-foreground">
              {t("workflowsSection")}
            </h3>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="cursor-not-allowed opacity-60">
                  <SpotlightCard
                    className="!rounded-xl !border-border !bg-card !p-5 dark:!bg-card"
                    spotlightColor="rgba(0, 120, 212, 0.1)"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-semibold">HR CV</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {t("hrDesc")}
                        </p>
                      </div>
                    </div>
                  </SpotlightCard>
                </div>
              </TooltipTrigger>
              <TooltipContent>{tn("inDevelopment")}</TooltipContent>
            </Tooltip>
          </section>

          <footer className="mt-auto border-t border-border py-6 text-center text-xs text-muted-foreground">
            SeanOffice · Office tools by Sean · AGPL-3.0 ·{" "}
            <a
              href="https://github.com/sonnld178/sean-office"
              className="underline hover:text-foreground"
              target="_blank"
              rel="noopener noreferrer"
            >
              Source
            </a>
            {" · "}
            <a
              href="https://seandev.info"
              className="underline hover:text-foreground"
              target="_blank"
              rel="noopener noreferrer"
            >
              seandev.info
            </a>
          </footer>
        </>
      )}
    </div>
  );
}
