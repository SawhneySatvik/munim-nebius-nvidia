// Secret-value scan over captured output (T-009 gate): every line of every file is passed through the config
// module's redaction; a line it would change contains a secret value. Prints file names and counts only.
//   node scripts/dev/secret-scan.ts <file>…
// Values scanned for: every secret-named `.env` variable (and the password inside each connection string), the
// role passwords, service secret and run-token private key under `.run/` and `.run/local/`. Exit 1 on any hit,
// and also when nothing was scanned for or no line was read (a scan that cannot fail proves nothing).
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { loadRepoConfig } from "../../packages/config/src/index.ts";

const root = resolve(import.meta.dirname, "../..");
const files = process.argv.slice(2);
if (files.length === 0) {
  console.error("secret-scan: FAIL — no files given");
  process.exit(1);
}
const configs = [join(root, ".run"), join(root, ".run", "local")].map((runDir) => {
  const cfg = loadRepoConfig(root, { ...process.env, MUNIM_RUN_DIR: runDir });
  return { cfg, values: cfg.registerRunSecrets() };
});
const values = configs.reduce((n, c) => n + c.values, 0);
let lines = 0;
let hits = 0;
for (const f of files) {
  if (!existsSync(f)) {
    console.error(`secret-scan: FAIL — ${f} does not exist`);
    process.exit(1);
  }
  let fileHits = 0;
  const text = readFileSync(f, "utf8").split("\n");
  for (const line of text) if (configs.some(({ cfg }) => cfg.redact(line) !== line)) fileHits++;
  lines += text.length;
  hits += fileHits;
  console.log(`secret-scan: ${f}: ${text.length} lines, ${fileHits} hit(s)`);
}
console.log(`secret-scan: ${values} secret value forms scanned for, ${files.length} file(s), ${lines} lines, ${hits} hit(s)`);
if (values === 0 || lines === 0) {
  console.error("secret-scan: FAIL — nothing to scan for or nothing scanned");
  process.exit(1);
}
process.exit(hits === 0 ? 0 : 1);
