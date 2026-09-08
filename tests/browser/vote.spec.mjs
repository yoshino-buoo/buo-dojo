import { test, expect } from "@playwright/test";

async function showResult(page) {
  await page.clock.install();
  await page.goto("/");
  await page.locator("#demo-button").click();
  await page.locator("#hold-button").focus();
  await page.keyboard.down("Space");
  await page.clock.fastForward(1000);
  await page.keyboard.up("Space");
  await expect(page.locator("#result-dialog")).toBeVisible();
}

test.describe("touch vote link", () => {
  test.use({
    hasTouch: true,
    isMobile: true,
    viewport: { width: 393, height: 852 },
    contextOptions: { reducedMotion: "no-preference" },
  });

  test("a touch-only pointer cannot darken the voting link through hover", async ({
    page,
  }) => {
    await showResult(page);
    expect(
      await page.evaluate(() => matchMedia("(hover: hover)").matches),
    ).toBe(false);
    // Inspect resolved colors, without racing background interpolation.
    await page.addStyleTag({
      content: ".vote-button { transition: none !important; }",
    });
    const vote = page.locator("#vote-button");
    const initial = await vote.evaluate(
      (el) => getComputedStyle(el).backgroundColor,
    );
    await vote.hover();
    await expect(vote).toHaveCSS("background-color", initial);
  });

  test("one tap follows the native link with the shimmer running", async ({
    page,
  }) => {
    await page
      .context()
      .route("https://idolmaster-official.jp/**", (route) =>
        route.fulfill({
          contentType: "text/html",
          body: "<title>Vote destination</title>",
        }),
      );
    await showResult(page);
    const vote = page.locator("#vote-button");
    expect(
      await vote.evaluate(
        (el) => getComputedStyle(el, "::before").animationName,
      ),
    ).toBe("vote-shimmer-background");
    const popupReady = page.waitForEvent("popup");
    await vote.tap();
    const popup = await popupReady;
    await expect(popup).toHaveURL(/vote\/idol\/yorita_yoshino/);
    await popup.close();
  });
});

test("a mouse retains the voting link's hover feedback", async ({ page }) => {
  await showResult(page);
  expect(await page.evaluate(() => matchMedia("(hover: hover)").matches)).toBe(
    true,
  );
  await page.locator("#vote-button").hover();
  await expect(page.locator("#vote-button")).toHaveCSS(
    "background-color",
    "rgb(17, 123, 144)",
  );
});
