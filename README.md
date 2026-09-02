# SeanOffice

Office tools by **Son Nguyen** — clean spreadsheets, batch Word docs, and edit PDFs in the browser.

## Use online (no install)

**Open the app:** [https://sean-office.vercel.app](https://sean-office.vercel.app)

Copy that link into your browser — no download, no account. Works on desktop and phone.

**Author:** [Son Nguyen](https://seandev.info) · [@sonnld178](https://github.com/sonnld178)  
**License:** [AGPL-3.0](LICENSE) · [Source code](https://github.com/sonnld178/sean-office)

## Features

### Sheets (`/sheets`)
Upload CSV/XLSX → data preview → toolbar:
- **Map** — column mapping, transforms (trim, email, phone, date)
- **AI Map** — `AI Map` button next to Map → `POST /api/ai/sheets/map` via Vercel AI Gateway (Gemini 2.5 Flash Lite → Groq compound-mini fallback) → diff preview before apply
- **Review** — dedupe, validation
- **Export** — CSV, XLSX, mapping JSON

### Word (`/word`)
Upload `.docx` → content preview → toolbar:
- **Fill** — `{{placeholder}}` template + data sheet → batch ZIP
- **Clean** — remove comments, accept revisions, strip metadata
- **Extract** — tables to Excel
- **AI Translate Image** — same translate flow as PDF (scan image → translated text)

### PDF (`/pdf`)
Upload PDF → page preview → toolbar:
- **Watermark / Sign** — drag, rotate, resize, WYSIWYG Save
- **Merge · Split · Pages · Compress · Extract** — utility tools in the right panel
- **AI Translate Image** — upload scan → `POST /api/ai/image/translate` (Gemini Vision reading + translate, canvas overlay to keep layout)

### HR CV (`/workflows/hr-cv`)
Keyword filtering, review table, export — includes demo CVs.

### General
- **Local mode** (default): all processing in-browser
- **Server mode**: sidebar toggle — upload API stub

## Run locally

Node.js 18+

```bash
git clone https://github.com/sonnld178/sean-office.git
cd sean-office
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

If the dev server breaks after a production build:

```bash
npm run dev:clean
```

## Stack

Next.js 15 · Tailwind v4 · shadcn/ui · pdf-lib · pdfjs · mammoth · xlsx · Vercel AI Gateway

## AI Enhance (v0.2.0-ai-port)

- **Gateway:** `src/lib/ai/gateway.ts` — single `AI_GATEWAY_API_KEY` via Vercel AI Gateway → `Gemini 2.5 Flash Lite` (1k req/day free) → `Groq compound-mini` (No limit) → deepseek fallback. Timeout 20s, retry 429/5xx, logs `provider_chain`.
- **Sheets AI Map:** `src/app/api/ai/sheets/map/route.ts` + `sheets-workspace.tsx` AI Map button with diff preview.
- **Image Translate:** `src/app/api/ai/image/translate/route.ts` + `src/components/ai/ai-image-translate-panel.tsx` (PDF & Word toolbars) — Gemini Vision OCR + translate, canvas overlay preserves layout.
- **Rate limit:** 10 req/min per IP (`src/lib/ai/rate-limit.ts`, mirrors `day-frame` ai_runs pattern).
- **Public API:** `POST /api/v1/sheets/map`, `/api/v1/pdf/watermark`, `/api/v1/ai/extract`, `public/openapi.json`.
- **MCP Server:** `src/mcp/server.ts` — tools `sheets_map`, `pdf_sign`, `ai_translate_image`, run `npm run mcp:dev` for Claude/Cursor.
- **Tests:** `tests/ai/gateway.test.ts` — mock fetch, fallback 429→success.

**Env:** see `.env.example` — set `AI_GATEWAY_API_KEY` (or `GEMINI_API_KEY`/`GROQ_API_KEY` fallback) in Vercel Env (Production + Preview + Development).

## Stack

Next.js 15 · Tailwind v4 · shadcn/ui · pdf-lib · pdfjs · mammoth · xlsx
