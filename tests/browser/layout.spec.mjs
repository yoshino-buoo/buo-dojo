import { test, expect } from "@playwright/test";
import { OPENING_KANJI, O_KANJI } from "../../breath.js";
import { CONFIG, TRAINING_CONFIG } from "../../config.js";

test("every game kanji renders from the bundled font without system fallback", async ({
  page,
}) => {
  await page.goto("/");
  const glyphs = [
    ...new Set([
      ...OPENING_KANJI,
      ...O_KANJI,
      CONFIG.finalKanji,
      ...TRAINING_CONFIG.finalKanji,
    ]),
  ];
  await page.evaluate((glyphs) => {
    const list = document.createElement("div");
    list.id = "font-coverage";
    list.className = "result-kanji";
    for (const glyph of glyphs) {
      const tile = document.createElement("span");
      tile.textContent = glyph;
      list.append(tile);
    }
    document.body.append(list);
  }, glyphs);
  await page.evaluate(() => document.fonts.ready);

  // Computed font-family and document.fonts.check do not detect missing glyphs.
  // Inspect the fonts that Chromium actually used for each rendered character.
  const session = await page.context().newCDPSession(page);
  await session.send("DOM.enable");
  await session.send("CSS.enable");
  const { root } = await session.send("DOM.getDocument");
  const { nodeIds } = await session.send("DOM.querySelectorAll", {
    nodeId: root.nodeId,
    selector: "#font-coverage span",
  });
  expect(nodeIds).toHaveLength(glyphs.length);
  for (let i = 0; i < nodeIds.length; i++) {
    const { fonts } = await session.send("CSS.getPlatformFontsForNode", {
      nodeId: nodeIds[i],
    });
    expect(fonts, glyphs[i]).toHaveLength(1);
    expect(fonts[0], glyphs[i]).toMatchObject({
      // Chromium's Linux renderer may append its Fontations backend name.
      familyName: expect.stringMatching(/^Dojo Kanji(?: \(Fontations\))?$/),
      isCustomFont: true,
      glyphCount: 1,
    });
  }
  await session.detach();
});

async function prepare(page, viewport) {
  await page.setViewportSize(viewport);
  await page.clock.install();
  await page.addInitScript(() => {
    window.__wind = false;
    class TestAudioContext {
      constructor() {
        this.state = "running";
        this.sampleRate = 48000;
      }
      async resume() {}
      async close() {
        this.state = "closed";
      }
      createMediaStreamSource() {
        return { connect() {}, disconnect() {} };
      }
      createAnalyser() {
        return {
          fftSize: 2048,
          frequencyBinCount: 1024,
          disconnect() {},
          getFloatTimeDomainData(samples) {
            for (let i = 0; i < samples.length; i++)
              samples[i] = window.__wind ? 0.1 * Math.sin(i) : 0;
          },
          getFloatFrequencyData(spectrum) {
            spectrum.fill(window.__wind ? -35 : -100);
          },
        };
      }
    }
    window.AudioContext = TestAudioContext;
    navigator.mediaDevices.getUserMedia = () =>
      new Promise((resolve) => {
        window.__grantMic = () =>
          resolve({ getTracks: () => [{ stop() {}, addEventListener() {} }] });
      });
  });
  await page.goto("/");
  await page.evaluate(() =>
    Promise.all(
      [...document.images].map((image) => image.decode().catch(() => {})),
    ),
  );
}

test("browser toolbar heights do not resize the character, logo, or controls", async ({
  page,
}) => {
  await prepare(page, { width: 393, height: 756 });
  const measure = () =>
    page.evaluate(() => {
      const selectors = [
        ".stage",
        ".character-a",
        ".title-logo",
        ".speech",
        "#start-button",
        "#help-button",
      ];
      return selectors.map((selector) => {
        const element = document.querySelector(selector);
        const style = getComputedStyle(element);
        const box = element.getBoundingClientRect();
        return {
          selector,
          width: parseFloat(style.width),
          height: parseFloat(style.height),
          font: parseFloat(style.fontSize),
          bottom: box.bottom,
        };
      });
    });
  const baseline = await measure();
  for (const height of [640, 650, 664, 740, 844]) {
    await page.setViewportSize({ width: 393, height });
    await page.clock.runFor(100);
    const current = await measure();
    for (let i = 0; i < current.length; i++) {
      for (const dimension of ["width", "height", "font"])
        expect(
          current[i][dimension],
          `${current[i].selector} ${dimension} at viewport height ${height}`,
        ).toBeCloseTo(baseline[i][dimension], 0);
    }
    const button = current.find(
      (element) => element.selector === "#start-button",
    );
    expect(button.bottom).toBeLessThanOrEqual(height);
  }
});

