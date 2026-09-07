import { defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";
const systemChrome =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
export default defineConfig({
  testDir: "./tests/browser",
  outputDir: ".test-artifacts/layout",
  workers: 1,
  use: {
    baseURL: "http://localhost:4173",
    contextOptions: { reducedMotion: "reduce" },
    launchOptions: existsSync(systemChrome)
      ? { executablePath: systemChrome }
      : {},
  },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:4173",
    reuseExistingServer: true,
  },
});
