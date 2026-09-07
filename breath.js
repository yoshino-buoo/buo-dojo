import { CONFIG } from "./config.js";

// The first four glyphs form the playful "ぶおー" opening sequence.
// Following glyphs have the reading オ / お, including kun and uncommon readings.
// Prefer positive or neutral senses: harmony, nature, places, and everyday objects.
// Reading references: https://www.kanjipedia.jp/sakuin/onkun/%E3%82%AA
// https://kanjitisiki.com/yomi-sakuin/05.html (the オ and お sections only).
export const OPENING_KANJI = Object.freeze(["武", "謳", "鶯", "王"]);
export const O_KANJI = Object.freeze([
  "緒",
  "御",
  "尾",
  "雄",
  "小",
  "於",
  "和",
  "烏",
  "牡",
  "苧",
  "咊", // Harmony; a variant of 和.
  "鴮", // Pelican.
  "醧", // A gathering of close friends.
  "箊", // A bamboo name.
  "荢", // Used in personal and place names.
  "唹",
  "塢",
  "嵨", // A mountain name.
  "埡", // Earth; plastering with earth.
  "鄔",
  "鎢", // A small pot; tungsten.
  "杇",
  "釫", // A trowel or farming tool.
  "龢",
  "圬",
  "弙",
  "緖", // Connections; the older form of 緒.
  "瑦",
  "螐",
  "隖",
  "陓", // An ancient place name.
  "鰞",
]);

/** Each round owns its sequence; draw every candidate once before reshuffling. */
export function* createGlyphSequence(random = Math.random) {
  yield* OPENING_KANJI;
  while (true) {
    const pool = [...O_KANJI];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    yield* pool;
  }
}
export function roundProgress(durationMs) {
  if (!Number.isFinite(durationMs) || durationMs < 0)
    throw new RangeError("Invalid duration");
  const elapsedMs = Math.min(durationMs, CONFIG.maxBlowSeconds * 1000);
  const regularMs = CONFIG.regularPhaseSeconds * 1000;
  const complete = elapsedMs >= CONFIG.maxBlowSeconds * 1000;
  return {
    elapsedMs,
    regularCount: Math.min(
      CONFIG.regularGlyphCount,
      Math.floor((elapsedMs * (CONFIG.regularGlyphCount - 1)) / regularMs) + 1,
    ),
    complete,
    charging: elapsedMs >= regularMs && !complete,
    charge: Math.max(
      0,
      Math.min(
        1,
        (elapsedMs - regularMs) / (CONFIG.maxBlowSeconds * 1000 - regularMs),
      ),
    ),
  };
}

/** Match the displayed 7.3 seconds, which truncates to one decimal place. */
export function isYoshinoRecord(durationMs) {
  return Math.floor(durationMs / 100) === 73;
}

export function glyphsForDuration(durationMs) {
  const progress = roundProgress(durationMs);
  const sequence = createGlyphSequence();
  const glyphs = Array.from(
    { length: progress.regularCount },
    () => sequence.next().value,
  );
  if (progress.complete) glyphs.push(CONFIG.finalKanji);
  return glyphs;
}

export function analyzeSignal(samples, spectrum, sampleRate) {
  let mean = 0;
  for (const sample of samples) mean += sample;
  mean /= samples.length || 1;
  let energy = 0,
    peak = 0;
  for (const sample of samples) {
    const centered = sample - mean;
    energy += centered * centered;
    peak = Math.max(peak, Math.abs(centered));
  }
  const rms = Math.sqrt(energy / (samples.length || 1));
  let total = 0,
    low = 0,
    high = 0,
    logSum = 0,
    bins = 0;
  const binHz = sampleRate / (spectrum.length * 2);
  for (let i = 1; i < spectrum.length; i++) {
    const hz = i * binHz;
    if (hz < 60 || hz > 6500) continue;
    const power = Math.max(1e-12, 10 ** (spectrum[i] / 10));
    total += power;
    if (hz < 550) low += power;
    if (hz > 1800) high += power;
    logSum += Math.log(power);
    bins++;
  }
  return {
    rms,
    crest: rms ? peak / rms : 0,
    flatness: bins && total ? Math.exp(logSum / bins) / (total / bins) : 0,
    lowRatio: total ? low / total : 0,
    highRatio: total ? high / total : 0,
  };
}

