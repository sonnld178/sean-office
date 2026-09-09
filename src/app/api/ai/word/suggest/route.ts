import { NextResponse } from "next/server";
import { gateway, AIError } from "@/lib/ai/gateway";
import { checkRateLimit, rateLimitKey } from "@/lib/ai/rate-limit";

// Ghi chú: key của mỗi row là động theo placeholder nên schema ở đây
// dùng dạng tolerant — yêu cầu object có rows là array (tối đa 3 phần tử),
// mỗi item là object; việc kiểm tra đủ key placeholder làm ở bước sanitize.
const WORD_FILL_SCHEMA = {
  type: "object",
  properties: {
    rows: {
      type: "array",
      minItems: 1,
      maxItems: 3,
      items: { type: "object" },
    },
  },
  required: ["rows"],
  additionalProperties: false,
} as const;

type SuggestBody = {
  placeholders?: unknown;
  locale?: unknown;
  fileName?: unknown;
};

type SuggestRow = Record<string, string>;

function isLocale(value: unknown): value is "vi" | "en" {
  return value === "vi" || value === "en";
}

function stripCodeFence(content: string): string {
  return content
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
}

export async function POST(req: Request) {
  const key = rateLimitKey(req);
  const rl = checkRateLimit(key, 10, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many AI requests. Please wait.", code: "rate_limit" },
      { status: 429 }
    );
  }

  try {
    const body = (await req.json().catch(() => null)) as SuggestBody | null;

    const rawPlaceholders = body?.placeholders;
    if (!Array.isArray(rawPlaceholders) || rawPlaceholders.length < 1 || rawPlaceholders.length > 30) {
      return NextResponse.json(
        { error: "placeholders must be an array of 1-30 strings.", code: "bad_request" },
        { status: 400 }
      );
    }
    const placeholders: string[] = [];
    for (const item of rawPlaceholders) {
      if (typeof item !== "string") {
        return NextResponse.json(
          { error: "Each placeholder must be a string of 1-64 characters.", code: "bad_request" },
          { status: 400 }
        );
      }
      const trimmed = item.trim();
      if (trimmed.length < 1 || trimmed.length > 64 || item.length > 64) {
        return NextResponse.json(
          { error: "Each placeholder must be a string of 1-64 characters.", code: "bad_request" },
          { status: 400 }
        );
      }
      placeholders.push(trimmed);
    }

    const locale = body?.locale;
    if (!isLocale(locale)) {
      return NextResponse.json(
        { error: 'locale must be "vi" or "en".', code: "bad_request" },
        { status: 400 }
      );
    }

    const fileName =
      typeof body?.fileName === "string" && body.fileName.trim().length > 0
        ? body.fileName.trim().slice(0, 128)
        : undefined;

    const localeHint =
      locale === "vi"
        ? "Vietnamese context: person names are Vietnamese names, addresses are in Vietnam, phone numbers look like 09xxxxxxxx."
        : "International context: person names and addresses are international (English), phone numbers are international format.";

    const system = [
      "You are a Word mail-merge sample data generator.",
      'Return ONLY valid JSON with the exact shape {"rows":[{"col":"value"}]}.',
      "Rules: exactly 3 rows; every row must contain ALL placeholder keys with a non-empty string value.",
      `Locale: ${locale}. ${localeHint}`,
      "Values must be realistic and consistent within each row (same person per row).",
    ].join(" ");

    const user = [
      `Placeholders: ${JSON.stringify(placeholders)}`,
      `Locale: ${locale}`,
      fileName ? `Template file name: ${fileName}` : "",
      'Generate exactly 3 sample rows as {"rows":[{...},{...},{...}]} where each object key is one placeholder.',
    ]
      .filter((line) => line.length > 0)
      .join("\n");

    const result = await gateway({
      system,
      user,
      schema: { name: "word_fill_suggest", value: WORD_FILL_SCHEMA as unknown as Record<string, unknown> },
      temperature: 0.7,
      maxTokens: 1500,
      prefer: "groq",
    });

    let parsed: { rows?: unknown };
    try {
      parsed = JSON.parse(stripCodeFence(result.content)) as { rows?: unknown };
    } catch {
      throw new AIError("AI returned malformed suggestion data.", "malformed", true);
    }

    if (!parsed || !Array.isArray(parsed.rows) || parsed.rows.length === 0) {
      throw new AIError("AI returned no suggestion rows.", "empty_rows", true);
    }

    const allowed = new Set<string>(placeholders);
    const rows: SuggestRow[] = [];
    for (const raw of parsed.rows) {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
      const record = raw as Record<string, unknown>;
      const row: SuggestRow = {};
      for (const ph of placeholders) {
        const value = record[ph];
        if (typeof value === "string") row[ph] = value;
        else if (typeof value === "number" || typeof value === "boolean") row[ph] = String(value);
        else row[ph] = "";
      }
      // Bỏ key lạ không thuộc placeholders (đã chỉ giữ key thuộc placeholders ở trên).
      for (const k of Object.keys(row)) {
        if (!allowed.has(k)) delete row[k];
      }
      rows.push(row);
      if (rows.length >= 3) break;
    }

    if (rows.length === 0) {
      throw new AIError("AI returned no usable suggestion rows.", "empty_rows", true);
    }

    return NextResponse.json({
      rows: rows.slice(0, 3),
      locale,
      provider: result.provider,
      provider_chain: result.provider_chain,
    });
  } catch (e) {
    if (e instanceof AIError) {
      const status = e.code === "not_configured" ? 503 : e.code === "rate_limit" ? 429 : e.retryable ? 502 : 500;
      return NextResponse.json({ error: e.message, code: e.code, retryable: e.retryable }, { status });
    }
    return NextResponse.json({ error: "Internal error", code: "internal" }, { status: 500 });
  }
}
