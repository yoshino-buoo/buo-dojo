import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// Small event/media doubles for app lifecycle checks; no browser layout is mocked.
class Element {
  constructor(id = "") {
    this.id = id;
    this.hidden = false;
    this.textContent = "";
    this.value = "100";
    this.dataset = {};
    this.attributes = {};
    this.children = [];
    this.listeners = {};
    this.style = { setProperty() {} };
    this.classList = { contains: () => false, remove() {}, toggle() {} };
  }
  addEventListener(name, fn) {
    (this.listeners[name] ||= []).push(fn);
  }
  async emit(name, event = {}) {
    for (const fn of this.listeners[name] || [])
      await fn({ target: this, preventDefault() {}, ...event });
  }
  setAttribute(name, value) {
    this.attributes[name] = value;
  }
  removeAttribute(name) {
    delete this.attributes[name];
  }
  append(element) {
    this.children.push(element);
  }
  replaceChildren(...children) {
    this.children = children;
  }
  remove() {}
  getAnimations() {
    return [];
  }
  focus() {
    document.activeElement = this;
  }
  select() {}
  setPointerCapture() {}
  showModal() {
    this.open = true;
  }
  close() {
    this.open = false;
    queueMicrotask(() => this.emit("close"));
  }
}

async function setup() {
  const html = await readFile(
    new URL("../index.html", import.meta.url),
    "utf8",
  );
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  const elements = new Map(ids.map((id) => [id, new Element(id)]));
  const poses = ["a", "b", "c"].map((pose) => {
    const element = new Element();
    element.classList.contains = (name) => name === `character-${pose}`;
    return element;
  });
  const dialogs = [elements.get("help-dialog"), elements.get("result-dialog")];
  const document = Object.assign(new Element(), {
    body: new Element(),
    activeElement: new Element(),
    hidden: false,
    getElementById: (id) => elements.get(id),
    createElement: () => new Element(),
    querySelectorAll: (selector) =>
      selector === ".character" ? poses : selector === "dialog" ? dialogs : [],
    querySelector: (selector) =>
      selector === "dialog[open]"
        ? dialogs.find((dialog) => dialog.open)
        : new Element(),
  });
  const window = Object.assign(new Element(), { isSecureContext: true });
  const frames = new Map(),
    timers = new Map(),
    contexts = [];
  let clock = 0,
    nextId = 0;
  class AudioContext {
    constructor() {
      this.state = "running";
      this.sampleRate = 48000;
      contexts.push(this);
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
        getFloatTimeDomainData: (array) => {
          for (let i = 0; i < array.length; i++)
            array[i] = window.wind ? 0.06 * Math.sin(i) : 0;
        },
        getFloatFrequencyData: (array) => array.fill(window.wind ? -35 : -100),
      };
    }
  }
  window.AudioContext = AudioContext;
  const globals = {
    document,
    window,
    navigator: {},
    location: { href: "https://sample.github.io/yoshino/" },
    Image: class {},
    performance: { now: () => clock },
    requestAnimationFrame: (callback) => {
      const id = ++nextId;
      frames.set(id, callback);
      return id;
    },
    cancelAnimationFrame: (id) => frames.delete(id),
    setTimeout: (callback, delay = 0) => {
      const id = ++nextId;
      timers.set(id, { callback, due: clock + delay });
      return id;
    },
    clearTimeout: (id) => timers.delete(id),
  };
  const originals = new Map(
    Object.keys(globals).map((key) => [
      key,
      Object.getOwnPropertyDescriptor(globalThis, key),
    ]),
  );
  for (const [key, value] of Object.entries(globals))
    Object.defineProperty(globalThis, key, {
      configurable: true,
      writable: true,
      value,
    });
  await import(`../app.js?test=${Math.random()}`);
  return {
    $: (id) => elements.get(id),
    document,
    window,
    navigator,
    contexts,
    frames,
    get state() {
      return elements.get("dojo").dataset.state;
    },
    setClock(value) {
      clock = value;
    },
    tick(value) {
      clock = value;
      const pending = [...frames.values()];
      frames.clear();
      pending.forEach((callback) => callback(value));
    },
    runTimers(ms) {
      clock += ms;
      for (const [id, timer] of [...timers]) {
        if (timer.due <= clock && timers.has(id)) {
          timers.delete(id);
          timer.callback();
        }
      }
    },
    restore() {
      for (const [key, descriptor] of originals) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else delete globalThis[key];
      }
    },
  };
}

