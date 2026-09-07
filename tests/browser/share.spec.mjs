import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

async function prepare(
  page,
  { mobile = false, delayed = false, failExport = false } = {},
) {
  await page.setViewportSize({ width: 393, height: 740 });
  await page.clock.install();
  await page.addInitScript(
    ({ mobile, delayed, failExport }) => {
      Math.random = () => 0;
      window.__cardText = [];
      window.__cardArt = [];
      window.__shared = [];
      window.__copied = [];
      const paintText = CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.fillText = function (text, ...args) {
        window.__cardText.push({ text, font: this.font });
        return paintText.call(this, text, ...args);
      };
      const paintImage = CanvasRenderingContext2D.prototype.drawImage;
      CanvasRenderingContext2D.prototype.drawImage = function (image, ...args) {
        window.__cardArt.push(image.src);
        return paintImage.call(this, image, ...args);
      };
      const exportImage = HTMLCanvasElement.prototype.toBlob;
      let first = true;
      HTMLCanvasElement.prototype.toBlob = function (...args) {
        if (first && delayed) {
          first = false;
          window.__releaseCard = () =>
            new Promise((resolve) => {
              exportImage.call(
                this,
                (blob) => {
                  args[0](blob);
                  resolve();
                },
                ...args.slice(1),
              );
            });
          return;
        }
        if (first && failExport) {
          first = false;
          args[0](null);
          return;
        }
        return exportImage.apply(this, args);
      };
      Object.defineProperty(navigator, "maxTouchPoints", {
        configurable: true,
        value: mobile ? 5 : 0,
      });
      Object.defineProperty(navigator, "canShare", {
        configurable: true,
        value: ({ files }) => mobile && files?.[0]?.type === "image/png",
      });
      Object.defineProperty(navigator, "share", {
        configurable: true,
        value: async ({ files, text }) => {
          const active = navigator.userActivation.isActive;
          const bytes = new Uint8Array(await files[0].arrayBuffer());
          window.__shared.push({
            text,
            active,
            name: files[0].name,
            type: files[0].type,
            bytes: bytes.length,
            signature: [...bytes.slice(0, 8)],
          });
          if (window.__shareError)
            throw Object.assign(new Error(), { name: window.__shareError });
        },
      });
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: async (text) => window.__copied.push(text),
          write: async (items) =>
            window.__copied.push((await items[0].getType("image/png")).size),
        },
      });
    },
    { mobile, delayed, failExport },
  );
  await page.goto("/");
  await page.locator("#demo-button").click();
}

async function finish(page, duration = 25000) {
  await page.locator("#hold-button").focus();
  await page.keyboard.down("Space");
  await page.clock.fastForward(duration);
  if (duration >= 25000) await page.clock.runFor(2000);
  await page.keyboard.up("Space");
  await expect(page.locator("#result-dialog")).toBeVisible();
}

async function openCard(page) {
  await page.locator("#share-preview-button").click();
  await expect(page.locator("#share-image")).toBeVisible();
}

test("link cards are available to crawlers without JavaScript and reference a deployed PNG", async ({
  browser,
  request,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    await page.goto("http://localhost:4173/");
    const canonical = await page
      .locator('link[rel="canonical"]')
      .getAttribute("href");
    const imageUrl = await page
      .locator('meta[property="og:image"]')
      .getAttribute("content");
    await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute(
      "content",
      "summary_large_image",
    );
    await expect(page.locator('meta[name="twitter:image"]')).toHaveAttribute(
      "content",
      imageUrl,
    );
    await expect(
      page.locator('meta[name="twitter:image:alt"]'),
    ).toHaveAttribute("content", /武・謳・鶯・王/);
    expect(imageUrl.startsWith(canonical)).toBe(true);
    expect(new URL(imageUrl).protocol).toBe("https:");
    const response = await request.get(
      imageUrl.replace(canonical, "http://localhost:4173/"),
    );
    expect(response.ok()).toBe(true);
    expect(response.headers()["content-type"]).toContain("image/png");
    const png = await response.body();
    expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(png.readUInt32BE(16)).toBe(1200);
    expect(png.readUInt32BE(20)).toBe(630);
    expect(png.length).toBeLessThan(1000000);
  } finally {
    await context.close();
  }
});

