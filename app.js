import { CONFIG, TRAINING_CONFIG } from "./config.js";
import { createResultSharing } from "./share.js";
import { createBlowHaptics } from "./haptics.js";
import { createGameAnalytics } from "./analytics.js";
import {
  BreathDetector,
  analyzeSignal,
  createGlyphSequence,
  isYoshinoRecord,
  roundProgress,
} from "./breath.js";

const $ = (id) => document.getElementById(id);
const resultSharing = createResultSharing();
const analytics = createGameAnalytics();
const haptics = createBlowHaptics(
  typeof navigator.vibrate === "function"
    ? navigator.vibrate.bind(navigator)
    : null,
  () => {
    updateVibrationToggle();
    toast("この環境では振動を使えません。");
  },
);
const secondsText = (ms) => (Math.floor(ms / 100) / 10).toFixed(1);
const characters = [...document.querySelectorAll(".character")];
const activeStates = [
  "requesting",
  "calibrating",
  "listening",
  "blowing",
  "celebrating",
  "demo-ready",
];
let state = "idle",
  training = false,
  mode = "microphone",
  round = null,
  lastResult = null,
  microphone = null;
let generation = 0,
  frameId = 0,
  hintTimer = 0,
  finaleTimer = 0,
  toastTimer = 0;
let holdPointer = null,
  holdKey = null,
  previousFocus = null;

function setState(next) {
  state = next;
  $("dojo").dataset.state = next;
  $("training-toggle").hidden = next !== "idle";
  $("status-text").hidden = next === "idle";
  $("status-dot").hidden = next === "idle";
  const pose = ["blowing", "celebrating"].includes(next)
    ? "c"
    : ["requesting", "calibrating", "listening", "demo-ready"].includes(next)
      ? "b"
      : "a";
  for (const element of characters)
    element.hidden = !element.classList.contains(`character-${pose}`);
  const micLive =
    mode === "microphone" &&
    ["calibrating", "listening", "blowing"].includes(next);
  $("breath-meter").hidden = !micLive;
  $("session-tools").hidden =
    !activeStates.includes(next) || next === "celebrating";
  $("sensitivity").hidden = !micLive;
  document.querySelector('label[for="sensitivity"]').hidden = !micLive;
  $("session-counter").hidden = ![
    "blowing",
    "celebrating",
    "listening",
    "demo-ready",
  ].includes(next);
  $("demo-button").hidden = ![
    "idle",
    "requesting",
    "calibrating",
    "listening",
  ].includes(next);
  $("start-button").hidden =
    mode === "demo" && ["demo-ready", "blowing"].includes(next);
  $("hold-button").hidden = !(
    mode === "demo" && ["demo-ready", "blowing"].includes(next)
  );
  $("start-button").disabled = [
    "requesting",
    "calibrating",
    "listening",
    "blowing",
    "celebrating",
  ].includes(next);
  const copy = {
    idle: [
      "準備ができたら、はじめましょう",
      "法螺貝を吹く",
      "マイクを許可して、スマホにふーっと。",
      "そなたも、ご一緒にー♪",
    ],
    requesting: [
      "マイクの使用を許可してください",
      "マイクを準備中…",
      "許可の画面が出たら「許可」を選んでください。",
      "法螺貝を、構えましてー",
    ],
    calibrating: [
      "少しだけ、静かにお待ちください",
      "まわりの音を確認中…",
      "まだ吹かずに、そのままで。",
      "耳をすませましてー",
    ],
    listening: [
      "準備できました。ふーっと吹いてみて",
      "息を待っています…",
      "スマホのマイクに、やさしく息を吹きかけて。",
      "そなたの息吹を、どうぞー",
    ],
    "demo-ready": [
      "おためしモード · 長押しで遊べます",
      "",
      "指をはなすと、今回の記録が届きます。",
      "指先でも、ご一緒にー♪",
    ],
    blowing: [
      mode === "demo"
        ? "おためし中 · 指をはなすとおしまい"
        : "よき響き！そのまま、ふーっと",
      "ぶおーっと、吹いています",
      "無理せず、そなたのペースで。",
      "",
    ],
    celebrating: [
      "お見事！皆伝です",
      "皆伝！",
      "最後のひと文字、届きましてー。",
      "",
    ],
  }[next];
  if (copy) {
    $("status-text").textContent = copy[0];
    $("start-label").textContent = copy[1];
    $("button-note").textContent = copy[2];
    $("speech").textContent = copy[3];
    if (training && ["idle", "demo-ready"].includes(next))
      $("speech").textContent = "では、さらなる高みへ参りましょうー";
    if (training && next === "celebrating") {
      $("speech").textContent =
        "……これは、これはー。\nわたくしも驚きましてー……";
      $("status-text").textContent = "お見事！超・皆伝です";
      $("start-label").textContent = "超・皆伝！";
      $("button-note").textContent = "四文字、揃いましてー。";
    }
  }
}

