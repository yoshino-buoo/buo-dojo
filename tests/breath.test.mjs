import test from "node:test";
import assert from "node:assert/strict";
import {
  BreathDetector,
  analyzeSignal,
  createGlyphSequence,
  glyphsForDuration,
  isYoshinoRecord,
  roundProgress,
  OPENING_KANJI,
  O_KANJI,
} from "../breath.js";
import { CONFIG, TRAINING_CONFIG } from "../config.js";

const quiet = {
  rms: 0.001,
  crest: 3,
  flatness: 0.3,
  highRatio: 0.2,
  lowRatio: 0.3,
};
const wind = {
  rms: 0.065,
  crest: 3,
  flatness: 0.35,
  highRatio: 0.2,
  lowRatio: 0.6,
};
function calibrated(options = {}) {
  const detector = new BreathDetector(options);
  for (let now = 0; now <= 800; now += 20) detector.update(now, quiet);
  assert.equal(detector.state, "listening");
  return detector;
}

test("each sequence keeps the opening and draws the complete pool without repeats", () => {
  assert.deepEqual(glyphsForDuration(2500), ["武", "謳", "鶯", "王"]);
  assert.ok(O_KANJI.length >= 32);
  assert.equal(new Set(O_KANJI).size, O_KANJI.length);
  assert.ok(O_KANJI.every((glyph) => !OPENING_KANJI.includes(glyph)));
  const first = createGlyphSequence(() => 0);
  const second = createGlyphSequence(() => 0.999999);
  const take = (sequence, count) =>
    Array.from({ length: count }, () => sequence.next().value);
  assert.deepEqual(take(first, 4), OPENING_KANJI);
  assert.deepEqual(take(second, 4), OPENING_KANJI);
  const firstPool = take(first, O_KANJI.length);
  const secondPool = take(second, O_KANJI.length);
  assert.deepEqual(new Set(firstPool), new Set(O_KANJI));
  assert.deepEqual(new Set(secondPool), new Set(O_KANJI));
  assert.notDeepEqual(firstPool, secondPool);
  assert.deepEqual(new Set(take(first, O_KANJI.length)), new Set(O_KANJI));
});
test("30 regular glyphs fill 20 seconds, then the final glyph arrives exactly at 25", () => {
  for (const [duration, count] of [
    [0, 1],
    [689, 1],
    [690, 2],
    [19999, 29],
    [20000, 30],
    [24999, 30],
    [25000, 31],
    [31000, 31],
  ])
    assert.equal(glyphsForDuration(duration).length, count, `${duration}ms`);
  assert.equal(roundProgress(19999).charging, false);
  assert.equal(roundProgress(20000).charging, true);
  assert.equal(roundProgress(24999).complete, false);
  assert.equal(roundProgress(25000).complete, true);
  assert.equal(roundProgress(31000).elapsedMs, 25000);
  const complete = glyphsForDuration(25000);
  assert.equal(complete.at(-1), "芳");
  assert.equal(new Set(complete).size, 31);
  assert.throws(() => glyphsForDuration(-1), RangeError);
  assert.throws(() => roundProgress(NaN), RangeError);
});
test("the Yoshino seal belongs only to records displayed as 7.3 seconds", () => {
  for (const duration of [7300, 7300.01, 7350, 7399.999])
    assert.equal(isYoshinoRecord(duration), true, `${duration}ms`);
  for (const duration of [0, 7299.999, 7400, 17300, 25000])
    assert.equal(isYoshinoRecord(duration), false, `${duration}ms`);
});

