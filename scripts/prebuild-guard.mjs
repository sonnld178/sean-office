/**
 * Stop dev server and clear .next before production build.
 * build + dev sharing .next causes ENOENT / corrupt cache on Windows.
 */
import { rmSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

spawnSync("npx", ["--yes", "kill-port", "3000", "3001"], {
  cwd: root,
  stdio: "inherit",
  shell: process.platform === "win32",
});

Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1500);

const nextDir = join(root, ".next");
if (existsSync(nextDir)) {
  console.log("[prebuild] Clearing .next before production build…");
  rmSync(nextDir, { recursive: true, force: true });
}
