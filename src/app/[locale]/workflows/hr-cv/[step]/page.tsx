"use client";

import { useEffect, useMemo } from "react";
import { useParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { AppShell } from "@/components/layout/app-shell";
import { usePendingRouter } from "@/components/layout/navigation-pending";
import {
  StepFooter,
  StepHeader,
  StepPanel,
} from "@/components/board/step-chrome";
import { FileDropzone } from "@/components/common/file-dropzone";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { useAppStore } from "@/store/app-store";
import {
  applyKeywordScoring,
  DEMO_CVS,
  exportCandidatesXlsx,
  parseCvPdf,
} from "@/lib/hr-processor";
import { downloadSeanOfficeBlob } from "@/lib/download-names";

const STEPS = ["criteria", "upload", "review-table", "score", "mail"] as const;

export default function HrStepPage() {
  const params = useParams<{ step: string }>();
  const step = params.step;
  const stepIndex = STEPS.indexOf(step as (typeof STEPS)[number]);

  const t = useTranslations("hr");
  const tb = useTranslations("board");
  const locale = useLocale();
  const router = usePendingRouter();
  const prefix = locale === "en" ? "" : `/${locale}`;

  const {
    hrDone,
    setHrDone,
    hrKeywords,
    hrMustHave,
    hrCandidates,
    setHrCriteria,
    setHrCandidates,
    updateHrCandidate,
  } = useAppStore();

  useEffect(() => {
    if (stepIndex === -1 || stepIndex > hrDone + 1) {
      router.replace(`${prefix}/workflows/hr-cv`);
    }
  }, [stepIndex, hrDone, router, prefix]);

  useEffect(() => {
    if (step === "review-table" && hrCandidates.length > 0) {
      const scored = applyKeywordScoring(
        hrCandidates,
        hrKeywords,
        hrMustHave
      );
      setHrCandidates(scored);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const titles: Record<string, { title: string; howTo: string }> = {
    criteria: { title: t("criteria.title"), howTo: t("criteria.howTo") },
    upload: { title: t("upload.title"), howTo: t("upload.howTo") },
    "review-table": {
      title: t("reviewTable.title"),
      howTo: t("reviewTable.howTo"),
    },
    score: { title: t("score.title"), howTo: t("score.howTo") },
    mail: { title: t("mail.title"), howTo: t("mail.howTo") },
  };

  const current = titles[step ?? ""] ?? titles.criteria;

  const goNext = () => {
    setHrDone(Math.max(hrDone, stepIndex + 1));
    const next = STEPS[stepIndex + 1];
    if (next) router.push(`${prefix}/workflows/hr-cv/${next}`);
  };

  const selectedEmails = useMemo(
    () =>
      hrCandidates
        .filter((c) => c.selected)
        .map((c) => c.email)
        .filter(Boolean),
    [hrCandidates]
  );

  return (
    <AppShell contentWidth="uniform">
      <StepHeader
        backLabel={tb("allSteps")}
        current={current.title}
        onBack={() => router.push(`${prefix}/workflows/hr-cv`)}
        howToTitle={current.title}
        howToBody={current.howTo}
      />

      <StepPanel minHeight={160}>
        {step === "criteria" && (
          <div className="space-y-4">
            <div>
              <Label>{t("keywords")}</Label>
              <Input
                value={hrKeywords}
                onChange={(e) => setHrCriteria(e.target.value, hrMustHave)}
                placeholder="React, TypeScript, Next.js"
              />
            </div>
            <div>
              <Label>{t("mustHave")}</Label>
              <Textarea
                value={hrMustHave}
                onChange={(e) => setHrCriteria(hrKeywords, e.target.value)}
                placeholder="Node.js"
                rows={2}
              />
            </div>
          </div>
        )}

        {step === "upload" && (
          <div className="space-y-4">
            <FileDropzone
              label={t("upload.preview")}
              accept={{ "application/pdf": [".pdf"] }}
              multiple
              onFiles={async (items, { setProgress }) => {
                setProgress(92);
                const parsed = await Promise.all(
                  items.map((item) =>
                    parseCvPdf(item.file, item.buffer)
                  )
                );
                setHrCandidates(
                  applyKeywordScoring(parsed, hrKeywords, hrMustHave)
                );
                setProgress(100);
              }}
            />
            <Button
              variant="secondary"
              onClick={() => {
                const demo = applyKeywordScoring(
                  DEMO_CVS.map((d) => ({ ...d })),
                  hrKeywords,
                  hrMustHave
                );
                setHrCandidates(demo);
              }}
            >
              {t("useDemo")}
            </Button>
            {hrCandidates.length > 0 && (
              <p className="text-sm text-muted-foreground">
                {hrCandidates.length} candidates loaded
              </p>
            )}
          </div>
        )}

        {step === "review-table" && hrCandidates.length > 0 && (
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
                  <TableHead>{t("name")}</TableHead>
                  <TableHead>{t("email")}</TableHead>
                  <TableHead>{t("title_col")}</TableHead>
                  <TableHead>{t("status")}</TableHead>
                  <TableHead>{t("hits")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {hrCandidates.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <Checkbox
                        checked={!!c.selected}
                        onCheckedChange={(v) =>
                          updateHrCandidate(c.id, { selected: !!v })
                        }
                      />
                    </TableCell>
                    <TableCell className="text-xs">{c.name}</TableCell>
                    <TableCell className="text-xs">{c.email}</TableCell>
                    <TableCell className="text-xs">{c.title}</TableCell>
                    <TableCell>
                      <Select
                        value={c.status}
                        onValueChange={(v) =>
                          updateHrCandidate(c.id, {
                            status: v as typeof c.status,
                          })
                        }
                      >
                        <SelectTrigger className="h-8 w-24 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="fit">{t("fit")}</SelectItem>
                          <SelectItem value="maybe">{t("maybe")}</SelectItem>
                          <SelectItem value="no">{t("no")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-xs">
                      {c.hits.join(", ")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {step === "score" && (
          <div className="rounded-lg border border-dashed p-8 text-center">
            <p className="text-sm text-muted-foreground">{t("aiComing")}</p>
            <Button className="mt-4" disabled>
              {t("score.preview")}
            </Button>
          </div>
        )}

        {step === "mail" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {selectedEmails.length} {t("selected")}
            </p>
            <div className="flex flex-wrap gap-3">
              <Button
                variant="secondary"
                onClick={() =>
                  navigator.clipboard.writeText(selectedEmails.join(", "))
                }
                disabled={!selectedEmails.length}
              >
                {t("copyEmails")}
              </Button>
              <Button asChild disabled={!selectedEmails.length}>
                <a
                  href={`mailto:?bcc=${encodeURIComponent(selectedEmails.join(","))}`}
                >
                  {t("mailto")}
                </a>
              </Button>
              <Button
                variant="outline"
                onClick={() =>
                  downloadSeanOfficeBlob(
                    exportCandidatesXlsx(hrCandidates),
                    "excel",
                    "candidates.xlsx",
                    "xlsx"
                  )
                }
              >
                {t("exportExcel")}
              </Button>
            </div>
          </div>
        )}
      </StepPanel>

      {stepIndex < 4 && step !== "score" && (
        <StepFooter
          onNext={
            step === "criteria"
              ? hrKeywords.trim()
                ? goNext
                : undefined
              : step === "upload"
                ? hrCandidates.length > 0
                  ? goNext
                  : undefined
                : step === "review-table"
                  ? hrCandidates.length > 0
                    ? goNext
                    : undefined
                  : step === "score"
                    ? goNext
                    : undefined
          }
          label={tb("nextStep")}
        />
      )}
    </AppShell>
  );
}