test("quiet input never starts a round", () => {
  const detector = calibrated();
  for (let now = 820; now < 8000; now += 20)
    assert.equal(detector.update(now, quiet).type, "listening");
});
test("an isolated puff or click is rejected instead of opening results", () => {
  const detector = calibrated();
  detector.update(1000, wind);
  detector.update(1080, wind);
  detector.update(1100, quiet);
  detector.update(1300, wind);
  detector.update(1450, wind);
  assert.equal(detector.state, "listening");
});
test("sustained breath starts after debounce and excludes trailing silence from time", () => {
  const detector = calibrated();
  for (let now = 1000; now < 1200; now += 20)
    assert.equal(detector.update(now, wind).type, "listening");
  const start = detector.update(1200, wind);
  assert.equal(start.type, "start");
  assert.equal(start.startedAt, 1000);
  for (let now = 1220; now <= 4300; now += 20) detector.update(now, wind);
  assert.equal(detector.update(5000, quiet).type, "blowing");
  const end = detector.update(5050, quiet);
  assert.equal(end.type, "end");
  assert.equal(end.durationMs, 3300);
  assert.equal(detector.update(7000, wind).type, "ended");
});
test("brief breathing fluctuations do not split a round", () => {
  const detector = calibrated();
  detector.update(1000, wind);
  detector.update(1200, wind);
  detector.update(2000, wind);
  assert.equal(detector.update(2400, quiet).type, "blowing");
  assert.equal(detector.update(2500, wind).type, "blowing");
  assert.equal(detector.update(3249, quiet).type, "blowing");
  assert.equal(detector.update(3250, quiet).durationMs, 1500);
});
test("a weaker ongoing breath survives the lower hold threshold", () => {
  const detector = calibrated();
  detector.update(1000, wind);
  detector.update(1200, wind);
  const soft = { ...wind, rms: detector.threshold * 0.8 };
  detector.update(1900, soft);
  assert.equal(detector.update(2400, quiet).type, "blowing");
});
test("a loud narrow tonal signal does not pass the wind-shape gate", () => {
  const detector = calibrated();
  const tone = {
    rms: 0.1,
    crest: 1.4,
    flatness: 0.001,
    highRatio: 0.001,
    lowRatio: 0.01,
  };
  for (let now = 1000; now < 3000; now += 20)
    assert.equal(detector.update(now, tone).type, "listening");
});
test("both configured and default limits stop at 25 seconds even after a delayed frame", () => {
  assert.equal(CONFIG.maxBlowSeconds, 25);
  const detector = calibrated();
  detector.update(1000, wind);
  detector.update(1200, wind);
  detector.update(25999, wind);
  const end = detector.update(26500, wind);
  assert.equal(end.type, "end");
  assert.equal(end.durationMs, 25000);
  assert.equal(end.capped, true);
});
test("sensitivity and measured ambient noise affect the threshold", () => {
  const detector = calibrated({ sensitivity: 65 });
  const normal = detector.threshold;
  detector.sensitivity = 100;
  assert.ok(detector.threshold < normal);
  detector.sensitivity = 0;
  assert.ok(detector.threshold > normal);
  const noisy = new BreathDetector({ sensitivity: 65 });
  for (let now = 0; now <= 800; now += 20)
    noisy.update(now, { ...quiet, rms: 0.015 });
  assert.ok(noisy.threshold > normal);
});
test("signal analysis removes DC offset and separates broadband from tonal spectra", () => {
  const samples = Float32Array.from(
    { length: 2048 },
    (_, index) => 0.25 + 0.1 * Math.sin((2 * Math.PI * index) / 32),
  );
  const broadband = new Float32Array(1024).fill(-35);
  const features = analyzeSignal(samples, broadband, 48000);
  assert.ok(Math.abs(features.rms - 0.1 / Math.sqrt(2)) < 1e-6);
  assert.ok(features.flatness > 0.99);
  const tone = new Float32Array(1024).fill(-100);
  tone[43] = -10;
  assert.ok(analyzeSignal(samples, tone, 48000).flatness < 0.01);
  assert.equal(
    analyzeSignal(new Float32Array(2048).fill(0.5), broadband, 48000).rms,
    0,
  );
});

test("trailing silence cannot earn the final glyph after breath stops at 24.9 seconds", () => {
  const detector = calibrated();
  detector.update(1000, wind);
  detector.update(1200, wind);
  detector.update(25900, wind);
  assert.equal(detector.update(26000, quiet).type, "blowing");
  const end = detector.update(26650, quiet);
  assert.equal(end.type, "end");
  assert.equal(end.durationMs, 24900);
  assert.equal(end.capped, false);
  assert.equal(roundProgress(end.durationMs).complete, false);
  assert.equal(glyphsForDuration(end.durationMs).length, 30);
});