function updateMeter(level) {
  $("meter-fill").style.transform = `scaleX(${level})`;
  $("meter").setAttribute("aria-valuenow", String(Math.round(level * 100)));
}

function stopResources() {
  haptics.stop();
  generation++;
  cancelAnimationFrame(frameId);
  clearTimeout(hintTimer);
  clearTimeout(finaleTimer);
  holdPointer = null;
  holdKey = null;
  const old = microphone;
  microphone = null;
  if (old) {
    old.stream?.getTracks().forEach((track) => track.stop());
    old.source?.disconnect();
    old.analyser?.disconnect();
    if (old.context.state !== "closed") old.context.close().catch(() => {});
  }
  updateMeter(0);
}

function reset() {
  stopResources();
  round = null;
  $("particles").replaceChildren();
  $("live-count").textContent = "0";
  $("live-time").textContent = "0.0";
  $("dojo").dataset.phase = "regular";
  $("dojo").style.setProperty("--charge", 0);
  $("charge-cue").hidden = true;
  $("charge-orbit").hidden = true;
  $("finale-effect").hidden = true;
  $("charge-name").hidden = true;
  $("dojo").dataset.super = "false";
  setState("idle");
}

function toast(message) {
  clearTimeout(toastTimer);
  // Dialogs live in the top layer; feedback must be inside the open dialog.
  (document.querySelector("dialog[open]") || document.body).append($("toast"));
  $("toast").textContent = message;
  $("toast").hidden = false;
  toastTimer = setTimeout(() => {
    $("toast").hidden = true;
    document.body.append($("toast"));
  }, 3800);
}

function showModal(dialog) {
  previousFocus = document.activeElement;
  document.body.style.overflow = "hidden";
  dialog.showModal();
}
function hideModal(dialog) {
  dialog.close();
}

function beginBlow(startedAt) {
  clearTimeout(hintTimer);
  round = {
    startedAt,
    elapsedMs: 0,
    glyphs: [],
    sequence: createGlyphSequence(),
    mode,
    training,
    course: training ? TRAINING_CONFIG : CONFIG,
    earned: [],
  };
  setState("blowing");
  round.animation = characters
    .find((element) => element.classList.contains("character-c"))
    .getAnimations()
    .find((animation) => animation.animationName === "blow");
  advanceRound(0);
}

function spawnGlyph(glyph, index, milestone = false) {
  const particle = document.createElement("span");
  particle.className = milestone
    ? "kanji-particle milestone-particle"
    : "kanji-particle";
  particle.textContent = glyph;
  particle.style.setProperty(
    "--drift",
    `${[-66, -38, -85, 15, -48][index % 5]}px`,
  );
  particle.style.setProperty("--turn", `${[-14, 12, -8, 18][index % 4]}deg`);
  particle.style.setProperty(
    "--particle-color",
    ["#bf6653", "#157c8c", "#af853c", "#8b694d"][index % 4],
  );
  $("particles").append(particle);
  setTimeout(() => particle.remove(), 2800);
}

