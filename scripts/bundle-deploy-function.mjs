// Produces a compact single-file build of the `interview` edge function for deployment through
// APIs that take file contents directly (e.g. the Supabase MCP). Local modules are inlined;
// npm packages stay as bare imports resolved by deno.json at runtime.
// The normal path is still: `supabase functions deploy interview` (uses the source directly).
import { build } from "esbuild";
import { mkdirSync, copyFileSync } from "node:fs";

const out = "dist-functions/interview";
mkdirSync(out, { recursive: true });
await build({
  entryPoints: ["supabase/functions/interview/index.ts"],
  bundle: true,
  format: "esm",
  platform: "neutral",
  target: "es2022",
  external: ["@supabase/supabase-js", "@anthropic-ai/sdk", "@anthropic-ai/sdk/*", "zod", "node:*"],
  minify: false,
  charset: "utf8",
  legalComments: "none",
  outfile: `${out}/index.ts`,
  banner: { js: "// VocalHire interview edge function — generated bundle. Source: supabase/functions/interview" },
  logLevel: "warning",
});
copyFileSync("supabase/functions/interview/deno.json", `${out}/deno.json`);
console.log(`bundled → ${out}/index.ts`);