test("hidden course fills 48 seconds without repeats and earns four names at their exact boundaries", () => {
  assert.ok(O_KANJI.length >= TRAINING_CONFIG.regularGlyphCount - 4);
  const full = glyphsForDuration(73000, TRAINING_CONFIG);
  assert.equal(full.length, 73);
  assert.equal(new Set(full).size, 73);
  assert.deepEqual(full.slice(0, 4), OPENING_KANJI);
  assert.deepEqual(full.slice(-4), ["依", "田", "芳", "乃"]);
  for (const [ms, regular, earned, stage, remaining] of [
    [47999, 68, "", 0, 6],
    [48000, 69, "", 0, 5],
    [52999, 69, "", 0, 1],
    [53000, 69, "依", 1, 5],
    [57999, 69, "依", 1, 1],
    [58000, 69, "依田", 2, 5],
    [62999, 69, "依田", 2, 1],
    [63000, 69, "依田芳", 3, 10],
    [72999, 69, "依田芳", 3, 1],
    [73000, 69, "依田芳乃", 4, 0],
  ]) {
    const progress = roundProgress(ms, TRAINING_CONFIG);
    assert.equal(progress.regularCount, regular, `${ms}: ordinary`);
    assert.equal(progress.earned.join(""), earned, `${ms}: earned`);
    assert.equal(progress.stageIndex, stage, `${ms}: stage`);
    assert.equal(progress.remaining, remaining, `${ms}: remaining`);
    assert.equal(progress.complete, ms === 73000);
  }
  assert.equal(roundProgress(25000, TRAINING_CONFIG).complete, false);
  assert.equal(roundProgress(74000, TRAINING_CONFIG).elapsedMs, 73000);
  for (const ms of [48000, 53000, 58000, 63000])
    assert.equal(roundProgress(ms, TRAINING_CONFIG).charge, 0);
  assert.equal(roundProgress(68000, TRAINING_CONFIG).charge, 0.5);
});

test("a reshuffled bag never starts with the last glyph of the previous bag", () => {
  let position = 0;
  const sequence = createGlyphSequence(() =>
    position++ < O_KANJI.length - 1 ? 0.999999 : 0,
  );
  const take = (count) =>
    Array.from({ length: count }, () => sequence.next().value);
  take(4);
  const first = take(O_KANJI.length);
  const next = take(O_KANJI.length);
  assert.notEqual(first.at(-1), next[0]);
  assert.equal(new Set(next).size, O_KANJI.length);
});

test("hidden microphone limit excludes trailing silence and preserves only earned milestones", () => {
  const detector = calibrated({ maxDurationMs: 73000 });
  detector.update(1000, wind);
  detector.update(1200, wind);
  assert.equal(detector.update(73900, wind).type, "blowing");
  assert.equal(detector.update(74000, quiet).type, "blowing");
  const end = detector.update(74650, quiet);
  assert.equal(end.type, "end");
  assert.equal(end.durationMs, 72900);
  assert.equal(end.capped, false);
  assert.deepEqual(roundProgress(end.durationMs, TRAINING_CONFIG).earned, [
    "依",
    "田",
    "芳",
  ]);
  assert.equal(roundProgress(end.durationMs, TRAINING_CONFIG).complete, false);
});

for (const course of [CONFIG, TRAINING_CONFIG]) {
  test(`a brief dip across the ${course.maxBlowSeconds}-second boundary can recover within the normal silence window`, () => {
    const limit = course.maxBlowSeconds * 1000;
    const detector = calibrated({ maxDurationMs: limit });
    detector.update(1000, wind);
    detector.update(1200, wind);
    detector.update(1000 + limit - 100, wind);
    const dip = detector.update(1000 + limit, quiet);
    assert.equal(dip.type, "blowing");
    assert.equal(dip.durationMs, limit - 100);
    const end = detector.update(1000 + limit + 20, wind);
    assert.equal(end.type, "end");
    assert.equal(end.capped, true);
    assert.equal(end.durationMs, limit);
    assert.equal(roundProgress(end.durationMs, course).complete, true);
    assert.equal(
      glyphsForDuration(end.durationMs, course).at(-1),
      course === TRAINING_CONFIG ? "乃" : "芳",
    );
  });
}