function advanceRound(elapsedMs) {
  if (!round) return;
  const progress = roundProgress(Math.max(0, elapsedMs), round.course);
  round.elapsedMs = progress.elapsedMs;
  while (round.glyphs.length < progress.regularCount) {
    const index = round.glyphs.length,
      glyph = round.sequence.next().value;
    round.glyphs.push(glyph);
    spawnGlyph(glyph, index);
  }
  while (round.earned.length < progress.earned.length) {
    const glyph = progress.earned[round.earned.length];
    round.earned.push(glyph);
    round.glyphs.push(glyph);
    if (round.training && !progress.complete)
      spawnGlyph(glyph, round.glyphs.length - 1, true);
  }
  if (progress.charging) {
    if (
      $("dojo").dataset.phase !== "charging" ||
      round.stageIndex !== progress.stageIndex
    ) {
      round.stageIndex = progress.stageIndex;
      round.remaining = null;
      $("dojo").dataset.phase = "charging";
      $("charge-cue").hidden = false;
      $("charge-orbit").hidden = false;
      $("status-text").textContent = round.training
        ? `「${progress.stageKanji}」へ、もうひと吹きー！`
        : "あとひと吹きー！";
      $("button-note").textContent = round.training
        ? "無理せず、そなたのペースで。"
        : "花がそろうと、最後のひと文字。";
      $("charge-caption").textContent = round.training
        ? `隠し修行 · ${progress.stageIndex + 1} / 4`
        : "最後のひと吹き";
      $("charge-name").hidden = !round.training;
      for (let i = 0; i < 4; i++) {
        $(`name-glyph-${i}`).dataset.earned = String(i < round.earned.length);
        $(`name-glyph-${i}`).dataset.current = String(
          i === progress.stageIndex,
        );
      }
    }
    $("dojo").style.setProperty("--charge", progress.charge);
    // Changing duration would recalculate every elapsed iteration. Adjust the
    // playback rate instead so acceleration preserves the current pose.
    const period = 0.72 * (1 - progress.charge) + 0.2 * progress.charge;
    round.animation?.updatePlaybackRate(0.72 / period);
    const remaining = progress.remaining;
    if (round.remaining !== remaining) {
      round.remaining = remaining;
      $("charge-remaining").textContent = String(remaining);
      for (let i = 1; i <= 5; i++)
        $(`charge-flower-${i}`).dataset.lit = String(
          i <= Math.floor(progress.charge * 5) + 1,
        );
    }
  }
  $("live-count").textContent = String(round.glyphs.length);
  $("live-time").textContent = secondsText(round.elapsedMs);
  if (
    state === "blowing" &&
    !progress.complete &&
    !document.hidden &&
    document.hasFocus?.() !== false
  )
    haptics.update(round.animation, performance.now());
  else haptics.stop();
}

function finishRound(elapsedMs = round?.elapsedMs, detail = "") {
  if (state !== "blowing" || !round) return;
  advanceRound(elapsedMs);
  lastResult = {
    mode: round.mode,
    training: round.training,
    durationMs: round.elapsedMs,
    glyphs: [...round.glyphs],
    mastery: roundProgress(round.elapsedMs, round.course).complete,
    earned: [...round.earned],
    detail,
  };
  stopResources();
  analytics.recordResult(lastResult);
  $("charge-cue").hidden = true;
  $("charge-orbit").hidden = true;
  if (lastResult.mastery) {
    $("dojo").dataset.super = String(lastResult.training);
    round.animation?.updatePlaybackRate(0.72 / 1.5);
    setState("celebrating");
    $("finale-kanji").textContent = round.course.finalKanji;
    $("finale-effect").hidden = false;
    const token = generation;
    const reducedMotion = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    finaleTimer = setTimeout(
      () => {
        if (generation === token && state === "celebrating") showResult();
      },
      lastResult.training
        ? reducedMotion
          ? 3200
          : 4200
        : reducedMotion
          ? 350
          : 1800,
    );
  } else showResult();
}