/** Calibrate → sustained onset → continuous breath → trailing silence. */
export class BreathDetector {
  constructor({
    sensitivity = 100,
    calibrationMs = 800,
    startHoldMs = 200,
    endSilenceMs = 750,
    maxDurationMs = CONFIG.maxBlowSeconds * 1000,
  } = {}) {
    Object.assign(this, {
      sensitivity,
      calibrationMs,
      startHoldMs,
      endSilenceMs,
      maxDurationMs,
    });
    this.state = "calibrating";
    this.firstFrameAt = null;
    this.noiseSamples = [];
    this.noiseFloor = 0.002;
    this.candidateAt = null;
    this.startedAt = null;
    this.lastActiveAt = null;
  }
  get threshold() {
    const sensitivity = Math.max(0, Math.min(100, this.sensitivity));
    const factor = 1.65 - (sensitivity / 100) * 1.2;
    return Math.max(0.009 * factor, this.noiseFloor * (2.3 * factor + 0.7));
  }
  get durationMs() {
    return this.startedAt === null
      ? 0
      : Math.max(
          0,
          Math.min(this.maxDurationMs, this.lastActiveAt - this.startedAt),
        );
  }
  update(now, features) {
    if (!Number.isFinite(now) || !Number.isFinite(features.rms))
      throw new TypeError("Invalid audio frame");
    if (this.state === "ended")
      return { type: "ended", level: 0, durationMs: this.durationMs };
    if (this.firstFrameAt === null) this.firstFrameAt = now;
    if (this.state === "calibrating") {
      this.noiseSamples.push(features.rms);
      if (now - this.firstFrameAt < this.calibrationMs)
        return { type: "calibrating", level: 0 };
      this.noiseSamples.sort((a, b) => a - b);
      this.noiseFloor = Math.max(
        0.0004,
        Math.min(
          0.03,
          this.noiseSamples[Math.floor(this.noiseSamples.length * 0.2)],
        ),
      );
      this.noiseSamples = [];
      this.state = "listening";
      return { type: "ready", level: 0 };
    }
    const threshold = this.threshold * (this.state === "blowing" ? 0.63 : 1);
    // Turbulent broadband noise or low-frequency wind. This is a heuristic,
    // not speech recognition: the help screen describes possible false positives.
    const noiseLike =
      features.flatness > 0.1 ||
      features.highRatio > 0.12 ||
      (features.lowRatio > 0.5 && features.crest < 6);
    const active = features.rms > threshold && noiseLike;
    const level = Math.max(0, Math.min(1, features.rms / (this.threshold * 3)));
    if (this.state === "listening") {
      if (active) {
        this.candidateAt ??= now;
        if (now - this.candidateAt >= this.startHoldMs) {
          this.state = "blowing";
          this.startedAt = this.candidateAt;
          this.lastActiveAt = now;
          return {
            type: "start",
            level,
            startedAt: this.startedAt,
            durationMs: this.durationMs,
          };
        }
      } else {
        this.candidateAt = null;
        if (features.rms < this.threshold * 0.65)
          this.noiseFloor = this.noiseFloor * 0.995 + features.rms * 0.005;
      }
      return { type: "listening", level };
    }
    if (active) this.lastActiveAt = now;
    if (
      now - this.startedAt >= this.maxDurationMs ||
      now - this.lastActiveAt >= this.endSilenceMs
    ) {
      this.state = "ended";
      return {
        type: "end",
        level: 0,
        durationMs: this.durationMs,
        capped: now - this.startedAt >= this.maxDurationMs,
      };
    }
    return { type: "blowing", level, durationMs: this.durationMs };
  }
}
