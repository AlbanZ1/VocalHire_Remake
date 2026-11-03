// Bundles the `interview` edge function and its npm dependencies into one self-contained file
// at supabase/functions/interview-local/index.ts, so it can be served by a local edge runtime that
// has no access to the npm registry (e.g. behind a TLS-intercepting proxy). Local testing only —
// the directory is gitignored and never deployed.
import { build } from "esbuild";
import { mkdirSync, writeFileSync } from "node:fs";

const out = "supabase/functions/interview-local";
mkdirSync(out, { recursive: true });
await build({
  entryPoints: ["supabase/functions/interview/index.ts"],
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  mainFields: ["module", "main"],
  conditions: ["deno", "worker", "browser", "import", "default"],
  outfile: `${out}/index.ts`,
  banner: { js: "// @ts-nocheck\n// GENERATED — local testing bundle. Do not edit or deploy." },
  external: ["node:*"],
  logLevel: "warning",
});
writeFileSync(`${out}/deno.json`, JSON.stringify({ imports: {} }, null, 2));
console.log(`bundled → ${out}/index.ts`);
