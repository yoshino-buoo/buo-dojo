import { test, expect } from "@playwright/test";

async function mockVibrator(page, result = true) {
  await page.addInitScript((result) => {
    window.hapticCalls = [];
    Object.defineProperty(navigator, "vibrate", {
      value: (duration) => {
        window.hapticCalls.push(duration);
        return result;
      },
    });
  }, result);
}

async function startDemo(page) {
  await page.locator("#demo-button").click();
  await page.locator("#hold-button").focus();
  await page.keyboard.down("Space");
}

test("vibration toggle fits to the left of help on small phones and starts off", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await mockVibrator(page);
  await page.goto("/");
  const button = page.locator("#vibration-button");
  await expect(button).toBeEnabled();
  await expect(button).toHaveAttribute("aria-pressed", "false");
  const vibration = await button.boundingBox();
  const help = await page.locator("#help-button").boundingBox();
  const ornament = await page.locator(".header-ornament").boundingBox();
  expect(vibration.x + vibration.width).toBeLessThan(help.x);
  expect(vibration.y).toBe(help.y);
  expect(ornament.x + ornament.width).toBeLessThan(vibration.x);
  await startDemo(page);
  await expect
    .poll(() =>
      page
        .locator(".character-c")
        .evaluate((element) => element.getAnimations()[0]?.currentTime || 0),
    )
    .toBeGreaterThan(850);
  expect(await page.evaluate(() => window.hapticCalls)).toEqual([]);
  await page.keyboard.up("Space");
});

test("leaving the page cancels vibration and replay starts with a fresh phase", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await mockVibrator(page);
  await page.goto("/");
  await page.locator("#vibration-button").click();
  await expect(page.locator("#vibration-button")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(await page.evaluate(() => window.hapticCalls)).toEqual([0]);
  await startDemo(page);
  await expect
    .poll(() =>
      page.evaluate(
        () => window.hapticCalls.filter((duration) => duration > 0).length,
      ),
    )
    .toBeGreaterThan(0);
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.keyboard.up("Space");
  await expect(page.locator("#result-dialog")).toBeVisible();
  const calls = await page.evaluate(() => window.hapticCalls);
  expect(calls.at(-1)).toBe(0);
  await page.evaluate(() => {
    delete document.hidden;
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.locator("#again-button").click();
  expect(await page.evaluate(() => window.hapticCalls)).toEqual(calls);
  await page.keyboard.down("Space");
  await expect
    .poll(() => page.evaluate(() => window.hapticCalls.length))
    .toBeGreaterThan(calls.length);
  await page.keyboard.up("Space");
  expect(await page.evaluate(() => window.hapticCalls.at(-1))).toBe(0);
  await page.locator("#result-close").click();
  await page.locator("#vibration-button").click();
  await expect(page.locator("#vibration-button")).toHaveAttribute(
    "aria-pressed",
    "false",
  );
});

test("unsupported browsers show an unavailable switch and can still play", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "vibrate", { value: undefined });
  });
  await page.goto("/");
  await expect(page.locator("#vibration-button")).toBeDisabled();
  await expect(page.locator("#vibration-button")).toHaveAccessibleName(
    "振動：このブラウザは非対応です",
  );
  await startDemo(page);
  await expect(page.locator("#dojo")).toHaveAttribute("data-state", "blowing");
  await page.keyboard.up("Space");
  await expect(page.locator("#result-dialog")).toBeVisible();
});

test("a rejected API request leaves the switch off and explains unavailability", async ({
  page,
}) => {
  await mockVibrator(page, false);
  await page.goto("/");
  await page.locator("#vibration-button").click();
  await expect(page.locator("#vibration-button")).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await expect(page.locator("#toast")).toContainText(
    "この環境では振動を使えません",
  );
  await startDemo(page);
  await page.keyboard.up("Space");
  await expect(page.locator("#result-dialog")).toBeVisible();
  expect(await page.evaluate(() => window.hapticCalls)).toEqual([0]);
});
