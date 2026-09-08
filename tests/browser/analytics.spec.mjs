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
    if (path === "config.js") {
      const body = (await response.text()).replace(
        /eventsUrl: "[^"]*"/,
        `eventsUrl: "${COLLECTOR}"`,
      );
      await route.fulfill({ response, body });
    } else await route.fulfill({ response });
  });
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

test.describe("touch voting", () => {
  test.use({
    hasTouch: true,
    isMobile: true,
    contextOptions: { reducedMotion: "no-preference" },
  });

  test("a completed tap opens the vote link even when its native compatibility click is withheld", async ({
    page,
  }) => {
    const { events } = await prepare(page);
    await page.locator("#demo-button").tap();
    await play(page, 1000);
    await expect(page.locator("#result-dialog")).toBeVisible();
    // Desktop WebKit does not run iOS's content-change click heuristic. Inject
    // its observable failure at the event boundary: no native click reaches
    // the link after a valid touch, while touchend is still delivered.
    await page.evaluate(() => {
      document.addEventListener(
        "click",
        (event) => {
          if (event.isTrusted && event.target.closest("#vote-button")) {
            event.preventDefault();
            event.stopImmediatePropagation();
          }
        },
        true,
      );
    });
    const popupReady = page
      .waitForEvent("popup", { timeout: 2000 })
      .catch(() => null);
    await page.locator("#vote-button").tap();
    const popup = await popupReady;
    expect(popup).not.toBeNull();
    await expect(popup).toHaveURL(/vote\/idol\/yorita_yoshino/);
    await popup.close();
    await page.clock.runFor(1000);
    await expect
      .poll(() => events.filter((event) => event.kind === "vote").length)
      .toBe(1);
  });

  test("touch devices do not apply desktop hover colors to the result actions", async ({
    page,
  }) => {
    await prepare(page);
    await page.locator("#demo-button").tap();
    await play(page, 1000);
    await expect(page.locator("#result-dialog")).toBeVisible();
    expect(
      await page.evaluate(() => matchMedia("(hover: hover)").matches),
    ).toBe(false);
    // Remove interpolation only, so the assertion inspects the resolved hover
    // style rather than racing the start of its background transition.
    await page.addStyleTag({
      content: "button, a { transition: none !important; }",
    });
    for (const id of ["vote-button", "again-button"]) {
      const button = page.locator(`#${id}`);
      await page.mouse.move(0, 0);
      const initial = await button.evaluate(
        (el) => getComputedStyle(el).backgroundColor,
      );
      await button.hover();
      await expect(button).toHaveCSS("background-color", initial);
    }
  });

  test("scrolling, long presses, multitouch and cancelled gestures do not open the vote link", async ({
    page,
  }) => {
    const { events } = await prepare(page);
    await page.locator("#demo-button").tap();
    await play(page, 1000);
    const vote = page.locator("#vote-button");
    await expect(page.locator("#result-dialog")).toBeVisible();
    await vote.scrollIntoViewIfNeeded();
    await page.evaluate(() => {
      const link = document.querySelector("#vote-button");
      window.__voteClicks = 0;
      link.addEventListener("click", () => window.__voteClicks++);
      window.__touchVote = (type, contacts, changed = contacts) => {
        const box = link.getBoundingClientRect();
        const touch = ([identifier, dx = 0, dy = 0]) =>
          new Touch({
            identifier,
            target: link,
            clientX: box.x + box.width / 2 + dx,
            clientY: box.y + box.height / 2 + dy,
          });
        link.dispatchEvent(
          new TouchEvent(type, {
            bubbles: true,
            cancelable: true,
            touches: contacts.map(touch),
            changedTouches: changed.map(touch),
          }),
        );
      };
      // A finger may move away and return; that remains a drag, not a tap.
      window.__touchVote("touchstart", [[1]]);
      window.__touchVote("touchmove", [[1, 0, 30]]);
      window.__touchVote("touchmove", [[1]]);
      window.__touchVote("touchend", [], [[1]]);
      window.__touchVote("touchstart", [[1]]);
      window.__touchVote("touchcancel", [], [[1]]);
      window.__touchVote("touchend", [], [[1]]);
      window.__touchVote("touchstart", [[1]]);
      window.__touchVote("touchstart", [[1], [2, 20]]);
      window.__touchVote("touchend", [[2, 20]], [[1]]);
      window.__touchVote("touchend", [], [[2, 20]]);
      window.__touchVote("touchstart", [[1]]);
      document.dispatchEvent(new Event("scroll"));
      window.__touchVote("touchend", [], [[1]]);
      window.__touchVote("touchstart", [[1]]);
      link.dispatchEvent(new MouseEvent("contextmenu"));
      window.__touchVote("touchend", [], [[1]]);
      window.__touchVote("touchstart", [[1]]);
    });
    await page.clock.runFor(600);
    await page.evaluate(() => window.__touchVote("touchend", [], [[1]]));
    expect(await page.evaluate(() => window.__voteClicks)).toBe(0);
    expect(events.filter((event) => event.kind === "vote")).toHaveLength(0);

    const popupReady = page.waitForEvent("popup");
    await vote.tap();
    const popup = await popupReady;
    await expect(popup).toHaveURL(/vote\/idol\/yorita_yoshino/);
    await popup.close();
    expect(await page.evaluate(() => window.__voteClicks)).toBe(1);
    await expect
      .poll(() => events.filter((event) => event.kind === "vote").length)
      .toBe(1);
  });

  for (const training of [false, true]) {
    test(`one tap navigates and counts once from the ${training ? "hidden" : "normal"} result with the shimmer running`, async ({
      page,
    }) => {
      const { events } = await prepare(page);
      await page.setViewportSize({ width: 320, height: 568 });
      if (training) await page.locator("#training-toggle").tap();
      await page.locator("#demo-button").tap();
      await play(page, training ? 73000 : 1000);
      if (training) await page.clock.runFor(4400);
      await expect(page.locator("#result-dialog")).toBeVisible();
      const vote = page.locator("#vote-button");
      await vote.scrollIntoViewIfNeeded();
      expect(
        await vote.evaluate((el) => {
          const shine = getComputedStyle(el, "::before");
          return {
            animation: shine.animationName,
            pointerEvents: shine.pointerEvents,
          };
        }),
      ).toEqual({ animation: "vote-shimmer", pointerEvents: "none" });

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

test("desktop voting keeps its hover feedback", async ({ page }) => {
  await prepare(page);
  await page.locator("#demo-button").click();
  await play(page, 1000);
  const vote = page.locator("#vote-button");
  await expect(page.locator("#result-dialog")).toBeVisible();
  expect(await page.evaluate(() => matchMedia("(hover: hover)").matches)).toBe(
    true,
  );
  await vote.hover();
  await expect(vote).toHaveCSS("background-color", "rgb(17, 123, 144)");
});
