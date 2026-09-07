import { describe, it, expect, vi, beforeEach } from "vitest";
import { AIError } from "@/lib/ai/providers/gemini";

// Mock fetch before importing gateway fallback
const fetchMock = vi.fn();

describe("gateway fallback", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal("fetch", fetchMock);
    process.env.AI_GATEWAY_API_KEY = "test-gateway-key";
    fetchMock.mockReset();
  });

  it("fallback 429 from gemini to groq success", async () => {
    // First call (gemini via gateway) -> 429
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 429,
      text: async () => "rate limit",
      json: async () => ({}),
    } as Response);
    // Second call (groq) -> success
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify({ mappings: [{ source: "a", target: "email", transform: "email" }] }) } }],
        model: "groq/compound-mini",
        usage: { prompt_tokens: 10, completion_tokens: 10 },
      }),
    } as unknown as Response);

    const { completeWithFallback } = await import("@/lib/ai/fallback");
    const res = await completeWithFallback({
      system: "map",
      user: "headers",
      schema: {
        name: "test",
        value: {
          type: "object",
          properties: { mappings: { type: "array", items: { type: "object" } } },
        },
      },
    });
    expect(res.provider).toBe("groq");
    expect(res.provider_chain).toEqual(["gemini", "groq"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("prefer groq tries groq first for text tasks", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify({ mappings: [] }) } }],
        model: "groq/compound-mini",
      }),
    } as unknown as Response);

    const { completeWithFallback } = await import("@/lib/ai/fallback");
    const res = await completeWithFallback({
      system: "map",
      user: "headers",
      prefer: "groq",
    });
    expect(res.provider).toBe("groq");
    expect(res.provider_chain).toEqual(["groq"]);
    const firstBody = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(firstBody.model).toBe("groq/compound-mini");
  });

  it("throws on malformed json_schema retryable", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "not-json{{{ " } }],
        model: "google/gemini-2.5-flash-lite",
      }),
    } as unknown as Response);

    const { parseJson } = await import("@/lib/ai/fallback");
    const content = "not-json{{{";
    expect(() => parseJson(content)).toThrow();
  });

  it("AIError not_configured when no key", async () => {
    delete process.env.AI_GATEWAY_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.GROQ_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    // NOTE: import AIError dynamically AFTER resetModules so instanceof
    // compares against the same module instance used by fallback.ts.
    const { completeWithFallback } = await import("@/lib/ai/fallback");
    const { AIError: FreshAIError } = await import("@/lib/ai/providers/gemini");
    await expect(completeWithFallback({ system: "s", user: "u" })).rejects.toThrow(FreshAIError);
  });
});
