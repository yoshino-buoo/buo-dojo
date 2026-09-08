import { test, expect } from "@playwright/test";

const APP = "https://yoshino-buoo.github.io/buo-dojo/";
const COLLECTOR = "https://collector.example/events";

async function prepare(page, { blocked = false } = {}) {
  const events = [];
  const beaconLoads = [];
  await page.setViewportSize({ width: 393, height: 852 });
  await page.clock.install();
  // Serve the local build under the real origin, intercepting every analytics
  // request so these checks never add fabricated results to the live database.
  await page.route(`${APP}**`, async (route) => {
    const path = route.request().url().slice(APP.length);
    const response = await page.request.get(`http://localhost:4173/${path}`);
    if (path.split("?")[0] === "config.js") {
      const body = (await response.text()).replace(
        /eventsUrl: "[^"]*"/,
        `eventsUrl: "${COLLECTOR}"`,
      );
      expect(body).toContain(COLLECTOR);
      await route.fulfill({ response, body });
    } else await route.fulfill({ response });
  });
  await page.route(
    "https://buo-dojo-events.yoshino-buoo.workers.dev/**",
    (route) => route.abort(),
  );
  await page.route(
    "https://static.cloudflareinsights.com/**",
    async (route) => {
      beaconLoads.push(route.request().url());
      if (blocked) await route.abort();
      else await route.fulfill({ contentType: "text/javascript", body: "" });
    },
  );
  await page.route(COLLECTOR, async (route) => {
    events.push(route.request().postDataJSON());
    if (blocked) await route.abort();
    else
      await route.fulfill({
        status: 204,
        headers: { "Access-Control-Allow-Origin": new URL(APP).origin },
      });
  });
  await page.context().route("https://idolmaster-official.jp/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<title>Voting destination</title>",
    }),
  );
  await page.goto(APP);
  return { events, beaconLoads };
}

async function play(page, duration) {
  await page.locator("#hold-button").focus();
  await page.keyboard.down("Space");
  await page.clock.fastForward(duration);
  await page.keyboard.up("Space");
}

test("one production pageview, separate vote clicks and one numeric record per settled round", async ({
  page,
}) => {
  const { events, beaconLoads } = await prepare(page);
  await page.locator("#demo-button").click();
  await play(page, 7350);
  await expect(page.locator("#result-dialog")).toBeVisible();
  await expect.poll(() => events.length).toBe(1);
  expect(events[0]).toMatchObject({
    kind: "result",
    course: "normal",
    input: "demo",
    durationTenths: 73,
    glyphCount: 11,
    complete: false,
  });
  await page.locator("#share-preview-button").click();
  await expect(page.locator("#share-image")).toBeVisible();
  await page.locator("#share-back").click();
  expect(events.length).toBe(1);
  const popupReady = page.waitForEvent("popup");
  await page.locator("#vote-button").click();
  const popup = await popupReady;
  await expect(popup).toHaveURL(/vote\/idol\/yorita_yoshino/);
  await popup.close();
  await expect.poll(() => events.length).toBe(2);
  expect(events[1]).toMatchObject({
    kind: "vote",
    course: "normal",
    input: "demo",
    durationTenths: 73,
  });

  await page.locator("#again-button").click();
  await play(page, 7350);
  await expect.poll(() => events.length).toBe(3);
  expect(events[2].id).not.toBe(events[0].id);
  await page.locator("#result-close").click();
  await page.locator("#training-toggle").click();
  await page.locator("#demo-button").click();
  await play(page, 73000);
  await expect.poll(() => events.length).toBe(4);
  expect(events[3]).toMatchObject({
    kind: "result",
    course: "training",
    input: "demo",
    durationTenths: 730,
    glyphCount: 73,
    complete: true,
  });
  // Settling a celebration on backgrounding and its old timer cannot double count.
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
    delete document.hidden;
  });
  await page.clock.runFor(4400);
  await expect(page.locator("#result-dialog")).toBeVisible();
  expect(events.length).toBe(4);
  expect(beaconLoads).toHaveLength(1);
});

test("blocked analytics never prevent settling, voting or replaying", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await prepare(page, { blocked: true });
  await page.locator("#demo-button").click();
  await play(page, 1000);
  await expect(page.locator("#result-dialog")).toBeVisible();
  const popupReady = page.waitForEvent("popup");
  await page.locator("#vote-button").focus();
  await page.keyboard.press("Enter");
  const popup = await popupReady;
  await expect(popup).toHaveURL(/vote\/idol\/yorita_yoshino/);
  await popup.close();
  await page.locator("#again-button").click();
  await expect(page.locator("#dojo")).toHaveAttribute(
    "data-state",
    "demo-ready",
  );
  expect(errors).toEqual([]);
});

test.describe("mobile voting with analytics", () => {
  test.use({
    hasTouch: true,
    isMobile: true,
    contextOptions: { reducedMotion: "no-preference" },
  });
  for (const blocked of [false, true]) {
    test(`one tap opens the vote link and reports once with analytics ${blocked ? "blocked" : "available"}`, async ({
      page,
    }) => {
      const { events } = await prepare(page, { blocked });
      await page.locator("#demo-button").tap();
      await play(page, 1000);
      await expect(page.locator("#result-dialog")).toBeVisible();
      const vote = page.locator("#vote-button");
      expect(
        await page.evaluate(() => matchMedia("(hover: hover)").matches),
      ).toBe(false);
      const popupReady = page.waitForEvent("popup");
      await vote.tap();
      const popup = await popupReady;
      await expect(popup).toHaveURL(/vote\/idol\/yorita_yoshino/);
      await popup.close();
      await expect
        .poll(() => events.filter((event) => event.kind === "vote").length)
        .toBe(1);
      expect(events.filter((event) => event.kind === "result")).toHaveLength(1);
    });
  }
});