function showResult() {
  clearTimeout(finaleTimer);
  $("finale-effect").hidden = true;
  setState("result");
  const yoshinoRecord = isYoshinoRecord(lastResult.durationMs);
  const superMastery = lastResult.training && lastResult.mastery;
  $("result-dialog").dataset.training = String(lastResult.training);
  $("result-dialog").dataset.super = String(superMastery);
  $("result-dialog").dataset.mastery = String(lastResult.mastery);
  $("result-dialog").dataset.yoshino = String(yoshinoRecord);
  $("result-stamp").textContent = yoshinoRecord
    ? "依田\n芳乃"
    : superMastery
      ? "超・\n皆伝"
      : lastResult.mastery
        ? "皆伝"
        : "大変\nよき音";
  $("result-stamp").setAttribute(
    "aria-hidden",
    String(!(yoshinoRecord || superMastery)),
  );
  $("mastery-award").hidden = !lastResult.mastery;
  $("result-final-kanji").textContent = lastResult.mastery
    ? lastResult.earned.join("")
    : "";
  $("award-caption").textContent = superMastery
    ? "四文字、揃いましてー"
    : "最後の一文字";
  $("result-count").textContent = String(lastResult.glyphs.length);
  $("result-time").textContent = secondsText(lastResult.durationMs);
  $("result-mode").hidden = lastResult.mode !== "demo";
  $("result-message").textContent = superMastery
    ? "……これは、これはー。\nわたくしも驚きましてー……"
    : lastResult.mastery
      ? "見事な、ひと吹きでしてー。"
      : lastResult.durationMs >= 10000
        ? "遠くまで、届きましてー。"
        : "よき響きでしてー。";
  $("result-detail").textContent = lastResult.detail;
  $("result-detail").hidden = !lastResult.detail || lastResult.mastery;
  const regularGlyphs = lastResult.mastery
    ? lastResult.glyphs.slice(0, -lastResult.earned.length)
    : lastResult.glyphs;
  const glyphCount = regularGlyphs.length;
  const columns =
    lastResult.training && glyphCount > 30
      ? Math.min(12, Math.ceil(Math.sqrt(glyphCount * 1.8)))
      : lastResult.mastery
        ? 6
        : glyphCount <= 4
          ? glyphCount
          : Math.min(8, Math.ceil(Math.sqrt(glyphCount * 1.8)));
  $("result-kanji").style.setProperty("--glyph-columns", columns);
  $("result-kanji").style.setProperty(
    "--glyph-rows",
    Math.ceil(glyphCount / columns),
  );
  $("result-kanji").replaceChildren(
    ...regularGlyphs.map((glyph, index) => {
      const tile = document.createElement("span");
      tile.textContent = glyph;
      if (lastResult.training && index >= TRAINING_CONFIG.regularGlyphCount)
        tile.className = "earned-glyph";
      tile.style.setProperty("--i", Math.min(index, 12));
      return tile;
    }),
  );
  resultSharing.prepare(lastResult);
  showModal($("result-dialog"));
}

function microphoneError(error) {
  const messages = {
    NotAllowedError:
      "マイクを使えませんでした。ブラウザの設定で許可するか、おためしで遊べます。",
    NotFoundError: "マイクが見つかりませんでした。おためしで遊べます。",
    NotReadableError:
      "マイクを開けませんでした。他のアプリの使用を止めて、もう一度どうぞ。",
    SecurityError:
      "この環境ではマイクを使えません。SafariやChromeで開いてください。",
  };
  reset();
  $("training-toggle").hidden = true;
  $("status-text").hidden = false;
  const localizedMessage = /[\u3040-\u30ff]/u.test(error?.message || "")
    ? error.message
    : "";
  $("status-text").textContent =
    messages[error?.name] ||
    localizedMessage ||
    "マイクを準備できませんでした。おためしで遊べます。";
  $("button-note").textContent = "下の「マイクなしでおためし」でも遊べます。";
}

