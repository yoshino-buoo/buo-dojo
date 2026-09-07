import test from "node:test";
import assert from "node:assert/strict";
import { createBlowHaptics } from "../haptics.js";

function fixture(vibrate) {
  const calls = [];
  let unavailable = 0;
  const timing = { duration: 720, currentIteration: 0, progress: 0 };
  const animation = {
    playState: "running",
    effect: { getComputedTiming: () => timing },
  };
  const haptics = createBlowHaptics(
    vibrate ||
      ((duration) => {
        calls.push(duration);
        return true;
      }),
    () => unavailable++,
  );
  function sample(phase, now) {
    timing.currentIteration = Math.floor(phase);
    timing.progress = phase % 1;
    haptics.update(animation, now);
  }
  return {
    haptics,
    calls,
    timing,
    animation,
    sample,
    get unavailable() {
      return unavailable;
    },
  };
}

test("haptics require opting in and unavailable devices stay off", () => {
  const f = fixture();
  f.sample(0, 0);
  f.sample(0.5, 360);
  assert.equal(f.haptics.enabled, false);
  assert.deepEqual(f.calls, []);
  assert.equal(f.haptics.setEnabled(true), true);
  assert.deepEqual(f.calls, [0]); // Availability check must not buzz on the home screen.
  const unsupported = createBlowHaptics(null);
  assert.equal(unsupported.supported, false);
  assert.equal(unsupported.setEnabled(true), false);
  unsupported.update(null, 0);
  unsupported.stop();
});

test("one brief pulse follows each expansion even when animation accelerates", () => {
  const f = fixture();
  f.haptics.setEnabled(true);
  f.sample(0, 0);
  f.sample(0.49, 350);
  assert.deepEqual(f.calls, [0]);
  f.sample(0.5, 360);
  f.sample(0.9, 640);
  f.sample(1.1, 800);
  assert.deepEqual(f.calls, [0, 10]);
  f.sample(1.5, 1080);
  // Phase comes from the rendered animation, so a faster cycle needs no new timer.
  f.sample(2.49, 1278);
  f.sample(2.5, 1280);
  f.sample(3.5, 1480);
  assert.deepEqual(f.calls, [0, 10, 10, 10, 10]);
});

test("missed frames and backwards phase changes never create a vibration burst", () => {
  const f = fixture();
  f.haptics.setEnabled(true);
  f.sample(0, 0);
  f.sample(8.7, 6000);
  assert.deepEqual(f.calls, [0, 10]);
  f.sample(8.9, 6016);
  f.sample(9.5, 6050); // Suppress an impossibly close beat after a clock jump.
  f.sample(9.6, 6200);
  assert.deepEqual(f.calls, [0, 10]);
  f.sample(10.5, 6400);
  f.sample(0.1, 6500);
  assert.deepEqual(f.calls, [0, 10, 10]);
});

test("stopping cancels the pulse, resets its phase, and preserves the user's choice", () => {
  const f = fixture();
  f.haptics.setEnabled(true);
  f.sample(0, 0);
  f.sample(0.5, 360);
  f.haptics.stop();
  f.haptics.stop();
  assert.equal(f.haptics.enabled, true);
  assert.deepEqual(f.calls, [0, 10, 0]);
  f.sample(9.8, 7000); // Resuming in mid-cycle does not replay old pulses.
  assert.deepEqual(f.calls, [0, 10, 0]);
  f.sample(10.5, 7500);
  f.haptics.setEnabled(false);
  f.sample(11.5, 8200);
  assert.deepEqual(f.calls, [0, 10, 0, 10, 0]);
});

test("missing, paused, and reduced-motion animations do not buzz", () => {
  for (const condition of ["missing", "paused", "reduced", "finished"]) {
    const f = fixture();
    f.haptics.setEnabled(true);
    f.sample(0, 0);
    f.sample(0.5, 360);
    if (condition === "reduced") f.timing.duration = 0.01;
    if (["paused", "finished"].includes(condition))
      f.animation.playState = condition;
    f.haptics.update(condition === "missing" ? null : f.animation, 400);
    f.haptics.update(condition === "missing" ? null : f.animation, 800);
    assert.deepEqual(f.calls, [0, 10, 0], condition);
  }
});

test("device rejections and exceptions turn haptics off without breaking play", () => {
  for (const throws of [false, true]) {
    let requests = 0;
    const f = fixture(() => {
      if (++requests <= 2) return true;
      if (throws) throw new Error("Unavailable device");
      return false;
    });
    f.haptics.setEnabled(true);
    f.sample(0, 0);
    f.sample(0.5, 360);
    f.sample(1.5, 1080);
    f.sample(2.5, 1800);
    assert.equal(f.haptics.enabled, false);
    assert.equal(f.unavailable, 1);
    assert.equal(requests, 4); // Probe, pulse, rejection, best-effort cancellation.
  }
});
