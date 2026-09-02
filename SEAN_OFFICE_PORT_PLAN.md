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
*Plan này được tạo từ `day-frame/docs` để mang sang repo `sean-office`. Không chứa logic thu phí.*
