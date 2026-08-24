"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ProcessingMode = "local" | "server";

export interface SheetRow {
  [key: string]: string | number | null;
}

export interface ColumnMapping {
  source: string;
  target: string;
  transform: "none" | "trim" | "email" | "phone" | "date";
}

export interface HrCandidate {
  id: string;
  name: string;
  email: string;
  phone: string;
  title: string;
  yearsExp: string;
  skills: string;
  status: "fit" | "maybe" | "no";
  hits: string[];
  selected?: boolean;
  rawText?: string;
}

interface AppState {
  mode: ProcessingMode;
  setMode: (mode: ProcessingMode) => void;

  sheetsDone: number;
  setSheetsDone: (n: number) => void;
  sheetsHeaders: string[];
  sheetsRows: SheetRow[];
  sheetsMappings: ColumnMapping[];
  setSheetsData: (headers: string[], rows: SheetRow[]) => void;
  setSheetsMappings: (m: ColumnMapping[]) => void;
  resetSheets: () => void;

  hrDone: number;
  setHrDone: (n: number) => void;
  hrKeywords: string;
  hrMustHave: string;
  hrCandidates: HrCandidate[];
  setHrCriteria: (keywords: string, mustHave: string) => void;
  setHrCandidates: (c: HrCandidate[]) => void;
  updateHrCandidate: (id: string, patch: Partial<HrCandidate>) => void;
  resetHr: () => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      mode: "local",
      setMode: (mode) => set({ mode: mode === "server" ? "local" : mode }),

      sheetsDone: 0,
      setSheetsDone: (sheetsDone) => set({ sheetsDone }),
      sheetsHeaders: [],
      sheetsRows: [],
      sheetsMappings: [],
      setSheetsData: (sheetsHeaders, sheetsRows) =>
        set({ sheetsHeaders, sheetsRows }),
      setSheetsMappings: (sheetsMappings) => set({ sheetsMappings }),
      resetSheets: () =>
        set({
          sheetsDone: 0,
          sheetsHeaders: [],
          sheetsRows: [],
          sheetsMappings: [],
        }),

      hrDone: 0,
      setHrDone: (hrDone) => set({ hrDone }),
      hrKeywords: "",
      hrMustHave: "",
      hrCandidates: [],
      setHrCriteria: (hrKeywords, hrMustHave) => set({ hrKeywords, hrMustHave }),
      setHrCandidates: (hrCandidates) => set({ hrCandidates }),
      updateHrCandidate: (id, patch) =>
        set((s) => ({
          hrCandidates: s.hrCandidates.map((c) =>
            c.id === id ? { ...c, ...patch } : c
          ),
        })),
      resetHr: () =>
        set({
          hrDone: 0,
          hrKeywords: "",
          hrMustHave: "",
          hrCandidates: [],
        }),
    }),
    {
      name: "seanoffice-store",
      merge: (persisted, current) => ({
        ...current,
        ...(persisted as Partial<AppState>),
        mode: "local",
      }),
    }
  )
);

export function stepStatus(
  index: number,
  done: number
): "open" | "locked" | "done" {
  if (index <= done) return "done";
  if (index === done + 1) return "open";
  return "locked";
}
