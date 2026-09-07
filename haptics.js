/** Brief pulses follow the rendered character's expansion, including speed changes. */
export function createBlowHaptics(vibrate, onUnavailable = () => {}) {
  const supported = typeof vibrate === "function";
  let enabled = false;
  let lastBeat = null;
  let lastPulseAt = -Infinity;
  let hasPulse = false;

  function stop() {
    lastBeat = null;
    lastPulseAt = -Infinity;
    if (!hasPulse) return;
    hasPulse = false;
    try {
      vibrate(0);
    } catch {
      // A hardware failure must not interrupt the game or its cleanup.
    }
  }

  function request(duration) {
    try {
      if (vibrate(duration) !== false) return true;
    } catch {
      // Browsers and device policies may reject an otherwise available API.
    }
    enabled = false;
    stop();
    onUnavailable();
    return false;
  }

  return {
    supported,
    get enabled() {
      return enabled;
    },
    setEnabled(value) {
      stop();
      enabled = Boolean(value) && supported;
      // Check availability inside the toggle's user gesture without buzzing.
      if (enabled) request(0);
      return enabled;
    },
    update(animation, now) {
      if (!enabled) return;
      const timing = animation?.effect?.getComputedTiming();
      if (
        animation?.playState !== "running" ||
        !Number.isFinite(timing?.duration) ||
        timing.duration < 100 ||
        !Number.isFinite(timing.currentIteration) ||
        !Number.isFinite(timing.progress)
      ) {
        stop();
        return;
      }
      // The blow keyframes reach their largest scale halfway through each loop.
      const beat = Math.floor(timing.currentIteration + timing.progress + 0.5);
      const previous = lastBeat;
      lastBeat = beat;
      if (previous === null || beat <= previous || now - lastPulseAt < 150)
        return;
      // At most one short pulse per frame; never replay missed beats after a stall.
      if (request(10)) {
        lastPulseAt = now;
        hasPulse = true;
      }
    },
    stop,
  };
}
