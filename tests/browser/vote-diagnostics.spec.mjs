import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { renderVoteCheck, renderVoteProbe } from "../../scripts/vote-check.mjs";

const html = await readFile(new URL("../../index.html", import.meta.url), "utf8");
const diagnostic = await readFile(new URL("../../diagnostics/vote.js", import.meta.url), "utf8");
const probe = await readFile(new URL("../../diagnostics/vote-probe.js", import.meta.url), "utf8");

test.use({
  hasTouch: true,
  isMobile: true,
  viewport: { width: 393, height: 852 },
});

test("normal page never loads the diagnostic observer", async ({ page }) => {
  const requests = [];
  page.on("request", (request) => requests.push(request.url()));
  await page.goto("/");
  await expect(page.locator("#vote-diagnostics")).toHaveCount(0);
  expect(requests.some((url) => url.includes("/diagnostics/"))).toBe(false);
});

for (const mode of ["control", "pointer"]) {
  test(`${mode} probe preserves native voting and has no diagnostic wrapper`, async ({ page }) => {
    await page.route(`**/vote-${mode}.html`, (route) => route.fulfill({
      contentType: "text/html", body: renderVoteProbe(html, probe, mode),
    }));
    await page.context().route("https://idolmaster-official.jp/**", (route) =>
      route.fulfill({ contentType: "text/html", body: "<title>Vote destination</title>" }),
    );
    await page.goto(`/vote-${mode}.html`);
    await expect(page.locator("#vote-diagnostics")).toHaveCount(0);
    expect(await page.evaluate(() => navigator.sendBeacon.toString())).toContain("[native code]");
    await page.locator("#demo-button").tap();
    await page.locator("#hold-button").focus();
    await page.keyboard.down("Space");
    await page.waitForTimeout(800);
    await page.keyboard.up("Space");
    await expect(page.locator("#result-dialog")).toBeVisible();
    const popupReady = page.waitForEvent("popup");
    await page.locator("#vote-button").tap();
    const popup = await popupReady;
    await expect(popup).toHaveURL(/vote\/idol\/yorita_yoshino/);
    await popup.close();
  });
}

for (const cancelClick of [false, true]) {
  test(`diagnostic observes ${cancelClick ? "cancelled" : "native"} clicks without changing navigation`, async ({ page }) => {
    const external = [];
    page.on("request", (request) => {
      if (/^https?:/.test(request.url()) &&
          !request.url().startsWith("http://localhost:4173/") &&
          !request.url().startsWith("https://idolmaster-official.jp/")) {
        external.push(request.url());
      }
    });
    await page.route("**/vote-check.html", (route) => route.fulfill({
      contentType: "text/html", body: renderVoteCheck(html, diagnostic),
    }));
    await page.context().route("https://idolmaster-official.jp/**", (route) =>
      route.fulfill({ contentType: "text/html", body: "<title>Vote destination</title>" }),
    );
    await page.goto("/vote-check.html");
    await page.locator("#demo-button").tap();
    await page.locator("#hold-button").focus();
    await page.keyboard.down("Space");
    await page.waitForTimeout(800);
    await page.keyboard.up("Space");
    await expect(page.locator("#result-dialog")).toBeVisible();
    if (cancelClick) {
      // Validate that the observer can distinguish cancellation; this simulates
      // an event boundary and is not a reproduction of the reported device bug.
      await page.locator("#vote-button").evaluate((link) => {
        link.addEventListener("click", (event) => event.preventDefault(), { once: true });
      });
    }
    let popups = 0;
    page.on("popup", () => popups++);
    const popupReady = cancelClick ? null : page.waitForEvent("popup");
    await page.locator("#vote-button").tap();
    if (popupReady) {
      const popup = await popupReady;
      await expect(popup).toHaveURL(/vote\/idol\/yorita_yoshino/);
      await popup.close();
    }
    await page.locator("#result-close").tap();
    await page.locator("#help-button").tap();
    await page.locator("#vote-diagnostics summary").tap();
    const field = page.getByRole("textbox", { name: "診断ログ" });
    await expect(field).not.toHaveValue("");
    const log = JSON.parse(await field.inputValue());
    expect(log.entries.filter((entry) => entry.type === "click")).toHaveLength(1);
    expect(log.entries.find((entry) => entry.type === "click:after").defaultPrevented).toBe(cancelClick);
    expect(popups).toBe(cancelClick ? 0 : 1);
    expect(external).toEqual([]);
  });
}
