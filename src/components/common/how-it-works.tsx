"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { HelpCircle } from "lucide-react";
import { useTranslations } from "next-intl";

interface HowItWorksProps {
  title: string;
  body: string;
}

export function HowItWorks({ title, body }: HowItWorksProps) {
  const t = useTranslations("board");

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <HelpCircle className="size-3.5" />
          {t("howItWorks")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>
      </DialogContent>
    </Dialog>
  );
}
