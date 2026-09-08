import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { renderShimmerCheck } from "../../scripts/shimmer-check.mjs";

const html = await readFile(new URL("../../index.html", import.meta.url), "utf8");
const css = await readFile(new URL("../../diagnostics/shimmer.css", import.meta.url), "utf8");

test.use({
  isMobile: true,
  hasTouch: true,
  viewport: { width: 393, height: 668 },
  contextOptions: { reducedMotion: "no-preference" },
});

for (const training of [false, true]) {
  test(`background shimmer keeps moving after repeated ${training ? "hidden" : "normal"} results`, async ({ page }) => {
    await page.route("**/shimmer-check.html", route => route.fulfill({
      contentType: "text/html", body: renderShimmerCheck(html, css),
    }));
    await page.context().route("https://idolmaster-official.jp/**", route => route.fulfill({
      contentType: "text/html", body: "<title>Vote destination</title>",
    }));
    await page.clock.install();
    await page.goto("/shimmer-check.html");
    if (training) await page.locator("#training-toggle").tap();
    await page.locator("#demo-button").tap();
    for (let round = 0; round < 3; round++) {
      await page.locator("#hold-button").focus();
      await page.keyboard.down("Space");
      await page.clock.fastForward(training ? 73100 : 25100);
      await page.keyboard.up("Space");
      await page.clock.runFor(4500);
      await expect(page.locator("#result-dialog")).toBeVisible();
      const vote = page.locator("#vote-button");
      const position = () => vote.evaluate(el => getComputedStyle(el, "::before").backgroundPositionX);
      const first = await position();
      // CSS animation time is real compositor/render time, not the game clock.
      await expect.poll(position).not.toBe(first);
      expect(await vote.evaluate(el => getComputedStyle(el, "::before").pointerEvents)).toBe("none");
      if (round === 2) {
        const popupReady = page.waitForEvent("popup");
        await vote.tap();
        const popup = await popupReady;
        await expect(popup).toHaveURL(/vote\/idol\/yorita_yoshino/);
        await popup.close();
        await page.emulateMedia({ reducedMotion: "reduce" });
        expect(await vote.evaluate(el => getComputedStyle(el, "::before").display)).toBe("none");
      } else await page.locator("#again-button").tap();
    }
  });
}
