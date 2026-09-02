#!/usr/bin/env node
/**
 * SeanOffice MCP server — wraps public API for Claude/Cursor.
 * Tools: sheets_map, pdf_sign, ai_translate_image
 * Run: npx tsx src/mcp/server.ts  or  npm run mcp:dev
 */

type Tool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (args: Record<string, unknown>) => Promise<unknown>;
};

const BASE = process.env.SEAN_OFFICE_BASE_URL ?? "https://sean-office.vercel.app";

const tools: Tool[] = [
  {
    name: "sheets_map",
    description: "Map spreadsheet columns via AI (headers + sampleRows -> mappings)",
    inputSchema: {
      type: "object",
      properties: {
        headers: { type: "array", items: { type: "string" } },
        sampleRows: { type: "array", items: { type: "object" } },
      },
      required: ["headers"],
    },
    handler: async (args) => {
      const res = await fetch(`${BASE}/api/v1/sheets/map`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(args),
      });
      return res.json();
    },
  },
  {
    name: "pdf_sign",
    description: "Watermark PDF (stub, returns hint; use /pdf workspace for WYSIWYG)",
    inputSchema: {
      type: "object",
      properties: {
        fileName: { type: "string" },
        text: { type: "string" },
      },
      required: ["fileName"],
    },
    handler: async (args) => {
      // For MCP demo: just echo; real impl would upload file
      return { hint: "Use /api/v1/pdf/watermark with multipart file", args, base: BASE };
    },
  },
  {
    name: "ai_translate_image",
    description: "Translate text in image to target language (Gemini Vision -> Groq fallback)",
    inputSchema: {
      type: "object",
      properties: {
        imageBase64: { type: "string", description: "base64 image" },
        targetLang: { type: "string", enum: ["vi", "en", "ja", "ko"] },
      },
      required: ["imageBase64"],
    },
    handler: async (args) => {
      const res = await fetch(`${BASE}/api/ai/image/translate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(args),
      });
      return res.json();
    },
  },
];

// Minimal MCP stdio loop (JSON-RPC 2.0) — compatible with @modelcontextprotocol/sdk if installed
async function main() {
  const stdin = process.stdin;
  stdin.setEncoding("utf-8");
  let buffer = "";
  for await (const chunk of stdin) {
    buffer += chunk;
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const msg = JSON.parse(line) as { id?: number | string; method?: string; params?: { name?: string; arguments?: Record<string, unknown> } };
        if (msg.method === "initialize") {
          process.stdout.write(
            JSON.stringify({
              jsonrpc: "2.0",
              id: msg.id,
              result: {
                protocolVersion: "2024-11-05",
                capabilities: { tools: {} },
                serverInfo: { name: "sean-office-mcp", version: "0.2.0" },
              },
            }) + "\n"
          );
        } else if (msg.method === "tools/list") {
          process.stdout.write(
            JSON.stringify({
              jsonrpc: "2.0",
              id: msg.id,
              result: {
                tools: tools.map((t) => ({
                  name: t.name,
                  description: t.description,
                  inputSchema: t.inputSchema,
                })),
              },
            }) + "\n"
          );
        } else if (msg.method === "tools/call") {
          const name = msg.params?.name ?? "";
          const args = (msg.params?.arguments ?? {}) as Record<string, unknown>;
          const tool = tools.find((t) => t.name === name);
          if (!tool) throw new Error(`Unknown tool: ${name}`);
          const result = await tool.handler(args);
          process.stdout.write(
            JSON.stringify({
              jsonrpc: "2.0",
              id: msg.id,
              result: { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] },
            }) + "\n"
          );
        }
      } catch (e) {
        process.stdout.write(JSON.stringify({ jsonrpc: "2.0", error: { message: (e as Error).message } }) + "\n");
      }
    }
  }
}

if (require.main === module) void main();

export { tools };
