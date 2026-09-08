import { mkdir, rm, cp, stat } from "node:fs/promises";
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
];
for (const file of files) await stat(file);
await rm("dist", { recursive: true, force: true });
await mkdir("dist");
for (const file of files)
  await cp(file, `dist/${file}`, {
    recursive: true,
    filter: (source) => !source.endsWith(".DS_Store"),
  });
console.log("Static site built in dist/ — ready for GitHub Pages.");