for (const viewport of [
  { width: 320, height: 568 },
  { width: 375, height: 667 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
  { width: 768, height: 1024 },
]) {
  test(`stage stays fixed through microphone states at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await prepare(page, viewport);
    const measure = () => page.locator(".stage").boundingBox();
    const idle = await measure();
    const idleBody = await page
      .locator(".character-a")
      .evaluate(
        (element) =>
          (parseFloat(getComputedStyle(element).height) * 1097) / 1304,
      );
    await page
      .getByRole("button", { name: "法螺貝を吹く", exact: true })
      .click();
    await expect(page.locator("#dojo")).toHaveAttribute(
      "data-state",
      "requesting",
    );
    const requesting = await measure();
    await page.evaluate(() => window.__grantMic());
    await expect(page.locator("#dojo")).toHaveAttribute(
      "data-state",
      "calibrating",
    );
    const calibrating = await measure();
    const readyBody = await page
      .locator(".character-b")
      .evaluate(
        (element) =>
          (parseFloat(getComputedStyle(element).height) * 1320) / 1370,
      );
    const beforeMeter = await page
      .locator(".character-b")
      .evaluate((element) => element.offsetHeight);
    await page.clock.runFor(850);
    await expect(page.locator("#dojo")).toHaveAttribute(
      "data-state",
      "listening",
    );
    const listening = await measure();
    const afterMeter = await page
      .locator(".character-b")
      .evaluate((element) => element.offsetHeight);
    await page.evaluate(() => {
      window.__wind = true;
    });
    await page.clock.runFor(250);
    await expect(page.locator("#dojo")).toHaveAttribute(
      "data-state",
      "blowing",
    );
    const blowing = await measure();
    for (const box of [requesting, calibrating, listening, blowing]) {
      expect(box.y).toBeCloseTo(idle.y, 0);
      expect(box.height).toBeCloseTo(idle.height, 0);
    }
    expect(afterMeter).toEqual(beforeMeter);
    const blowingBody = await page
      .locator(".character-c")
      .evaluate(
        (element) =>
          (parseFloat(getComputedStyle(element).height) * 1134) / 1287,
      );
    expect(Math.abs(readyBody - idleBody)).toBeLessThan(1);
    expect(Math.abs(blowingBody - idleBody)).toBeLessThan(1);
  });

  test(`all 31 result glyphs fit without scrolling at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await prepare(page, viewport);
    await page.getByRole("button", { name: "マイクなしでおためし" }).click();
    await page.locator("#hold-button").focus();
    await page.keyboard.down("Space");
    await page.clock.fastForward(25000);
    await page.clock.runFor(2000);
    await page.keyboard.up("Space");
    await expect(page.locator("#result-dialog")).toBeVisible();
    await expect(page.locator("#result-kanji > span")).toHaveCount(30);
    await expect(page.locator("#result-final-kanji")).toHaveText("芳");
    await page.clock.runFor(600);
    const dimensions = await page
      .locator("#result-kanji")
      .evaluate((element) => {
        const dialog = document.querySelector("#result-dialog");
        const boxes = [
          ...element.children,
          document.querySelector("#result-final-kanji"),
        ].map((tile) => tile.getBoundingClientRect());
        return {
          clientHeight: element.clientHeight,
          scrollHeight: element.scrollHeight,
          clientWidth: element.clientWidth,
          scrollWidth: element.scrollWidth,
          dialogClient: dialog.clientHeight,
          dialogScroll: dialog.scrollHeight,
          minTop: Math.min(...boxes.map((box) => box.top)),
          maxBottom: Math.max(...boxes.map((box) => box.bottom)),
          font: parseFloat(
            getComputedStyle(element.firstElementChild).fontSize,
          ),
        };
      });
    expect(dimensions.scrollHeight).toBeLessThanOrEqual(
      dimensions.clientHeight + 1,
    );
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(
      dimensions.clientWidth + 1,
    );
    expect(dimensions.minTop).toBeGreaterThanOrEqual(0);
    expect(dimensions.maxBottom).toBeLessThan(viewport.height);
    expect(dimensions.font).toBeGreaterThanOrEqual(20);
    if (viewport.height >= 667)
      expect(dimensions.dialogScroll).toBeLessThanOrEqual(
        dimensions.dialogClient + 1,
      );
  });
}

