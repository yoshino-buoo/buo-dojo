import { mkdir, rm, cp, stat, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const files = [
  "index.html",
  "styles.css",
  "app.js",
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
// A refreshed page must fetch the current entry script and stylesheet even
// while the host's previous asset responses remain in the browser cache.
let html = await readFile("dist/index.html", "utf8");
for (const file of ["styles.css", "app.js"]) {
  const revision = createHash("sha256")
    .update(await readFile(`dist/${file}`))
    .digest("hex")
    .slice(0, 12);
  html = html.replace(`"./${file}"`, `"./${file}?v=${revision}"`);
}
await writeFile("dist/index.html", html);
console.log("Static site built in dist/ — ready for GitHub Pages.");
