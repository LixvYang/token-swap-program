import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = path.dirname(fileURLToPath(import.meta.url));

const scripts = [
  "localnet-admin-lifecycle.mjs",
  "localnet-user-flow.mjs",
  "localnet-token2022-flow.mjs",
];

for (const script of scripts) {
  console.log(`\n=== running ${script} ===`);
  const result = spawnSync(process.execPath, [path.join(currentDir, script)], {
    stdio: "inherit",
    env: process.env,
  });

  if (result.status !== 0) {
    process.exitCode = result.status ?? 1;
    break;
  }
}
