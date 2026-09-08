import { mkdir, rm, cp, stat, readFile, writeFile } from "node:fs/promises";
import { renderVoteCheck, renderVoteProbe } from "./vote-check.mjs";
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
  "dist/vote-check.html",
  renderVoteCheck(
    await readFile("index.html", "utf8"),
    await readFile("diagnostics/vote.js", "utf8"),
  ),
);
const probeSource = await readFile("diagnostics/vote-probe.js", "utf8");
for (const mode of ["control", "pointer"]) {
  await writeFile(
    `dist/vote-${mode}.html`,
    renderVoteProbe(await readFile("index.html", "utf8"), probeSource, mode),
  );
}
console.log("Static site built in dist/ — ready for GitHub Pages.");
