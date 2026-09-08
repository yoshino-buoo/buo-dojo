/** Site settings. voteUrl opens Yoshino's official voting page. */
export const CONFIG = Object.freeze({
  voteUrl:
    "https://idolmaster-official.jp/cinderellagirls/vote2026/vote/idol/yorita_yoshino",
  shareHashtags: ["ぶおー法螺貝道場", "依田芳乃", "シンデレラガール総選挙2026"],
  regularGlyphCount: 30,
  regularPhaseSeconds: 20,
  maxBlowSeconds: 25,
  finalKanji: "芳",
  chargeStages: Object.freeze([Object.freeze({ kanji: "芳", seconds: 5 })]),
});

/** Opt-in course. Microphone and demo controls are shared with the normal game. */
export const TRAINING_CONFIG = Object.freeze({
  regularGlyphCount: 69,
  regularPhaseSeconds: 48,
  maxBlowSeconds: 73,
  finalKanji: "依田芳乃",
  chargeStages: Object.freeze([
    Object.freeze({ kanji: "依", seconds: 5 }),
    Object.freeze({ kanji: "田", seconds: 5 }),
    Object.freeze({ kanji: "芳", seconds: 5 }),
    Object.freeze({ kanji: "乃", seconds: 10 }),
  ]),
});

/** Public analytics identifiers. Never put account/API credentials here. */
export const ANALYTICS = Object.freeze({
  hostname: "yoshino-buoo.github.io",
  beaconToken: "f11134e874a644b1929d42a2e3441869",
  eventsUrl: "https://buo-dojo-events.yoshino-buoo.workers.dev/events",
});