function streamFixture() {
  const track = {
    stopped: false,
    stop() {
      this.stopped = true;
    },
    addEventListener() {},
  };
  return { track, stream: { getTracks: () => [track] } };
}

test("demo: exact glyph order, release, replay, share, and official Yoshino voting link", async () => {
  const env = await setup();
  try {
    assert.equal(env.state, "idle");
    await env.$("demo-button").emit("click");
    assert.equal(env.state, "demo-ready");
    await env.$("hold-button").emit("pointerdown", { button: 0, pointerId: 1 });
    assert.equal(env.state, "blowing");
    env.tick(2500);
    await env.$("hold-button").emit("pointerup", { pointerId: 1 });
    assert.equal(env.state, "result");
    assert.equal(env.$("result-dialog").open, true);
    assert.equal(env.$("result-time").textContent, "2.5");
    assert.deepEqual(
      env.$("result-kanji").children.map((tile) => tile.textContent),
      ["武", "謳", "鶯", "王"],
    );
    assert.equal(env.$("result-mode").hidden, false);
    let shared = "";
    env.navigator.clipboard = {
      writeText: async (text) => {
        shared = text;
      },
    };
    await env.$("share-preview-button").emit("click");
    assert.equal(env.$("result-dialog").dataset.view, "share");
    await env.$("share-copy-text").emit("click");
    assert.equal(
      shared,
      `🐚＼ 法螺貝、何秒吹ける？ ／🐚

依田芳乃ちゃんと「ぶおおー」してきましたー。

今回の記録は
【4文字／2.5秒】！

そなたもスマホに、ふーっと。👇

#ぶおー法螺貝道場
#依田芳乃
#シンデレラガール総選挙2026

https://sample.github.io/yoshino/`,
    );
    assert.equal(
      env.$("vote-button").href,
      "https://idolmaster-official.jp/cinderellagirls/vote2026/vote/idol/yorita_yoshino",
    );
    assert.equal(env.$("vote-button").attributes["aria-disabled"], undefined);
    await env.$("again-button").emit("click");
    assert.equal(env.state, "demo-ready");
    assert.equal(env.$("live-count").textContent, "0");
  } finally {
    env.restore();
  }
});

test("demo caps at 25 seconds, celebrates, preserves the drawn order, and reshuffles on replay", async (t) => {
  const env = await setup();
  const random = t.mock.method(Math, "random", () => 0);
  try {
    await env.$("demo-button").emit("click");
    await env.$("hold-button").emit("keydown", { key: "Enter", repeat: false });
    env.tick(20000);
    assert.equal(env.$("live-count").textContent, "30");
    assert.equal(env.$("charge-cue").hidden, false);
    env.tick(24999);
    assert.equal(env.$("live-count").textContent, "30");
    env.tick(25000);
    assert.equal(env.state, "celebrating");
    assert.equal(env.$("finale-effect").hidden, false);
    assert.equal(env.frames.size, 0);
    env.runTimers(1800);
    assert.equal(env.state, "result");
    assert.equal(env.$("result-time").textContent, "25.0");
    assert.equal(env.$("result-count").textContent, "31");
    assert.equal(env.frames.size, 0);
    const resultGlyphs = () => [
      ...env.$("result-kanji").children.map((tile) => tile.textContent),
      env.$("result-final-kanji").textContent,
    ];
    const first = resultGlyphs();
    assert.deepEqual(first.slice(0, 4), ["武", "謳", "鶯", "王"]);
    assert.equal(new Set(first).size, 31);
    assert.equal(first.at(-1), "芳");
    assert.equal(env.$("result-dialog").dataset.mastery, "true");
    assert.equal(env.$("result-stamp").textContent, "皆伝");
    assert.deepEqual(
      env.$("particles").children.map((particle) => particle.textContent),
      first.slice(0, 30),
    );
    let shared = "";
    env.navigator.clipboard = {
      writeText: async (text) => {
        shared = text;
      },
    };
    await env.$("share-preview-button").emit("click");
    await env.$("share-copy-text").emit("click");
    assert.match(shared, /【31文字／25\.0秒】！/);

    await env.$("again-button").emit("click");
    random.mock.mockImplementation(() => 0.999999);
    await env.$("hold-button").emit("keydown", { key: "Enter", repeat: false });
    env.tick(52800);
    assert.equal(env.state, "celebrating");
    env.runTimers(1800);
    const second = resultGlyphs();
    assert.equal(env.state, "result");
    assert.deepEqual(second.slice(0, 4), first.slice(0, 4));
    assert.equal(new Set(second).size, 31);
    assert.notDeepEqual(second.slice(4), first.slice(4));
    await env.$("share-preview-button").emit("click");
    await env.$("share-copy-text").emit("click");
    assert.match(shared, /【31文字／25\.0秒】！/);
  } finally {
    env.restore();
  }
});

