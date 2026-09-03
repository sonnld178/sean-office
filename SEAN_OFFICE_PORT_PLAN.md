# Sean Office — Port Plan (Free, Public, AI-Enhanced)

> Source: https://sean-office.vercel.app / https://github.com/sonnld178/sean-office
> Goal: Nâng cấp `sean-office` thành **port xin việc remote** (Product/AI Application Engineer) + demo thật cho HR. **Không thu phí, không bán source**. Public AGPL-3.0, chạy 100% free tier. Nếu đông user → làm dự án khác polish để bán credit.

## 1) Mục tiêu & Phi mục tiêu

**Mục tiêu:**
- HR vào vercel.app dùng được ngay: Sheets SchemaMap, Word Fill/Clean/Extract, PDF Sign/Watermark/Merge, HR CV workflow (giữ nguyên Local mode WASM/WYSIWYG).
- Tech team vào GitHub thấy: cấu trúc hệ thống, tối ưu, bảo mật, AI Gateway fallback, streaming, API/MCP.
- Demo thật, chạy được, `git push -> Vercel` giữ như hiện tại.

**Phi mục tiêu (cho dự án này):**
- Không thu phí, không dual license, không private repo.
- Không mua gói AI trả phí (chỉ cấu hình sẵn DeepSeek/Ideogram làm fallback chưa nạp tiền).
- Không thay B2/Supabase/Vercel stack.

## 2) Stack giữ nguyên + thêm

- Giữ: Next.js 15, Tailwind v4, shadcn, pdf-lib/pdfjs, mammoth, xlsx, Vercel, Supabase (chỉ cho rate limit/log nếu cần), B2 (nếu lưu tạm).
- Thêm: `Vercel AI Gateway` (1 key duy nhất trong code), `ai` (Vercel AI SDK) optional cho streaming. Không thêm HF $9.

## 3) Kiến trúc AI Gateway (1 key)

```
Browser (WASM local) -> Next.js API (/api/ai/*) -> Vercel AI Gateway (AI_GATEWAY_API_KEY)
  -> Gemini 2.5 Flash Lite (free, 1k req/ngày) -> Groq compound-mini (No limit, free) -> DeepSeek V3 (paid fallback, chưa nạp)
  Vision/Gen ảnh: Gemini Vision (đọc) -> Cloudflare Workers AI / HF FLUX schnell (free, ảnh không chữ) -> Ideogram (chưa nạp, chỉ để sẵn)
```

- Webapp chỉ đọc 1 env: `AI_GATEWAY_API_KEY` (hoặc `GEMINI_API_KEY` + `GROQ_API_KEY` nếu gọi trực tiếp, nhưng khuyên dùng Gateway để 1 key).
- Fallback logic trong `src/lib/ai/gateway.ts`: retry 429/5xx sang provider kế tiếp, log `provider_chain` vào `ai_runs` nếu có Supabase.

## 4) Giấy phép

- Giữ `AGPL-3.0` trong repo + footer. Không cần dual license lúc này. Khi bán SaaS khác thì làm repo mới với license thương mại.

## 5) Phân rã công việc (thứ tự build)

