# SeanOffice — AGENTS.md

> **Mục đích:** Bộ nhớ khởi động — AI đọc file này ĐẦU TIÊN mỗi chat để hiểu hệ thống, quy tắc, trạng thái và cập nhật nhật ký sau mỗi thay đổi.

**Dự án:** `sean-office` by **Son Nguyen** ([@sonnld178](https://github.com/sonnld178)) — Browser-based office tools (Sheets/Word/PDF)  
**Repo:** `sonnld178/sean-office` · **Branch:** `master` (đã merge `feat/ai-gateway`) · **Version:** `0.1.0` · **License:** `AGPL-3.0-or-later`  
**Deploy:** https://sean-office.vercel.app · **Last updated:** 2026-09-09 · Người cập nhật: Muse Spark (opencode)

---

## 1) Quy tắc nền tảng (từ `~/.config/opencode/AGENTS.md`)

- **Ngôn ngữ:** LUÔN tiếng Việt có dấu. User viết Anh → trả lời Anh. Comment/explanation trong code tiếng Việt, identifier giữ tiếng Anh.
- **Phong cách:** Xác nhận `pwd` trước khi tạo file mới. Ưu tiên sửa file có sẵn. Không tự tạo `.md` mới nếu không yêu cầu.
- **Tóm tắt cuối task:** Liệt kê file đã đổi + cách kiểm chứng (`npm run build` / `npm run test`).
- **Nhật ký:** Mỗi thay đổi ghi 1 dòng vào mục 15) ngay.

## 2) Commands — chạy đúng như ghi

```bash
npm run dev          # localhost:3000 Turbopack
npm run dev:clean    # reset .next khi build làm hỏng dev
npm run build        # 25/25 static, ~24s, First Load ~102KB
npm run test         # vitest run — 11/11 (gateway 4, review 4, jobs 3)
npm run test -- tests/ai/gateway.test.ts   # chạy 1 file
npm run mcp:dev      # tsx src/mcp/server.ts
npm run gen:samples  # tạo fixtures
```

Env mẫu: `.env.example:1` — `GEMINI_API_KEY`/`GROQ_API_KEY` (free chính), `AI_GATEWAY_API_KEY` optional ($5), `SUPABASE_*` cho queue+RAG.

## 3) Hệ thống là gì

- **Mục tiêu:** Portfolio xin việc remote (Product/AI Application Engineer) + demo thật cho HR. Không thu phí, không bán source. Public AGPL-3.0, free tier 100%. Nếu đông user → làm repo SaaS khác bán credit.
- **Local 100%:** Sheets/Word/PDF chạy trong browser (WASM/WYSIWYG). Server mode chỉ là tab disabled “In development” (`mode-toggle.tsx`, `app-store.ts` ép `local`).
- **App shell:** `app-shell.tsx` dùng `h-dvh` + cuộn nội bộ — toolbar luôn dính, chỉ cột preview cuộn.

## 4) UX pattern chung

1. Mở route → **hero upload** (`ToolUploadScreen` hero: full-height drop zone, `SpotlightCard` + `ClickSpark` + `BlurText`).
2. Sau upload → preview + top toolbar (`toolbar-icon-button.tsx`).
3. Chọn tool → panel phải hiện options.

Shared: `tool-upload-screen.tsx`, `tool-workspace-shell.tsx`, `ClickSpark.tsx`, `SpotlightCard.tsx`.

## 5) Routes & Tools

| Route | Tools (toolbar → panel) | Ghi chú |
|-------|-------------------------|---------|
| `/sheets` | Filter · Clean · Review (AI Fix) · Export | Review v2 header-first, 500 dòng limit |
| `/word` | Fill · Clean · Extract · AI Translate Image | Redirect `/docs` → `/word` |
| `/pdf` | Edit (Watermark/Sign) · Merge · Split · Pages · Compress · Extract · AI Translate Image | Sidebar SmallPDF-style + overlays |
| `/workflows/hr-cv` | 5-step board (in development) | `hr-processor.ts` |

Redirect legacy: `/sheets/[step]` → `/sheets`, `/pdf/[mode]` → `/pdf`.

## 6) Kiến trúc AI — `src/lib/env.ts:1`, `src/lib/ai/*`

**Env:** `aiGatewayEnv()` đọc `AI_GATEWAY_API_KEY` (gateway `ai-gateway.vercel.sh`, $5 optional BYOK) + `GEMINI_API_KEY`/`GROQ_API_KEY` (free tier chính). `hasKey = !!gateway || !!gemini || !!groq`.

**Providers:**
- Gemini direct: `generativelanguage.googleapis.com`, model `gemini-3.5-flash-lite`, sanitize `additionalProperties`, Vision `inlineData` base64.
- Gemini via gateway: `google/gemini-3.5-flash-lite`, `json_schema strict`.
- Groq: `groq/compound-mini` + `openai/gpt-oss-120b` cho bulk ≥10 (65K output), `json_object`, timeout 20s.
- `prefer: "groq"|"gemini"` — text ưu tiên groq, Vision ưu tiên gemini. `bulk: true` khi ≥10 issues.

**Fallback:** `fallback.ts:1` → `completeWithFallback()` chain `groq ↔ gemini` theo `prefer`, luôn fallback sang provider còn lại. `isRetryable`: 429/402/403/5xx/529/`server_busy`.

**Rate limit:** `rate-limit.ts:1` — 10 req/phút/IP.

**Routes:**
- `POST /api/ai/sheets/map` (đã gộp vào Review), `POST /api/ai/image/translate` (Vision 6MB), `POST /api/ai/sheets/fix` → `ai_jobs` → `GET /api/ai/jobs/[id]?token=` poll 2s.
- Public `POST /api/v1/{sheets/map,pdf/watermark,ai/extract}` + `public/openapi.json:1`.
- MCP `src/mcp/server.ts:1` — `sheets_map`, `pdf_sign`, `ai_translate_image`.

**Infra cũ:** VPS OmniRoute KVM2 `187.52.126.101:20128` / `synapi.tech` đã bỏ 2026-09-07 do `401 AUTH_002` — xóa `providers/omniroute.ts`, chỉ giữ `gemini ↔ groq` direct. Ghi chú trong `SEAN_OFFICE_PORT_PLAN.md:137`.

## 7) Sheets — Review v2 + AI Fix

- Engine `src/lib/sheets-processor.ts:1`: `detectReviewRules()` header-first (từ điển VI+EN, passcode không sinh rule phone), `runReviewChecks()`, low-conf guess tắt mặc định. Giới hạn 500 dòng đầu.
- Filter: per-column popover (Select All + Contains/Equals/NotEmpty/IsEmpty, AND across columns), badge đếm, preview 50 dòng, cột `#` = số dòng Excel.
- Review: checkbox rule + badge lỗi, click issue → scroll + highlight cell, ignore/undo per file session, grouped Missing/Email/Phone/Date/Duplicate.
- AI Fix: `deterministicFixes()` hiện ngay → enqueue AI phần còn lại → poll 2s → merge → Apply/Discard + Undo. Timeout 20s.
- Export: `downloadSeanOfficeBlob()` CSV/XLSX.

## 8) PDF — Implementation notes

- Left sidebar: hover Duplicate/Rotate 90°/Delete; `+` insert PDF đầu/giữa/cuối (`duplicatePdfPage`, `insertPdfAt` trong `pdf-tools.ts`).
- Overlays: preview AABB `getOverlayExportBounds`, export bake canvas→PNG→`exportPdfWithBakedOverlays`. `pdf-page-canvas.tsx`, `pdf-overlay-bake.ts`, `pdf-overlay-transform.ts`.
- Rotation remap x/y/w/h qua `pdf-overlay-transform.ts` (không cộng thêm rotation vào watermark angle).
- Apply to all pages: clone watermark mọi trang, success xanh 2.4s. Save commit vào `pdfBuf`, xóa overlays.
- Legacy cần xóa: `pdf-tool-board.tsx`, `pdf-utility-panels.tsx`.

## 9) RAG V1 — pgvector (file upload only)

- Migration `supabase/migrations/20260908_rag.sql`: enable `vector`+`pgcrypto`, tables `company_memories`+`memory_chunks`, `cv_documents`+`cv_chunks` (vector 768 cho `text-embedding-004`), RLS (service_role bypass), ivfflat `lists=100`, RPC `match_memory_chunks`/`match_cv_chunks` filter `user_key`.
- Lib `src/lib/rag/search.ts:1`: `searchChunks()` gọi RPC, filter `memoryId/cvId` client-side.
- Env: `GEMINI_API_KEY` + `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`. Đổi embedding → đổi `vector(768)` trong migration + `search.ts`.
- Project Supabase `seanoffice` (`wkhdfujxlniurcixbgkm`, Singapore) — chung với `ai_jobs`.

## 10) Boundaries — AI không tự ý đụng

**Do Not Modify (cần review):**
- `src/lib/ai/providers/*` — đổi provider/model cần test fallback.
- `supabase/migrations/*` — đã apply, sửa phải tạo migration mới.
- `public/openapi.json:1` — contract public API.

**Ask First:**
- `src/lib/sheets-processor.ts` — logic Review ảnh hưởng 500 dòng limit.
- `pdf-overlay-transform.ts` / `pdf-overlay-bake.ts` — sai remap sẽ lệch watermark.

**Never:**
- Commit `.env.local`, `SUPABASE_SERVICE_ROLE_KEY`, API keys.
- Dùng `any` trong TypeScript, `default export` (dùng named exports).

## 11) Parallel Build — oh-my-opencode đã cài

- **Mặc định:** Dùng **Task tool chạy song song**. Mỗi Task khai báo `file ownership` trước khi edit (VD: Task A `sheets-workspace.tsx`, Task B `pdf-workspace.tsx`). Nếu 2 Task chạm chung file → tách nhỏ hơn hoặc báo conflict, không đè.
- **Thực tế:** `oh-my-opencode` dùng `Sisyphus` + `background-agent` (`delegate_task` → `background_output`, `providerConcurrency`/`modelConcurrency`) — parallel sessions chung workdir, agent tự né đè. Đã đủ cho 2-3 Task cùng lúc.
- **Khi cần worktree:** Chỉ khi ≥4 Task song song và bắt buộc sửa chung file. Khi đó: `git worktree add ../mad-worktrees/<task> -b feat/<task>` (local branch, chưa push GitHub) → mỗi agent 1 workdir riêng → xong `git push` rồi merge về `master`. Plugin `Nistro-dev/opencode-mad` (`/mad`) tự động hóa nếu cần. Bình thường **không cần worktree**.

## 12) Plan Research Protocol — bắt buộc cho mọi plan

Trước khi đề xuất giải pháp, trả lời đủ 4 câu (dùng `Grep/Glob` + `websearch`/`webfetch`):

1. **Đã có ai làm chưa?** — Tìm trong codebase (`grep`) + GitHub 2026 (`websearch` “topic 2026 github”).
2. **Repo public nào?** — Ghi URL + stars/maintained, có clone được không?
3. **Áp dụng được không?** — So sánh stack, license, trade-off với `sean-office`.
4. **Tài liệu tốt nhất?** — Link docs/spec chính thống, không đoán URL.

Chỉ khi “chưa có” mới đề xuất cách làm tốt nhất từ first principles và ghi rõ trade-off.

## 13) Quyết định & Rule đã thống nhất

- Không thu phí — giữ AGPL-3.0, bán thì tạo repo mới.
- Không mua gói AI — chỉ free tier (Gemini 1k/ngày, Groq No-limit), DeepSeek/Ideogram để sẵn chưa nạp.
- Không thay stack B2/Supabase/Vercel.
- OmniRoute đã bỏ 2026-09-07 (401).
- Image gen giữ **canvas overlay 0$** (không gen nền flux/gpt-image).
- Review header-first, 500 dòng, filter AND.
- AI Fix: deterministic trước → AI, retry 1 lần nếu rỗng → báo “queue busy”.
- Model toàn cục: `opencode/muse-spark-1.2-free` — `build: high`, `plan: xhigh` (`~/.config/opencode/opencode.jsonc:2`).

## 14) Trạng thái hiện tại

**Đã ship đến `5451895`:** PDF editor + sidebar SmallPDF, overlay rotation fix, hero uploads, sticky toolbar, EN/VI, HR CV in-dev, Apply-all, `/word` route, AGPL, AI Enhance v0.2.0 (gateway fallback, Sheets AI Fix queue + Undo, PDF/Word Vision + canvas), rate limit, public API+MCP, 11/11 tests, RAG V1, Filter per-column + date/i18n fixes.

**Backlog:** HR CV upload-first, server-mode wiring, xóa legacy PDF board, FLUX background, queue worker production (hiện in-process FIFO — Vercel serverless có thể freeze, cần cron).

## 15) Nhật ký cập nhật (AI phải ghi sau mỗi thay đổi)

- **2026-09-02:** Khởi tạo CONTEXT.md — `feat/ai-gateway` v0.2.0, double fallback + VPS swap 2G.
- **2026-09-03:** Port Plan Phase 1+2: `env.ts`, `gateway.ts`, gemini/groq/omniroute, Sheets AI Map, Image Translate, public API+MCP, build 25/25.
- **2026-09-07:** Bỏ OmniRoute (401), fix AI Map toolbar; Supabase `seanoffice` + `ai_jobs` + Review v2 + AI queue + RAG 768.
- **2026-09-07:** Gemini `2.5→3.5-flash-lite`, Groq `compound-mini`+`gpt-oss-120b`, prefer groq/gemini, 11/11 tests.
- **2026-09-08:** Sheets `f403585`+`855ca4d` — Filter per-column, Review type-wide + 500 limit, icon actions, RAG polish; deploy `5451895`.
- **2026-09-08:** Tạo `AGENTS.md` — tổng hợp `CONTEXT.md`+`SEAN_OFFICE_PORT_PLAN.md`+`README.md`; cấu hình `xhigh`/`high` + `instructions: ["AGENTS.md"]`.
- **2026-09-08 (tinh gọn):** Tinh gọn `AGENTS.md` 213→~230 dòng — thêm Commands/Boundaries/Parallel Build/Plan Research Protocol; xóa `agent.md` thừa; tối ưu cho `oh-my-opencode` Task song song.
- **2026-09-09:** Sheets finalize + UI polish — AI queue 20s/bulk/retry/pumpQueue, cursor-pointer toàn app (button.tsx), Radix TooltipProvider 150ms (toolbar-icon-button.tsx, app-shell.tsx) — `button.tsx, toolbar-icon-button.tsx, app-shell.tsx, jobs.ts, providers/*`
- _(Thêm dòng mới sau mỗi commit — `YYYY-MM-DD: tóm tắt - file - commit`)_

## 16) Hướng dẫn cho AI khi mở chat mới

1. Đọc **toàn bộ file này** trước khi trả lời.
2. Feature/fix → tạo TODO, xác nhận `pwd`, chỉnh file có sẵn, chạy `npm run build`/`npm run test` khi liên quan AI/sheets.
3. Xong → cập nhật mục 15) + `Last updated` trên đầu + tóm tắt file đổi & cách kiểm chứng.
4. Giữ tiếng Việt có dấu, không emoji trừ khi được yêu cầu.

---
*File này là nguồn duy nhất cho AI khi khởi động. `CONTEXT.md`/`SEAN_OFFICE_PORT_PLAN.md` giữ làm lịch sử chi tiết.*
