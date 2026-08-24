/**
 * Cross-platform dev restart: free ports, remove stale .next, start next dev.
 * Use after code changes when HMR shows ENOENT / manifest errors.
 */
import { rmSync, existsSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
    ...opts,
  });
  return r.status ?? 1;
}

console.log("[dev:clean] Stopping processes on ports 3000, 3001…");
run("npx", ["--yes", "kill-port", "3000", "3001"]);

// Give Windows time to release file handles on .next
Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2000);

for (const dir of [".next", join(".next", "cache")]) {
  const path = join(root, dir);
  if (existsSync(path)) {
    console.log(`[dev:clean] Removing ${dir}…`);
    rmSync(path, { recursive: true, force: true });
  }
}

console.log("[dev:clean] Starting next dev…");
const nextCli = join(root, "node_modules", "next", "dist", "bin", "next");
const child = spawn(process.execPath, [nextCli, "dev", "--turbopack"], {
  cwd: root,
  stdio: "inherit",
});

child.on("exit", (code) => process.exit(code ?? 0));
