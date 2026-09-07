import { test, expect } from "@playwright/test";

async function prepare(page, viewport = { width: 393, height: 852 }) {
  await page.setViewportSize(viewport);
  await page.clock.install();
  await page.goto("/");
  await page.locator("#training-toggle").click();
  await page.locator("#demo-button").click();
  await page.locator("#hold-button").focus();
  await page.keyboard.down("Space");
}

async function finish(page) {
  await page.clock.fastForward(73100);
  await expect(page.locator("#dojo")).toHaveAttribute(
    "data-state",
    "celebrating",
  );
  await expect(page.locator("#speech")).toHaveText(
    "……これは、これはー。\nわたくしも驚きましてー……",
  );
  await expect(page.locator("#speech")).toHaveCSS("opacity", "1");
  await expect(page.locator("#finale-kanji")).toHaveText("依田芳乃");
  await page.keyboard.up("Space");
  await page.clock.runFor(4400);
  await expect(page.locator("#result-dialog")).toBeVisible();
}

test("hidden switch preserves layout and all four stages, then returns to normal rules when switched off", async ({
  page,
}) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await page.clock.install();
  await page.goto("/");
  const toggle = page.locator("#training-toggle");
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  const stage = await page.locator(".stage").boundingBox();
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await expect(page.locator("#speech")).toHaveText(
    "では、さらなる高みへ参りましょうー",
  );
  expect(await page.locator(".stage").boundingBox()).toEqual(stage);
  await page.locator("#demo-button").click();
  await expect(toggle).not.toBeVisible();
  await page.locator("#hold-button").focus();
  await page.keyboard.down("Space");
  await page.clock.fastForward(25000);
  await expect(page.locator("#dojo")).toHaveAttribute("data-state", "blowing");
  await expect(page.locator("#dojo")).toHaveAttribute("data-phase", "regular");
  await page.clock.fastForward(23100);
  await expect(page.locator("#live-count")).toHaveText("69");
  await expect(page.locator("#charge-name")).toBeVisible();
  await expect(page.locator("#charge-caption")).toHaveText("隠し修行 · 1 / 4");
  for (let earned = 1; earned <= 3; earned++) {
    await page.clock.fastForward(5000);
    await expect(page.locator("#live-count")).toHaveText(String(69 + earned));
    await expect(page.locator('#charge-name [data-earned="true"]')).toHaveCount(
      earned,
    );
    await expect(page.locator("#charge-caption")).toHaveText(
      `隠し修行 · ${earned + 1} / 4`,
    );
  }
  await expect(page.locator("#charge-remaining")).toHaveText("10");
  expect(await page.locator(".stage").boundingBox()).toEqual(stage);
  await page.clock.fastForward(10000);
  await expect(page.locator("#speech")).toHaveText(
    "……これは、これはー。\nわたくしも驚きましてー……",
  );
  await page.keyboard.up("Space");
  await page.clock.runFor(4400);
  await expect(page.locator("#result-overline")).toHaveText("本日の、ひと吹き");
  await expect(page.locator("#super-achievement")).toHaveCount(0);
  await expect(page.locator("#result-stamp")).toHaveText("超・\n皆伝");
  await expect(page.locator("#result-stamp")).toHaveAttribute(
    "aria-hidden",
    "false",
  );
  await expect(page.locator("#result-time")).toHaveText("73.0");
  await expect(page.locator("#result-count")).toHaveText("73");
  await expect(page.locator("#result-final-kanji")).toHaveText("依田芳乃");
  await page.locator("#result-close").click();
  await expect(toggle).toBeVisible();
  await toggle.click();
  await page.locator("#demo-button").click();
  await page.locator("#hold-button").focus();
  await page.keyboard.down("Space");
  await page.clock.fastForward(25100);
  await page.keyboard.up("Space");
  await page.clock.runFor(2000);
  await expect(page.locator("#result-time")).toHaveText("25.0");
  await expect(page.locator("#result-count")).toHaveText("31");
  await expect(page.locator("#result-stamp")).toHaveText("皆伝");
  await expect(page.locator("#result-dialog")).toHaveAttribute(
    "data-super",
    "false",
  );
  await expect(page.locator("#super-achievement")).not.toBeVisible();
});