test("card exports the exact round, full kanji list, and a stable random A/B pose", async ({
  page,
}, testInfo) => {
  await prepare(page);
  await finish(page);
  const glyphs = [
    ...(await page.locator("#result-kanji span").allTextContents()),
    "芳",
  ];
  await openCard(page);
  const drawn = await page.evaluate(() => window.__cardText);
  expect(
    drawn
      .filter((item) => item.font.includes("Dojo Kanji"))
      .map((item) => item.text),
  ).toEqual(glyphs);
  expect(drawn.map((item) => item.text)).toEqual(
    expect.arrayContaining(["25.0", "31", "皆伝", "おためし"]),
  );
  expect(
    await page.evaluate(() =>
      window.__cardArt.some((url) => url.endsWith("character%20A.PNG")),
    ),
  ).toBe(true);
  const firstImage = await page.locator("#share-image").getAttribute("src");
  await page.locator("#share-back").click();
  await openCard(page);
  expect(await page.locator("#share-image").getAttribute("src")).toBe(
    firstImage,
  );

  const downloadReady = page.waitForEvent("download");
  await page.locator("#share-download").click();
  const download = await downloadReady;
  const output = testInfo.outputPath("share-card.png");
  await download.saveAs(output);
  const png = await readFile(output);
  expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  expect(png.readUInt32BE(16)).toBe(1200);
  expect(png.readUInt32BE(20)).toBe(900);
  expect(png.length).toBeGreaterThan(10000);

  await page.locator("#share-back").click();
  await page.evaluate(() => {
    Math.random = () => 0.999999;
    window.__cardText = [];
    window.__cardArt = [];
  });
  await page.locator("#again-button").click();
  await finish(page, 7000);
  const nextGlyphs = await page.locator("#result-kanji span").allTextContents();
  await openCard(page);
  await expect(page.locator("#share-view")).toHaveAttribute("data-pose", "B");
  const nextText = await page.evaluate(() => window.__cardText);
  expect(
    nextText
      .filter((item) => item.font.includes("Dojo Kanji"))
      .map((item) => item.text),
  ).toEqual(nextGlyphs);
  expect(nextText.map((item) => item.text)).not.toContain("皆伝");
  expect(
    await page.evaluate(() =>
      window.__cardArt.some((url) => url.endsWith("character%20B.PNG")),
    ),
  ).toBe(true);
  expect(await page.locator("#share-image").getAttribute("src")).not.toBe(
    firstImage,
  );
});

test("mobile shares a real PNG and caption inside the tap activation; cancellation has no side effects", async ({
  page,
  context,
}) => {
  await prepare(page, { mobile: true });
  await finish(page);
  await expect(page.locator("#share-image")).toHaveAttribute("src", /^blob:/);
  let downloads = 0;
  page.on("download", () => downloads++);
  await page.evaluate(() => {
    window.__shareError = "AbortError";
  });
  await page.locator("#share-button").click();
  await expect(page.locator("#share-native")).toBeEnabled();
  const [shared] = await page.evaluate(() => window.__shared);
  expect(shared).toMatchObject({
    active: true,
    type: "image/png",
    signature: [137, 80, 78, 71, 13, 10, 26, 10],
  });
  expect(shared.bytes).toBeGreaterThan(10000);
  expect(shared.text).toContain("【31文字／25.0秒】！");
  expect(shared.text).toContain("🐚＼ 法螺貝、何秒吹ける？ ／🐚");
  expect(shared.text).toContain(
    "#ぶおー法螺貝道場\n#依田芳乃\n#シンデレラガール総選挙2026",
  );
  expect(downloads).toBe(0);
  expect(context.pages()).toHaveLength(1);
  expect(await page.evaluate(() => window.__copied)).toEqual([]);
  await expect(page.locator("#result-dialog")).toHaveAttribute(
    "data-view",
    "result",
  );

  await page.evaluate(() => {
    window.__shareError = "NotAllowedError";
  });
  await page.locator("#share-button").click();
  await expect(page.locator("#share-native")).toBeHidden();
  await expect(page.locator("#share-web")).toHaveClass(/x-post-button/);
  await expect(page.locator("#share-note")).toContainText("リンクつきでシェア");
  expect(downloads).toBe(0);
  expect(context.pages()).toHaveLength(1);
});

