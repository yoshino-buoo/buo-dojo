import { mkdir, rm, cp, stat, readFile, writeFile } from "node:fs/promises";
import { renderShimmerCheck } from "./shimmer-check.mjs";
const files = [
  "index.html",
  "styles.css",
  "app.js",
  "touch.js",
  "breath.js",
  "haptics.js",
  "analytics.js",
  "config.js",
  "share.js",
  "share-card.js",
  "favicon.svg",
  ".nojekyll",
  "assets",
  "diagnostics",
];
for (const file of files) await stat(file);
await rm("dist", { recursive: true, force: true });
await mkdir("dist");
for (const file of files)
  await cp(file, `dist/${file}`, {
    recursive: true,
    filter: (source) => !source.endsWith(".DS_Store"),
  });
await writeFile(
  "dist/shimmer-check.html",
  renderShimmerCheck(
    await readFile("index.html", "utf8"),
    await readFile("diagnostics/shimmer.css", "utf8"),
  ),
);
console.log("Static site built in dist/ — ready for GitHub Pages.");