### Phase 1 — AI Enhance (2 tuần, ưu tiên để có demo HR+Tech)
1. **Setup Gateway & Env** — Tạo key Gemini AI Studio + Groq free, add vào Vercel Env (`AI_GATEWAY_API_KEY`), thêm `.env.example` entry, tạo `src/lib/env.ts` helper `aiGatewayEnv()`. Test `curl` gateway.
2. **Tạo `src/lib/ai/gateway.ts` + `providers/gemini.ts`, `providers/groq.ts`** — Interface `complete({system,user,schema,temperature})`, hỗ trợ `json_schema` strict như `day-frame/src/lib/ai/openrouter.ts:1`. Timeout 20s, circuit breaker đơn giản.
3. **Migrate Sheets: AI Map** — Thêm nút `AI Map` cạnh `Map` hiện tại. Gọi `POST /api/ai/sheets/map` -> gateway đoán schema, trả mapping suggestion -> show diff preview trước khi apply. Giữ `Local mode`.
4. **Nâng PDF/Word: AI Translate Image** — Thêm nút `AI Translate Image` trong `/pdf` và `/word`. Flow: upload scan -> `POST /api/ai/image/translate` (Gemini Vision đọc + dịch text) -> preview ảnh/PDF mới (dùng FLUX free nếu cần gen nền, hoặc chỉ overlay text bằng canvas để giữ WYSIWYG). 
5. **API routes + Rate limit** — Tạo `src/app/api/ai/sheets/map/route.ts` và `src/app/api/ai/image/translate/route.ts`, reuse pattern `ai_runs` rate limit 10 req/phút từ `day-frame/src/app/api/ai/extract/route.ts:2`. Log `model, duration, provider_chain`.
6. **UI/UX Polish** — Streaming token (nếu dùng `ai` SDK), skeleton, error retry, toast `sonner`. Cập nhật `README.md` section `AI Enhance`.

### Phase 2 — Platform Showcase (1 tuần, làm sau Phase 1, optional nhưng wow)
7. **Public API** — `POST /api/v1/sheets/map`, `POST /api/v1/pdf/watermark`, `POST /api/v1/ai/extract` (public, chỉ rate limit, không auth). Thêm `openapi.json` đơn giản.
8. **MCP Server** — `src/mcp/server.ts` wrapper quanh API trên: tools `sheets_map`, `pdf_sign`, `ai_translate_image`. Thêm script `mcp:dev` và docs `MCP.md` để Claude/Cursor gọi `npx sean-office-mcp`.
9. **Eval & Tests** — `tests/ai/gateway.test.ts` mock fetch, test fallback 429 -> success, test json_schema malformed retry.

### Phase 3 — Docs & Deploy
10. **Docs** — Cập nhật `README.md`, `CONTEXT.md` với kiến trúc gateway, sơ đồ fallback, GIF demo HR.
11. **Deploy** — `git push -> vercel --prod`, verify `https://sean-office.vercel.app` chạy Local + AI Enhance.

## 6) File map (dự kiến trong `sean-office` repo)

```
src/lib/env.ts                 # thêm aiGatewayEnv()
src/lib/ai/gateway.ts           # NEW - entry duy nhất
src/lib/ai/providers/gemini.ts  # NEW
src/lib/ai/providers/groq.ts    # NEW
src/lib/ai/fallback.ts          # NEW - retry chain
src/app/api/ai/sheets/map/route.ts
src/app/api/ai/image/translate/route.ts
src/app/api/v1/...               # Phase 2
src/mcp/server.ts               # Phase 2
tests/ai/gateway.test.ts
.env.example                     # thêm AI_GATEWAY_API_KEY, GROQ_API_KEY, GEMINI_API_KEY
README.md, CONTEXT.md
```

## 7) Env

```
# Vercel Env (Production + Preview + Development)
AI_GATEWAY_API_KEY=  # Vercel AI Gateway key (1 key duy nhất, khuyên dùng)
# Nếu không dùng Gateway, thay bằng:
GEMINI_API_KEY=
GROQ_API_KEY=
# Chưa cần nạp:
DEEPSEEK_API_KEY=
HF_TOKEN=
```

## 8) Tiêu chí chấp nhận (Acceptance)

- [ ] HR up 1 Excel lộn xộn -> bấm AI Map -> ra mapping đúng >80% không cần sửa.
- [ ] HR up ảnh bill tiếng Anh -> bấm AI Translate -> ra ảnh/PDF tiếng Việt giữ layout, chữ không lỗi nặng.
- [ ] Thử tắt Gemini (mock 429) -> tự fallback sang Groq compound-mini thành công, log provider_chain.
- [ ] `git push` deploy Vercel xanh, Lighthouse >90, không lỗi `AI is not configured` khi thiếu key (show toast).
- [ ] README có GIF + API/MCP docs để tech team clone chạy `npm run dev` trong 2 phút.

