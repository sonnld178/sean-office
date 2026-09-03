# Project context

Internal notes on architecture and current state. Update after major changes.

**Last updated:** 2026-09-02 · **License:** AGPL-3.0-or-later · **Branch:** `feat/ai-gateway` (v0.2.0-ai-port)

## Overview

Browser-based office tools by **Son Nguyen** ([@sonnld178](https://github.com/sonnld178)).  
Stack: Next.js 15 · React 19 · TypeScript · Tailwind v4 · shadcn · zustand · pdf-lib · pdfjs · mammoth · xlsx · OmniRoute VPS (187.52.126.101:20128, KVM2 2CPU/8GB+2GB swap) · Vercel AI Gateway · Groq/Gemini direct.

## UX pattern (Sheets / Word / PDF)

1. Route opens → **hero upload** (`ToolUploadScreen` variant `hero`: full-height drop zone, React Bits SpotlightCard + ClickSpark + BlurText title, tool icon)
2. After upload → preview + top toolbar (icon buttons via `toolbar-icon-button.tsx`)
3. Tool selected → right panel for options

Shared components: `src/components/tool/tool-upload-screen.tsx`, `tool-workspace-shell.tsx`, `ClickSpark.tsx`

**App shell:** `app-shell.tsx` uses `h-dvh` + internal scroll so PDF/Word/Sheets toolbars stay visible; only the preview column scrolls.

## Routes

| Route | Tools (toolbar → right panel) |
|-------|-------------------------------|
| `/sheets` | Map · **AI Map** · Review · Export |
| `/word` | Fill · Clean · Extract · **AI Translate Image** |
| `/pdf` | Watermark · Sign · Merge · Split · Pages · Compress · Extract · **AI Translate Image** |
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


## AI Gateway (v0.2.0-ai-port) — Combo OmniRoute VPS + Vercel + Direct

- **Env:** src/lib/env.ts:1 iGatewayEnv() đọc OMNIROUTE_BASE_URL (default http://187.52.126.101:20128, KVM2 Malaysia) + OMNIROUTE_API_KEY (optional), AI_GATEWAY_API_KEY ($5 optional), GEMINI_API_KEY/GROQ_API_KEY direct free. hasKey true nếu có bất kỳ key nào.
- **Provider:** src/lib/ai/providers/omniroute.ts:1 (OpenAI-compatible POST {base}/v1/chat/completions, model google/gemini-2.5-flash-lite, handle server_busy/529/503), providers/gemini.ts:1 (Gateway i-gateway.vercel.sh hoặc direct generativelanguage.googleapis.com), providers/groq.ts:1 (groq/compound-mini).
- **Fallback:** src/lib/ai/fallback.ts:1 chain omniroute --busy/402/429/5xx--> gemini --retry--> groq, isRetryable() gồm server_busy/402/403/529, log provider_chain, 20s timeout, json_schema strict.
- **Routes:** src/app/api/ai/sheets/map/route.ts:1 (json_schema mappings), src/app/api/ai/image/translate/route.ts:1 (Vision, 6MB), rate limit 10/min src/lib/ai/rate-limit.ts:1.
- **UI:** Sheets sheets-workspace.tsx:45 AI Map diff, PDF pdf-workspace.tsx:64 + Word docs-workspace.tsx:46 AiImageTranslatePanel.
- **Infra VPS:** KVM2 2CPU/8GB + 2GB swap (/swapfile, ree -h available 2.0Gi), docker ps 7 containers, swapon 2G, drop_caches done — đủ demo <10 user, panel 72% là used gồm cache, không tính swap.
- **Public API:** src/app/api/v1/... + public/openapi.json:1, **MCP:** src/mcp/server.ts:1.
- **Tests:** 	ests/ai/gateway.test.ts:1 (busy/429→success).

## File map

`
src/lib/env.ts
src/lib/ai/gateway.ts, providers/gemini.ts, providers/groq.ts, fallback.ts, rate-limit.ts
src/app/api/ai/sheets/map/route.ts, src/app/api/ai/image/translate/route.ts
src/app/api/v1/{sheets/map,pdf/watermark,ai/extract}/route.ts, public/openapi.json
src/components/ai/ai-image-translate-panel.tsx
src/mcp/server.ts, tests/ai/gateway.test.ts
`

## Status

**Shipped:** PDF editor + utilities, SmallPDF-style page sidebar, overlay rotation fix, hero uploads, sticky toolbars, EN/VI switcher, HR CV in-dev, Apply-all feedback, `/word` route, AGPL license, **AI Enhance v0.2.0:** gateway (Gemini→Groq fallback, 20s timeout, json_schema strict), Sheets AI Map (diff preview), PDF/Word AI Translate Image (Vision + canvas overlay), rate limit 10/min, public API + MCP, eval tests.
**Backlog:** HR CV upload-first refactor, server-mode production wiring, remove legacy PDF board components, FLUX image-gen for translate background.