async function startMicrophone() {
  reset();
  mode = "microphone";
  setState("requesting");
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    microphoneError({
      message:
        "マイクにはHTTPSのページが必要です。おためしでは、そのまま遊べます。",
    });
    return;
  }
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) {
    microphoneError({
      message: "このブラウザではマイクで遊べません。おためしをどうぞ。",
    });
    return;
  }
  const token = generation;
  let context;
  try {
    // Resume inside the user gesture, before awaiting permission, for iOS Safari.
    context = new AudioContext();
    microphone = { context, stream: null };
    const resumed = context.resume().catch(() => {});
    hintTimer = setTimeout(() => {
      if (state === "requesting" && token === generation)
        $("button-note").textContent =
          "許可画面が見つからないときは、おためしでも遊べます。";
    }, 10000);
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: 1,
      },
      video: false,
    });
    if (token !== generation) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }
    microphone.stream = stream;
    clearTimeout(hintTimer);
    await resumed;
    if (token !== generation) return;
    if (context.state !== "running")
      throw new Error(
        "マイクの準備が中断されました。もう一度ボタンを押してください。",
      );
    const source = context.createMediaStreamSource(stream),
      analyser = context.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.15;
    source.connect(analyser); // Intentionally never connected to speaker output.
    const detector = new BreathDetector({
      sensitivity: Number($("sensitivity").value),
      maxDurationMs:
        (training ? TRAINING_CONFIG : CONFIG).maxBlowSeconds * 1000,
    });
    const samples = new Float32Array(analyser.fftSize),
      spectrum = new Float32Array(analyser.frequencyBinCount);
    Object.assign(microphone, { source, analyser, detector });
    for (const track of stream.getTracks())
      track.addEventListener("ended", () => {
        if (token !== generation) return;
        if (state === "blowing")
          finishRound(
            round.elapsedMs,
            "マイクの接続が終了したため、ここまでの記録です。",
          );
        else
          microphoneError({
            message: "マイクの接続が終了しました。もう一度お試しください。",
          });
      });
    setState("calibrating");
    const monitor = (now) => {
      if (token !== generation || !microphone) return;
      if (context.state !== "running") {
        if (state === "blowing")
          finishRound(
            round.elapsedMs,
            "音声が中断されたため、ここまでの記録です。",
          );
        else
          microphoneError({
            message: "音声が中断されました。もう一度ボタンを押してください。",
          });
        return;
      }
      analyser.getFloatTimeDomainData(samples);
      analyser.getFloatFrequencyData(spectrum);
      detector.sensitivity = Number($("sensitivity").value);
      const event = detector.update(
        now,
        analyzeSignal(samples, spectrum, context.sampleRate),
      );
      updateMeter(event.level);
      if (event.type === "ready") {
        setState("listening");
        hintTimer = setTimeout(() => {
          if (state === "listening")
            $("status-text").textContent =
              "反応しないときは、感度を右へ調整してみて";
        }, 10000);
      }
      if (event.type === "start") beginBlow(event.startedAt);
      if (event.type === "start" || event.type === "blowing")
        advanceRound(event.durationMs);
      if (event.type === "end") {
        finishRound(
          event.durationMs,
          event.capped
            ? `${round.course.maxBlowSeconds}秒で終了しました。`
            : "",
        );
        return;
      }
      frameId = requestAnimationFrame(monitor);
    };
    frameId = requestAnimationFrame(monitor);
  } catch (error) {
    if (token === generation) microphoneError(error);
    else if (context && context.state !== "closed")
      context.close().catch(() => {});
  }
}

function prepareDemo() {
  reset();
  mode = "demo";
  setState("demo-ready");
}
function startHold() {
  if (state !== "demo-ready") return;
  beginBlow(performance.now());
  const tick = (now) => {
    if (state !== "blowing" || mode !== "demo") return;
    advanceRound(now - round.startedAt);
    if (round.elapsedMs >= round.course.maxBlowSeconds * 1000) {
      finishRound(round.elapsedMs);
      return;
    }
    frameId = requestAnimationFrame(tick);
  };
  frameId = requestAnimationFrame(tick);
}
function endHold() {
  if (state === "blowing" && mode === "demo")
    finishRound(performance.now() - round.startedAt);
}

function interruptRound() {
  if (state === "blowing")
    finishRound(
      mode === "demo" ? performance.now() - round.startedAt : round.elapsedMs,
      "画面を離れたため、ここまでの記録です。",
    );
  else if (state !== "celebrating" && activeStates.includes(state)) reset();
  // A round can reach the limit in the same event that backgrounds the page.
  if (state === "celebrating") showResult();
}

$("training-toggle").addEventListener("click", () => {
  if (state !== "idle") return;
  training = !training;
  $("training-toggle").setAttribute("aria-checked", String(training));
  $("dojo").dataset.training = String(training);
  setState("idle");
});

