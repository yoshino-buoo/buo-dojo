import { chromium } from "@playwright/test";
import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";

// Start the development server before running this optional artwork export.
const systemChrome =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const browser = await chromium.launch(
  existsSync(systemChrome) ? { executablePath: systemChrome } : {},
);
try {
  const page = await browser.newPage();
  await page.goto(process.argv[2] || "http://localhost:4173/");
  const bytes = await page.evaluate(async () => {
    const { renderLinkPreview } = await import("./share-card.js");
    const blob = await renderLinkPreview();
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  });
  await writeFile(
    new URL("../assets/link-preview.png", import.meta.url),
    Buffer.from(bytes),
  );
  console.log("Exported assets/link-preview.png (1200 × 630).");
} finally {
  await browser.close();
}
