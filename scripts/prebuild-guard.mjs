/**
 * Clear .next before production build.
 * Dev now uses .next-dev (next.config.ts), build uses .next — no conflict on Windows,
 * so we no longer kill dev server on port 3000/3001 during build.
 * Option 3: keep dev alive while verifying build.
 */
import { rmSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// Build output is .next (production), dev uses .next-dev — no need to kill dev
const nextDir = join(root, ".next");
if (existsSync(nextDir)) {
  console.log("[prebuild] Clearing .next before production build (dev keeps .next-dev)…");
  rmSync(nextDir, { recursive: true, force: true });
}
