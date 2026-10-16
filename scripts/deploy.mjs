import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { parseEnv } from "node:util";

// Tokens are loaded only in the deployment process, after the public assets are built.
const env = { ...process.env };
if (!env.CLOUDFLARE_API_TOKEN) {
  try {
    const local = parseEnv(await readFile(".env.cloudflare", "utf8"));
    if (local.CLOUDFLARE_API_TOKEN)
      env.CLOUDFLARE_API_TOKEN = local.CLOUDFLARE_API_TOKEN;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}
const result = spawnSync(
  process.execPath,
  ["node_modules/wrangler/bin/wrangler.js", "deploy", ...process.argv.slice(2)],
  { env, stdio: "inherit" },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