test("permission denial returns to a usable screen without retaining the audio context", async () => {
  const env = await setup();
  try {
    env.navigator.mediaDevices = {
      getUserMedia: async () => {
        throw Object.assign(new Error(), { name: "NotAllowedError" });
      },
    };
    await env.$("start-button").emit("click");
    assert.equal(env.state, "idle");
    assert.equal(env.$("start-button").disabled, false);
    assert.equal(env.contexts[0].state, "closed");
    assert.match(env.$("status-text").textContent, /おためし/);
    await env.$("demo-button").emit("click");
    assert.equal(env.state, "demo-ready");
  } finally {
    env.restore();
  }
});

test("cancelling pending permission stops a late stream and does not interrupt the demo", async () => {
  const env = await setup();
  try {
    let grant;
    env.navigator.mediaDevices = {
      getUserMedia: () =>
        new Promise((resolve) => {
          grant = resolve;
        }),
    };
    const pending = env.$("start-button").emit("click");
    assert.equal(env.state, "requesting");
    await env.$("demo-button").emit("click");
    const fixture = streamFixture();
    grant(fixture.stream);
    await pending;
    assert.equal(env.state, "demo-ready");
    assert.equal(fixture.track.stopped, true);
    assert.equal(env.contexts[0].state, "closed");
  } finally {
    env.restore();
  }
});

test("calibration reaches listening and moving to the background releases the microphone", async () => {
  const env = await setup();
  try {
    const fixture = streamFixture();
    env.navigator.mediaDevices = { getUserMedia: async () => fixture.stream };
    await env.$("start-button").emit("click");
    assert.equal(env.state, "calibrating");
    env.tick(0);
    env.tick(800);
    assert.equal(env.state, "listening");
    env.document.hidden = true;
    await env.document.emit("visibilitychange");
    assert.equal(env.state, "idle");
    assert.equal(fixture.track.stopped, true);
    assert.equal(env.frames.size, 0);
  } finally {
    env.restore();
  }
});

test("X sharing offers selectable post text when the clipboard is unavailable", async () => {
  const env = await setup();
  try {
    await env.$("demo-button").emit("click");
    await env.$("hold-button").emit("pointerdown", { button: 0, pointerId: 1 });
    env.setClock(1200);
    await env.$("hold-button").emit("pointerup", { pointerId: 1 });
    await env.$("share-preview-button").emit("click");
    const intent = new URL(env.$("share-web").href);
    assert.equal(intent.origin, "https://x.com");
    assert.match(intent.searchParams.get("text"), /【2文字／1\.2秒】！/);
    await env.$("share-copy-text").emit("click");
    assert.equal(env.$("share-fallback").hidden, false);
    assert.equal(
      env.$("share-fallback").value,
      intent.searchParams.get("text"),
    );
  } finally {
    env.restore();
  }
});

for (const duration of [20000, 24999]) {
  test(`ending at ${duration}ms gives ordinary results with 30 glyphs`, async () => {
    const env = await setup();
    try {
      await env.$("demo-button").emit("click");
      await env
        .$("hold-button")
        .emit("pointerdown", { button: 0, pointerId: 1 });
      env.tick(duration);
      await env.$("hold-button").emit("pointerup", { pointerId: 1 });
      assert.equal(env.state, "result");
      assert.equal(env.$("result-count").textContent, "30");
      assert.equal(
        env.$("result-time").textContent,
        duration === 20000 ? "20.0" : "24.9",
      );
      assert.equal(env.$("result-dialog").dataset.mastery, "false");
      assert.equal(env.$("mastery-award").hidden, true);
      assert.equal(env.$("finale-effect").hidden, true);
      assert.equal(env.$("charge-cue").hidden, true);
    } finally {
      env.restore();
    }
  });
}

test("the microphone stops at 25 seconds before the celebration and results", async () => {
  const env = await setup();
  try {
    const fixture = streamFixture();
    env.navigator.mediaDevices = { getUserMedia: async () => fixture.stream };
    await env.$("start-button").emit("click");
    env.tick(0);
    env.tick(800);
    env.window.wind = true;
    env.tick(1000);
    env.tick(1200);
    env.tick(21000);
    assert.equal(env.$("charge-cue").hidden, false);
    env.tick(26000);
    assert.equal(env.state, "celebrating");
    assert.equal(fixture.track.stopped, true);
    assert.equal(env.contexts[0].state, "closed");
    assert.equal(env.frames.size, 0);
    env.runTimers(1800);
    assert.equal(env.state, "result");
    assert.equal(env.$("result-time").textContent, "25.0");
    assert.equal(env.$("result-final-kanji").textContent, "芳");
  } finally {
    env.restore();
  }
});