## 9) Rủi ro & Giảm thiểu

- Free tier 429: Đã có fallback No limit (compound-mini). Thêm queue + toast "AI bận, đang thử provider khác...".
- HF/Cloudflare gen ảnh chậm: Dùng canvas overlay text thay vì gen lại toàn ảnh nếu cần tốc độ.
- Vercel AI Gateway chưa có ở VN: fallback gọi trực tiếp Gemini/Groq nếu gateway fail.

## 10) Bước tiếp theo khi chuyển chat

1. Clone `sonnld178/sean-office`, tạo branch `feat/ai-gateway`.
2. Làm theo Phase 1 từ task 1 -> 6, mỗi task 1 commit.
3. Khi Phase 1 xong, tag `v0.2.0-ai-port` và gửi link Vercel + GitHub cho HR/Tech.

---

## 11) Nhật ký thực thi (Chat 2026-09-03) — Double fallback + OmniRoute VPS

**Bối cảnh:** Repo `sonnld178/sean-office` clone vào `D:\1. Sơn work\1.Webapp`, branch `feat/ai-gateway` (từ `master a2ac5e1`). Thực thi song song không conflict, giữ tên branch chuyên nghiệp (solo). `git push` 3 lần: `9f8f736` (AI Gateway), `1bd434c` (samples), `67801c5` (OmniRoute combo).

**Đã build (Phase 1+2) — song song 4 nhóm file:**
- `src/lib/env.ts:1` — `aiGatewayEnv()` hỗ trợ `OMNIROUTE_BASE_URL` (default `http://187.52.126.101:20128`), `OMNIROUTE_API_KEY`, `AI_GATEWAY_API_KEY`, `GEMINI_API_KEY`, `GROQ_API_KEY`, `hasKey`. `.env.example:1` cập nhật combo `OMNIROUTE_BASE_URL` + fallback keys.
- `src/lib/ai/gateway.ts:1`, `providers/gemini.ts:1` (Gateway `ai-gateway.vercel.sh` + direct `generativelanguage.googleapis.com`), `providers/groq.ts:1` (`groq/compound-mini`), `providers/omniroute.ts:1` (OpenAI-compatible `POST {base}/v1/chat/completions`, model `google/gemini-2.5-flash-lite`, handle `server_busy`/`529`/`503`), `fallback.ts:1` chain `omniroute --busy/402/429/5xx--> gemini --> groq`, `isRetryable()` gồm `server_busy`/`402`/`403`/`529`, timeout 20s, `json_schema` strict, `provider_chain` log, `rate-limit.ts:1` 10 req/phút.
- **Sheets AI Map:** `src/app/api/ai/sheets/map/route.ts:1` + `src/components/sheets/sheets-workspace.tsx:45` thêm nút `AI Map` (Sparkles) cạnh Map, diff preview, badge `provider`, apply. `POST` nhận `headers` + `sampleRows` → gateway.
- **Image Translate:** `src/app/api/ai/image/translate/route.ts:1` (Vision, multipart/json, 6MB) + `src/components/ai/ai-image-translate-panel.tsx:1` dùng chung `pdf-workspace.tsx:64` (`Languages` → `aiTranslate`) và `docs-workspace.tsx:46`, canvas overlay giữ layout.
- **Public API + MCP:** `src/app/api/v1/sheets/map`, `pdf/watermark`, `ai/extract` + `public/openapi.json:1` + `src/mcp/server.ts:1` (`sheets_map`, `pdf_sign`, `ai_translate_image`, `npm run mcp:dev`) + `tests/ai/gateway.test.ts:1` (fallback 429→groq, busy, not_configured).
- **Build:** `npm install` + `npm run build` 25/25 static, 23.9s, chỉ warning legacy, First Load 102KB.

