# Project context

Internal notes on architecture and current state. Update after major changes.

**Last updated:** 2026-08-23 · **License:** AGPL-3.0-or-later

## Overview

Browser-based office tools by **Son Nguyen** ([@sonnld178](https://github.com/sonnld178)).  
Stack: Next.js 15 · React 19 · TypeScript · Tailwind v4 · shadcn · zustand · pdf-lib · pdfjs · mammoth · xlsx.

## UX pattern (Sheets / Word / PDF)

1. Route opens → **hero upload** (`ToolUploadScreen` variant `hero`: full-height drop zone, React Bits SpotlightCard + ClickSpark + BlurText title, tool icon)
2. After upload → preview + top toolbar (icon buttons via `toolbar-icon-button.tsx`)
3. Tool selected → right panel for options

Shared components: `src/components/tool/tool-upload-screen.tsx`, `tool-workspace-shell.tsx`, `ClickSpark.tsx`

**App shell:** `app-shell.tsx` uses `h-dvh` + internal scroll so PDF/Word/Sheets toolbars stay visible; only the preview column scrolls.

## Routes

| Route | Tools (toolbar → right panel) |
|-------|-------------------------------|
| `/sheets` | Map · Review · Export |
| `/word` | Fill · Clean · Extract |
| `/pdf` | Watermark · Sign · Merge · Split · Pages · Compress · Extract |
| `/workflows/hr-cv` | 5-step board (legacy; **in development** — UI links disabled with tooltip) |

Legacy redirects: `/sheets/[step]` → `/sheets`, `/pdf/[mode]` → `/pdf`, `/docs` → `/word`

## i18n

- Locales: `en` (default), `vi` — `src/i18n/routing.ts`, `messages/en.json`, `messages/vi.json`
- Locale switcher in `site-header.tsx` (`locale-switcher.tsx`, `flag-icon.tsx`)
- Word i18n: use `t.raw("fill.howTo")` for strings with `{{placeholders}}` (next-intl ICU)

## Key modules

- **Sheets:** `sheets-processor.ts`, `sheets-workspace.tsx`, zustand `sheetsRows` / `sheetsMappings`
- **Word:** `docs-processor.ts`, `docs-workspace.tsx` — route `/word`
- **PDF:** `pdf-workspace.tsx`, `pdf-page-canvas.tsx`, `pdf-page-thumbnail-list.tsx`, `pdf-overlay-bake.ts`, `pdf-overlay-transform.ts`, `pdf-tools.ts`, `pdf-tool-sidebars.tsx`
- **Layout:** `app-shell.tsx`, `navigation-pending.tsx`, `site-footer.tsx` (home only; AGPL + source link)

## PDF implementation notes

- **Left sidebar (SmallPDF-style):** per-page hover toolbar — Duplicate, Rotate 90°, Delete; `+` inserts PDF at start/between/end (`duplicatePdfPage`, `insertPdfAt` in `pdf-tools.ts`)
- **Overlays:** preview uses AABB bounds from `getOverlayExportBounds`; export via canvas bake → PNG → `exportPdfWithBakedOverlays`
- **Page rotation:** remaps overlay x/y/w/h via `pdf-overlay-transform.ts` (does **not** add extra rotation to watermark angle)
- **Apply to all pages:** watermark clone to every page; button shows ClickSpark + green success state (~2.4s)
- Save commits baked overlays into `pdfBuf`, clears overlays, reloads preview
- Legacy (candidates for removal): `pdf-tool-board.tsx`, `pdf-utility-panels.tsx`

## Mode toggle

- **Local only** for now; Server tab disabled with “In development” tooltip (`mode-toggle.tsx`, `app-store.ts` forces `local`)

## Development

```bash
npm run dev          # localhost:3000
npm run dev:clean    # reset .next if dev server errors after build
npm run build
```

If `build` runs while `dev` is active, `.next` cache may corrupt — use `dev:clean`.

Root `/docs/` in `.gitignore` is for local planning notes only — not the Word app route.

## Status

**Shipped:** PDF editor + utilities, SmallPDF-style page sidebar, overlay rotation fix, hero uploads, sticky toolbars, EN/VI switcher, HR CV marked in-dev, Apply-all feedback, `/word` route, AGPL license.  
**Backlog:** HR CV upload-first refactor, server-mode production wiring, remove legacy PDF board components.