test("backgrounding a celebration settles once and cannot overwrite a replay", async () => {
  const env = await setup();
  try {
    await env.$("demo-button").emit("click");
    await env.$("hold-button").emit("keydown", { key: "Enter" });
    env.tick(25000);
    assert.equal(env.state, "celebrating");
    env.document.hidden = true;
    await env.document.emit("visibilitychange");
    assert.equal(env.state, "result");
    env.document.hidden = false;
    await env.$("again-button").emit("click");
    assert.equal(env.$("dojo").dataset.phase, "regular");
    env.runTimers(2000);
    assert.equal(env.state, "demo-ready");
    assert.equal(env.$("result-dialog").open, false);
    await env.$("hold-button").emit("keydown", { key: "Enter" });
    env.tick(29000);
    await env.$("hold-button").emit("keyup", { key: "Enter" });
    assert.equal(env.$("result-dialog").dataset.mastery, "false");
    assert.equal(env.$("mastery-award").hidden, true);
  } finally {
    env.restore();
  }
});

test("pagehide on the exact completion boundary settles without a stranded celebration", async () => {
  const env = await setup();
  try {
    await env.$("demo-button").emit("click");
    await env.$("hold-button").emit("keydown", { key: "Enter" });
    env.tick(24900);
    env.setClock(25000);
    await env.window.emit("pagehide");
    assert.equal(env.state, "result");
    assert.equal(env.$("result-dialog").open, true);
    assert.equal(env.$("result-dialog").dataset.mastery, "true");
    env.runTimers(2000);
    assert.equal(env.state, "result");
  } finally {
    env.restore();
  }
});

test("hidden microphone uses the 73-second course, stops resources, and retains the selected course on replay", async () => {
  const env = await setup();
  try {
    const fixture = streamFixture();
    env.navigator.mediaDevices = { getUserMedia: async () => fixture.stream };
    await env.$("training-toggle").emit("click");
    assert.equal(
      env.$("speech").textContent,
      "では、さらなる高みへ参りましょうー",
    );
    await env.$("start-button").emit("click");
    env.tick(0);
    env.tick(800);
    env.window.wind = true;
    env.tick(1000);
    env.tick(1200);
    env.tick(26000);
    assert.equal(env.state, "blowing");
    await env.$("training-toggle").emit("click"); // A stale/synthetic click cannot alter an active round.
    assert.equal(env.$("dojo").dataset.training, "true");
    for (const [at, count] of [
      [49000, 69],
      [54000, 70],
      [59000, 71],
      [64000, 72],
    ]) {
      env.tick(at);
      assert.equal(env.$("live-count").textContent, String(count));
      assert.equal(env.state, "blowing");
    }
    env.tick(74000);
    assert.equal(env.state, "celebrating");
    assert.equal(fixture.track.stopped, true);
    assert.equal(env.contexts[0].state, "closed");
    assert.equal(env.frames.size, 0);
    env.runTimers(4200);
    assert.equal(env.$("result-time").textContent, "73.0");
    assert.equal(env.$("result-count").textContent, "73");
    assert.equal(env.$("result-final-kanji").textContent, "依田芳乃");
    assert.equal(env.$("result-dialog").dataset.super, "true");
    await env.$("again-button").emit("click");
    assert.equal(env.$("dojo").dataset.training, "true");
    assert.equal(env.$("dojo").dataset.super, "false");
    env.runTimers(5000);
    assert.notEqual(env.state, "result");
  } finally {
    env.restore();
  }
});

test("leaving hidden training on a milestone awards it once and does not grant completion", async () => {
  const env = await setup();
  try {
    await env.$("training-toggle").emit("click");
    await env.$("demo-button").emit("click");
    await env.$("hold-button").emit("keydown", { key: "Enter" });
    env.tick(52900);
    env.setClock(53000);
    await env.window.emit("pagehide");
    assert.equal(env.state, "result");
    assert.equal(env.$("result-count").textContent, "70");
    assert.equal(env.$("result-kanji").children.at(-1).textContent, "依");
    assert.equal(env.$("result-dialog").dataset.super, "false");
    env.runTimers(80000);
    assert.equal(env.$("result-count").textContent, "70");
  } finally {
    env.restore();
  }
});