function updateVibrationToggle() {
  const button = $("vibration-button");
  button.disabled = !haptics.supported;
  button.setAttribute("aria-pressed", String(haptics.enabled));
  button.setAttribute(
    "aria-label",
    haptics.supported
      ? `振動：${haptics.enabled ? "オン" : "オフ"}`
      : "振動：このブラウザは非対応です",
  );
  button.title = haptics.supported
    ? "吹いている間、芳乃の動きに合わせて軽く振動します"
    : "このブラウザは振動に対応していません";
  $("vibration-label").textContent = haptics.supported ? "振動" : "振動 ×";
}
updateVibrationToggle();
$("vibration-button").addEventListener("click", () => {
  haptics.setEnabled(!haptics.enabled);
  updateVibrationToggle();
});

$("start-button").addEventListener("click", startMicrophone);
$("demo-button").addEventListener("click", () => {
  prepareDemo();
  $("hold-button").focus({ preventScroll: true });
});
$("cancel-button").addEventListener("click", () => {
  if (state === "blowing")
    finishRound(round.elapsedMs, "ここまでの響きを、記録しました。");
  else reset();
});
$("hold-button").addEventListener("pointerdown", (event) => {
  if (event.button !== 0 || state !== "demo-ready") return;
  event.preventDefault();
  holdPointer = event.pointerId;
  $("hold-button").setPointerCapture(event.pointerId);
  startHold();
});
for (const name of ["pointerup", "pointercancel", "lostpointercapture"])
  $("hold-button").addEventListener(name, (event) => {
    if (event.pointerId === holdPointer) endHold();
  });
$("hold-button").addEventListener("contextmenu", (event) =>
  event.preventDefault(),
);
$("hold-button").addEventListener("keydown", (event) => {
  if (![" ", "Enter"].includes(event.key)) return;
  event.preventDefault();
  if (!event.repeat && state === "demo-ready") {
    holdKey = event.key;
    startHold();
  }
});
$("hold-button").addEventListener("keyup", (event) => {
  if (event.key === holdKey) {
    event.preventDefault();
    endHold();
  }
});
$("hold-button").addEventListener("blur", () => {
  if (holdKey !== null) endHold();
});
$("again-button").addEventListener("click", () => {
  hideModal($("result-dialog"));
  if (mode === "demo") {
    prepareDemo();
    $("hold-button").focus({ preventScroll: true });
  } else startMicrophone();
});
$("result-close").addEventListener("click", () =>
  hideModal($("result-dialog")),
);
$("share-button").addEventListener("click", resultSharing.share);
$("share-preview-button").addEventListener("click", resultSharing.show);
$("help-button").addEventListener("click", () => {
  if (["blowing", "celebrating"].includes(state)) {
    interruptRound();
    return;
  }
  if (activeStates.includes(state)) reset();
  showModal($("help-dialog"));
});
for (const id of ["help-close", "help-done"])
  $(id).addEventListener("click", () => hideModal($("help-dialog")));
for (const dialog of document.querySelectorAll("dialog")) {
  dialog.addEventListener("close", () => {
    document.body.style.overflow = "";
    $("toast").hidden = true;
    document.body.append($("toast"));
    // The close event can run after "Again" has already started a new round.
    if (dialog.id === "result-dialog" && state === "result") reset();
    if (state === "idle") $("start-button").focus({ preventScroll: true });
    else if (dialog.id === "help-dialog")
      previousFocus?.focus({ preventScroll: true });
  });
  dialog.addEventListener("click", (event) => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (
      event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom
    )
      hideModal(dialog);
  });
}
function enableVoteTouch(link) {
  let gesture = null;
  const cancel = () => {
    gesture = null;
  };
  link.addEventListener(
    "touchstart",
    (event) => {
      if (event.touches.length !== 1) return cancel();
      const touch = event.touches[0];
      gesture = {
        id: touch.identifier,
        x: touch.clientX,
        y: touch.clientY,
        startedAt: performance.now(),
      };
    },
    { passive: true },
  );
  link.addEventListener(
    "touchmove",
    (event) => {
      if (!gesture) return;
      const touch = Array.from(event.touches).find(
        (item) => item.identifier === gesture.id,
      );
      if (
        !touch ||
        event.touches.length !== 1 ||
        Math.hypot(touch.clientX - gesture.x, touch.clientY - gesture.y) > 10
      )
        cancel();
    },
    { passive: true },
  );
  link.addEventListener("touchcancel", cancel, { passive: true });
  link.addEventListener("contextmenu", cancel);
  document.addEventListener("scroll", cancel, { capture: true, passive: true });
  link.addEventListener(
    "touchend",
    (event) => {
      const tap = gesture;
      cancel();
      if (
        !tap ||
        event.defaultPrevented ||
        !event.cancelable ||
        event.touches.length ||
        performance.now() - tap.startedAt > 500 ||
        link.getAttribute("aria-disabled") === "true" ||
        !link.hasAttribute("href")
      )
        return;
      const touch = Array.from(event.changedTouches).find(
        (item) => item.identifier === tap.id,
      );
      if (
        !touch ||
        Math.hypot(touch.clientX - tap.x, touch.clientY - tap.y) > 10 ||
        !link.contains(document.elementFromPoint(touch.clientX, touch.clientY))
      )
        return;
      // iOS can withhold its synthesized click after a touch. Activate within
      // this user gesture, then suppress that later click to avoid two tabs or
      // duplicate analytics. The regular anchor click still owns navigation.
      event.preventDefault();
      link.click();
    },
    { passive: false },
  );
}