test("desktop X action opens a link draft directly without downloading or opening the result-image view", async ({
  page,
  context,
}) => {
  await context.route("https://x.com/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<title>Draft test</title>",
    }),
  );
  await prepare(page);
  await finish(page, 1200);
  await expect(page.locator("#share-image")).toHaveAttribute("src", /^blob:/);
  let downloads = 0;
  page.on("download", () => downloads++);
  const expectedText = new URL(
    await page.locator("#share-web").getAttribute("href"),
  ).searchParams.get("text");
  const popupReady = page.waitForEvent("popup");
  await page.locator("#share-button").click();
  const popup = await popupReady;
  await popup.waitForLoadState();
  const url = new URL(popup.url());
  expect(url.origin).toBe("https://x.com");
  expect(url.pathname).toBe("/intent/post");
  expect(url.searchParams.get("text")).toBe(expectedText);
  expect(url.searchParams.get("lang")).toBe("ja");
  expect(downloads).toBe(0);
  await expect(page.locator("#result-dialog")).toHaveAttribute(
    "data-view",
    "result",
  );
  expect(await page.evaluate(() => window.__shared)).toEqual([]);
  await popup.close();
  await openCard(page);
  await page.locator("#share-copy-text").click();
  await page.locator("#share-copy-image").click();
  const copied = await page.evaluate(() => window.__copied);
  expect(copied[0]).toBe(expectedText);
  expect(copied[1]).toBeGreaterThan(10000);
});

test("a late export from a previous round cannot replace the replay card", async ({
  page,
}) => {
  await prepare(page, { delayed: true });
  await finish(page, 1200);
  await page.locator("#share-preview-button").click();
  await expect
    .poll(() => page.evaluate(() => Boolean(window.__releaseCard)))
    .toBe(true);
  await page.locator("#share-back").click();
  await page.evaluate(() => {
    Math.random = () => 0.99999;
  });
  await page.locator("#again-button").click();
  await finish(page, 7000);
  await openCard(page);
  const image = await page.locator("#share-image").getAttribute("src");
  const text = await page.locator("#share-web").getAttribute("href");
  await page.evaluate(async () => {
    const original = URL.createObjectURL;
    window.__staleUrls = 0;
    URL.createObjectURL = (...args) => {
      window.__staleUrls++;
      return original(...args);
    };
    await window.__releaseCard();
  });
  expect(await page.locator("#share-image").getAttribute("src")).toBe(image);
  expect(await page.locator("#share-web").getAttribute("href")).toBe(text);
  await expect(page.locator("#share-view")).toHaveAttribute("data-pose", "B");
  expect(await page.evaluate(() => window.__staleUrls)).toBe(0);
});

test("image export failure keeps the X draft available and retry keeps the same round", async ({
  page,
}) => {
  await prepare(page, { failExport: true });
  await finish(page, 7000);
  await page.locator("#share-preview-button").click();
  await expect(page.locator("#share-retry")).toBeVisible();
  const intent = await page.locator("#share-web").getAttribute("href");
  expect(new URL(intent).searchParams.get("text")).toContain("7.0秒");
  await expect(page.locator("#share-image")).toBeHidden();
  await page.locator("#share-retry").click();
  await expect(page.locator("#share-image")).toBeVisible();
  expect(await page.locator("#share-web").getAttribute("href")).toBe(intent);
  await expect(page.locator("#share-view")).toHaveAttribute("data-pose", "A");
});

test("a one-character card remains readable and its preview fits narrow portrait screens", async ({
  page,
}) => {
  await prepare(page);
  await page.setViewportSize({ width: 320, height: 568 });
  await finish(page, 100);
  await openCard(page);
  const text = await page.evaluate(() => window.__cardText);
  expect(
    text
      .filter((item) => item.font.includes("Dojo Kanji"))
      .map((item) => item.text),
  ).toEqual(["武"]);
  const box = await page.locator("#share-image").boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(320);
  expect(box.y + box.height).toBeLessThanOrEqual(568);
  await page.locator("#share-back").click();
  await expect(page.locator("#result-title")).toBeVisible();
  await expect(page.locator("#result-dialog")).toHaveAttribute(
    "aria-labelledby",
    "result-title",
  );
});
