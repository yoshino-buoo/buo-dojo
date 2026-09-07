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