test("charging and the final animation keep the stage fixed before mastery results", async ({
  page,
}) => {
  await prepare(page, { width: 393, height: 640 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.getByRole("button", { name: "マイクなしでおためし" }).click();
  await page.locator("#hold-button").focus();
  await page.keyboard.down("Space");
  const stage = await page.locator(".stage").boundingBox();
  await page.clock.fastForward(20000);
  await expect(page.locator("#live-count")).toHaveText("30");
  await expect(page.locator("#dojo")).toHaveAttribute("data-phase", "charging");
  await expect(page.locator("#charge-cue")).toBeVisible();
  await page.clock.fastForward(4500);
  await expect(page.locator("#live-count")).toHaveText("30");
  await page.clock.runFor(600);
  await expect(page.locator("#dojo")).toHaveAttribute(
    "data-state",
    "celebrating",
  );
  await expect(page.locator("#finale-effect")).toBeVisible();
  await expect(page.locator("#finale-kanji")).toHaveText("芳");
  await expect(page.locator("#result-dialog")).not.toBeVisible();
  expect(await page.locator(".stage").boundingBox()).toEqual(stage);
  await page.keyboard.up("Space");
  await page.clock.runFor(1900);
  await expect(page.locator("#result-dialog")).toHaveAttribute(
    "data-mastery",
    "true",
  );
  await expect(page.locator("#result-stamp")).toHaveText("皆伝");
  await expect(page.locator("#result-time")).toHaveText("25.0");
  await page.locator("#again-button").click();
  await page.keyboard.down("Space");
  await page.clock.fastForward(20000);
  await page.keyboard.up("Space");
  await expect(page.locator("#result-dialog")).toHaveAttribute(
    "data-mastery",
    "false",
  );
  await expect(page.locator("#result-kanji > span")).toHaveCount(30);
  await expect(page.locator("#mastery-award")).not.toBeVisible();
  await expect(page.locator("#result-overline")).toHaveText("本日の、ひと吹き");
});

test("charging reaches a 0.2-second period with one haptic pulse per real animation cycle", async ({
  page,
}) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  // Skip the ordinary phase in both clocks, then measure real compositor time.
  // Playwright's fake clock alone does not advance CSS animations.
  await page.addInitScript(() => {
    window.hapticCalls = [];
    Object.defineProperty(navigator, "vibrate", {
      value: (duration) => {
        const timing = document
          .querySelector(".character-c")
          ?.getAnimations()[0]
          ?.effect.getComputedTiming();
        window.hapticCalls.push({
          duration,
          time: document.timeline.currentTime,
          progress: timing?.progress,
        });
        return true;
      },
    });
    const now = performance.now.bind(performance);
    const frame = requestAnimationFrame.bind(window);
    let offset = 0;
    Object.defineProperty(performance, "now", {
      value: () => now() + offset,
    });
    window.requestAnimationFrame = (callback) =>
      frame((time) => callback(time + offset));
    window.skipOrdinaryPhase = () => {
      offset += 20000;
      const animation = document
        .querySelector(".character-c")
        .getAnimations()[0];
      animation.currentTime += 20000;
    };
  });
  await page.goto("/");
  await page.locator("#vibration-button").click();
  await page.locator("#demo-button").click();
  await page.locator("#hold-button").focus();
  await page.keyboard.down("Space");
  const motion = await page.evaluate(async () => {
    window.skipOrdinaryPhase();
    const element = document.querySelector(".character-c");
    const animation = element.getAnimations()[0];
    let first, last;
    return new Promise((resolve) => {
      function sample() {
        const dojo = document.querySelector("#dojo");
        if (dojo.dataset.state !== "blowing") {
          resolve({
            seconds: (last.time - first.time) / 1000,
            cycles: last.phase - first.phase,
            finalPeriod: last.period,
            hapticCalls: window.hapticCalls,
          });
          return;
        }
        if (dojo.dataset.phase === "charging") {
          const timing = animation.effect.getComputedTiming();
          const value = {
            time: document.timeline.currentTime,
            phase: timing.currentIteration + timing.progress,
            period: timing.duration / animation.playbackRate / 1000,
          };
          first ||= value;
          last = value;
        }
        requestAnimationFrame(sample);
      }
      sample();
    });
  });
  await page.keyboard.up("Space");
  expect(motion.seconds).toBeGreaterThan(4.7);
  expect(motion.cycles).toBeGreaterThan(11.3);
  expect(motion.cycles).toBeLessThan(13.1);
  expect(motion.finalPeriod).toBeGreaterThanOrEqual(0.2);
  expect(motion.finalPeriod).toBeLessThan(0.22);
  const pulses = motion.hapticCalls.filter((call) => call.duration > 0);
  expect(pulses.length).toBeGreaterThanOrEqual(11);
  expect(pulses.length).toBeLessThanOrEqual(13);
  expect(pulses.every((pulse) => pulse.duration === 10)).toBe(true);
  // Ignore the phase skip itself; subsequent pulses coincide with expansion peaks.
  expect(
    pulses
      .slice(1)
      .every((pulse) => pulse.progress >= 0.5 && pulse.progress < 0.7),
  ).toBe(true);
  const gaps = pulses
    .slice(1)
    .map((pulse, index) => pulse.time - pulses[index].time);
  expect(gaps.at(-1)).toBeGreaterThanOrEqual(180);
  expect(gaps.at(-1)).toBeLessThan(270);
  expect(gaps.at(-1)).toBeLessThan(gaps[1] * 0.65);
  expect(motion.hapticCalls.at(-1).duration).toBe(0);
  await expect(page.locator("#result-dialog")).toBeVisible();
  expect(await page.evaluate(() => window.hapticCalls.length)).toBe(
    motion.hapticCalls.length,
  );
  await expect(page.locator("#result-stamp")).toHaveText("皆伝");
  await expect(page.locator("#result-overline")).toHaveText("本日の、ひと吹き");
  await page.locator("#again-button").click();
  await page.keyboard.down("Space");
  const replayPeriod = await page
    .locator(".character-c")
    .evaluate((element) => {
      const animation = element.getAnimations()[0];
      return animation.effect.getTiming().duration / animation.playbackRate;
    });
  expect(replayPeriod).toBe(720);
  await page.keyboard.up("Space");
});