test("ending before the last name preserves earned glyphs and never grants super mastery", async ({
  page,
}) => {
  await prepare(page);
  await page.clock.fastForward(72900);
  await page.keyboard.up("Space");
  await expect(page.locator("#result-dialog")).toHaveAttribute(
    "data-super",
    "false",
  );
  await expect(page.locator("#result-count")).toHaveText("72");
  await expect(page.locator("#result-kanji > span")).toHaveCount(72);
  expect(
    (await page.locator("#result-kanji > span").allTextContents()).slice(-3),
  ).toEqual(["依", "田", "芳"]);
  await expect(page.locator("#mastery-award")).not.toBeVisible();
  await page.locator("#again-button").click();
  await expect(page.locator("#dojo")).toHaveAttribute("data-phase", "regular");
  await page.keyboard.down("Space");
  await page.clock.fastForward(7300);
  await page.keyboard.up("Space");
  await expect(page.locator("#result-stamp")).toHaveText("依田\n芳乃");
  await expect(page.locator("#result-dialog")).toHaveAttribute(
    "data-yoshino",
    "true",
  );
});

for (const viewport of [
  { width: 320, height: 568 },
  { width: 375, height: 667 },
  { width: 393, height: 852 },
  { width: 430, height: 932 },
]) {
  test(`all 73 hidden-course glyphs fit at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await prepare(page, viewport);
    await finish(page);
    await expect(page.locator("#result-kanji > span")).toHaveCount(69);
    const size = await page.locator("#result-kanji").evaluate((el) => {
      const dialog = document.querySelector("#result-dialog");
      const tiles = [
        ...el.children,
        document.querySelector("#result-final-kanji"),
      ];
      return {
        width: el.clientWidth,
        scrollWidth: el.scrollWidth,
        height: el.clientHeight,
        scrollHeight: el.scrollHeight,
        bottom: Math.max(
          ...tiles.map((tile) => tile.getBoundingClientRect().bottom),
        ),
        dialogHeight: dialog.clientHeight,
        dialogScroll: dialog.scrollHeight,
        font: parseFloat(getComputedStyle(el.firstElementChild).fontSize),
      };
    });
    expect(size.scrollWidth).toBeLessThanOrEqual(size.width + 1);
    expect(size.scrollHeight).toBeLessThanOrEqual(size.height + 1);
    expect(size.bottom).toBeLessThan(viewport.height);
    expect(size.font).toBeGreaterThanOrEqual(12);
    if (viewport.height >= 667)
      expect(size.dialogScroll).toBeLessThanOrEqual(size.dialogHeight + 1);
  });
}

test("hidden result cards draw every glyph, earned names and the super seal for both poses", async ({
  page,
}) => {
  await prepare(page);
  await finish(page);
  await page.locator("#share-preview-button").click();
  await expect(page.locator("#share-image")).toBeVisible();
  await expect(page.locator("#share-image")).toHaveAttribute("alt", /超・皆伝/);
  expect(
    new URL(
      await page.locator("#share-web").getAttribute("href"),
    ).searchParams.get("text"),
  ).toContain("隠し修行モード・超・皆伝 達成！");
  const exports = await page.evaluate(async () => {
    const glyphs = [...document.querySelector("#share-view").dataset.glyphs];
    const { renderShareCard } = await import("/share-card.js");
    const drawn = [];
    const original = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (text, ...args) {
      drawn.push({ text, font: this.font });
      return original.call(this, text, ...args);
    };
    try {
      const results = [];
      for (const pose of ["A", "B"]) {
        drawn.length = 0;
        const blob = await renderShareCard(
          {
            glyphs,
            mode: "demo",
            durationMs: 73000,
            training: true,
            mastery: true,
            earned: ["依", "田", "芳", "乃"],
          },
          pose,
        );
        results.push({ size: blob.size, drawn: [...drawn], glyphs });
      }
      return results;
    } finally {
      CanvasRenderingContext2D.prototype.fillText = original;
    }
  });
  for (const result of exports) {
    expect(result.size).toBeGreaterThan(100000);
    expect(
      result.drawn
        .filter((item) => item.font.includes("Dojo Kanji"))
        .map((item) => item.text),
    ).toEqual(result.glyphs);
    expect(result.drawn.map((item) => item.text)).toEqual(
      expect.arrayContaining(["超・", "皆伝", "73.0", "73"]),
    );
  }
});