**Vercel AI Gateway config (đã thử):**
- Tạo key `SeanOffice ...37acxC` trong `AI Gateway → API Keys`. `Bring Your Own Key` → `Google`/`Groq` → gặp `HTTP 403 Verification Required: AI Gateway requires valid credit card` → chưa gắn CC nên chưa unlock free credits. **Quyêt:** Dùng direct keys fallback, không cần CC cho demo. $5/tháng cho Vercel chỉ để unlock Gateway (pass-through BYOK không tốn token), demo HR <100 call/tháng thì free tier đủ (Gemini 1k/ngày, Groq No-limit).

**Image gen:** So sánh `gpt-image` ($0.02-0.04) vs `flux-schnell` ($0.002-0.003, 10x rẻ, có trên Gateway `black-forest-labs/flux-schnell` via `HF_TOKEN`) vs `sdxl`/`ideogram`. Quyết giữ **canvas overlay** (0$) cho bill, chưa gen nền.

**VPS Hostinger KVM2 (187.52.126.101, srv1929419.hstgr.cloud, Malaysia-KL, 2CPU/8GB/100GB/8TB, Ubuntu 24.04 + Coolify, 8 ngày uptime):**
- Panel `Sử dụng bộ nhớ 72%` (5.8Gi/7.8Gi), `free -h` trước 5.8Gi used 682Mi free 1.9Gi available, `docker ps` 7 containers (`omniroute`, `coolify`, `coolify-db`, `coolify-redis`, `traefik`, `sentinel`, `realtime`), `swapon 0B`, `docker system df` 8.032GB images.
- **Tối ưu:** Tạo swap 2GB `dd if=/dev/zero bs=1M count=2048 status=none` → `truncate -s 2G` sparse bị `swapon: skipping holes`, đổi sang `dd` 1G + `truncate -s 2G` → `chmod 600` → `mkswap` (2GiB UUID) → `swapon` → `free -h Swap:2.0Gi`, `swapon --show /swapfile 2G`, `sync; echo 3 > drop_caches` → free 2.0Gi, available 2.1Gi, panel vẫn 72% vì `used` gồm cache (Hostinger không tính swap). `docker prune` Reclaimable 0B, `docker update --memory` treo nên để Coolify UI set limit sau. Đã đóng SSH `Posh-SSH`, pass `IYRQ'(aNivK56iUO` (cũ `Nhung041099@@` bị `Permission denied`).

**OmniRoute combo (quyết double fallback):**
- Domain OmniRoute: `https://synapi.tech/` (đã gắn, thay `http://187.52.126.101:20128`), port host `20128/tcp` (`docker-proxy`), `ss -tlnp` 20128, Coolify self-host `diegosouzapw/omniroute:3.8.50`.
- Thảo luận: `omirouter` = **OmniRoute** gateway tự host, có fallback nội bộ hàng trăm model free (Groq, Gemini...). User sẽ add `GROQ_API_KEY` + `GEMINI_API_KEY` ngay trong OmniRoute, tạo group `sean-office-combo` (`gemini-2.5-flash-lite` → `groq/compound-mini` → ...). **Quyết:** Dùng **double fallback** cho yên tâm: **OmniRoute (primary, `synapi.tech`) → Vercel Gateway $5 (optional) → Direct Gemini/Groq** (`fallback.ts` đã handle `server_busy`/`402`). Webapp chỉ cần `OMNIROUTE_BASE_URL=https://synapi.tech` + fallback keys, ít key nhất.
- Chưa code thêm — chỉ cập nhật docs, giữ code `67801c5` đã support OmniRoute.

**Trạng thái cuối chat:** Branch `feat/ai-gateway` @ `67801c5` đã push `origin/feat/ai-gateway`, `master` ở `a2ac5e1`, `localhost:3000` Next 15.5.23 Turbopack ready, `npm run build` xanh. Tiếp theo: điền Vercel Env `OMNIROUTE_BASE_URL=https://synapi.tech` + `GEMINI/GROQ` fallback, test `POST /api/ai/sheets/map` và `/api/ai/image/translate` qua domain mới.

---
*Plan này được tạo từ `day-frame/docs` để mang sang repo `sean-office`. Không chứa logic thu phí.*
