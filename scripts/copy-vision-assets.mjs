// Copies the MediaPipe vision WASM runtime from node_modules into public/ so camera analysis runs
// fully on-device without any third-party CDN. Runs automatically on install/dev/build.
import { copyFileSync, existsSync, mkdirSync } from "node:fs";

const src = "node_modules/@mediapipe/tasks-vision/wasm";
const dest = "public/mediapipe/wasm";
if (!existsSync(src)) {
  console.warn("[vision-assets] @mediapipe/tasks-vision not installed yet; skipping");
  process.exit(0);
}
mkdirSync(dest, { recursive: true });
for (const f of ["vision_wasm_internal.js", "vision_wasm_internal.wasm"]) {
  if (!existsSync(`${dest}/${f}`)) copyFileSync(`${src}/${f}`, `${dest}/${f}`);
}
console.log("[vision-assets] ready in", dest);