let voteUrl;
try {
  const candidate = new URL(CONFIG.voteUrl);
  if (["http:", "https:"].includes(candidate.protocol))
    voteUrl = candidate.href;
} catch {
  /* Awaiting voting destination. */
}
if (voteUrl) {
  $("vote-button").href = voteUrl;
  enableVoteTouch($("vote-button"));
  $("vote-button").addEventListener("click", () =>
    analytics.recordVote(lastResult),
  );
  $("vote-button").addEventListener("auxclick", (event) => {
    if (event.button === 1) analytics.recordVote(lastResult);
  });
} else {
  $("vote-button").removeAttribute("href");
  $("vote-button").removeAttribute("target");
  $("vote-button").setAttribute("aria-disabled", "true");
  $("vote-button").tabIndex = 0;
  $("vote-button").addEventListener("click", (event) => {
    event.preventDefault();
    toast("投票先は、ただいま準備中です。");
  });
  $("vote-button").addEventListener("keydown", (event) => {
    if (["Enter", " "].includes(event.key)) {
      event.preventDefault();
      toast("投票先は、ただいま準備中です。");
    }
  });
}
document.addEventListener("visibilitychange", () => {
  if (document.hidden) interruptRound();
});
window.addEventListener("pagehide", () => {
  interruptRound();
  stopResources();
});
window.addEventListener("pageshow", (event) => {
  if (event.persisted && activeStates.includes(state)) reset();
});
window.addEventListener("blur", () => {
  haptics.stop();
  if (mode === "demo" && state === "blowing") endHold();
});

// Optional browser-native tools use the same game actions and never activate a mic.
if (document.modelContext?.registerTool) {
  const lifecycle = new AbortController();
  const definitions = [
    {
      name: "read_dojo_state",
      description: "Read the game state and latest round.",
      annotations: { readOnlyHint: true },
      execute: () => ({ state, mode, result: lastResult }),
    },
    {
      name: "prepare_dojo_demo",
      description:
        "Prepare the microphone-free demo; the player then holds the visible button.",
      execute: () => {
        if (
          document.querySelector("dialog[open]") ||
          activeStates.includes(state)
        )
          throw new Error("Finish or cancel the current interaction first.");
        prepareDemo();
        return { state, mode };
      },
    },
  ];
  for (const definition of definitions) {
    const execute = definition.execute;
    definition.inputSchema = {
      type: "object",
      properties: {},
      additionalProperties: false,
    };
    definition.execute = (input) => {
      if (
        input == null ||
        typeof input !== "object" ||
        Array.isArray(input) ||
        Object.keys(input).length
      )
        throw new TypeError("Expected an empty object.");
      return execute();
    };
    try {
      Promise.resolve(
        document.modelContext.registerTool(definition, {
          signal: lifecycle.signal,
        }),
      ).catch(() => {});
    } catch {
      /* Experimental API unavailable. */
    }
  }
  window.addEventListener("pagehide", () => lifecycle.abort(), { once: true });
}
for (const source of [
  "./assets/character%20B.PNG",
  "./assets/character%20C.PNG",
]) {
  const image = new Image();
  image.src = source;
}
setState("idle");
