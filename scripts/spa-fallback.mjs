// Static hosts without rewrite rules (e.g. GitHub Pages) serve 404.html for unknown paths.
// Copying index.html there makes client-side routes like /app or /i/<token> work on refresh.
import { copyFileSync, existsSync } from "node:fs";
if (existsSync("dist/index.html")) copyFileSync("dist/index.html", "dist/404.html");
