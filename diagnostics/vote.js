// Temporary, standalone diagnostic page. No log upload or persistent storage.
(() => {
  const entries = [];
  const start = performance.now();
  const label = (node) =>
    node instanceof Element
      ? `${node.tagName.toLowerCase()}${node.id ? `#${node.id}` : ""}`
      : "";
  const record = (type, data = {}) => {
    entries.push({ ms: Math.round(performance.now() - start), type, ...data });
    if (entries.length > 100) entries.shift();
  };
  const isVote = (event) =>
    event.composedPath().some((node) => node?.id === "vote-button");
  const report = () =>
    JSON.stringify(
      {
        version: "vote-first-visit-1",
        userAgent: navigator.userAgent,
        viewport: [innerWidth, innerHeight],
        hover: matchMedia("(hover:hover)").matches,
        pointerFine: matchMedia("(pointer:fine)").matches,
        navigation: performance.getEntriesByType("navigation")[0]?.type,
        fonts: document.fonts?.status,
        resources: performance
          .getEntriesByType("resource")
          .filter((r) => /beacon\.min\.js|\/analytics\.js|\/styles\.css/.test(r.name))
          .map((r) => ({
            file: r.name.split("/").at(-1),
            start: Math.round(r.startTime),
            duration: Math.round(r.duration),
          })),
        entries,
      },
      null,
      2,
    );

  // No touch listeners, synthetic clicks, default-action cancellation or DOM
  // updates during the gesture. Pointer targets also reveal accidental overlays.
  for (const type of [
    "pointerdown", "pointerup", "pointercancel", "mouseover", "mousemove",
    "mousedown", "mouseup", "click",
  ]) {
    document.addEventListener(
      type,
      (event) => {
        const onVote = isVote(event);
        if (!onVote && !type.startsWith("pointer")) return;
        const data = {
          target: label(event.target),
          onVote,
          trusted: event.isTrusted,
          defaultPrevented: event.defaultPrevented,
          activation: navigator.userActivation?.isActive,
        };
        if (event.pointerType) data.pointerType = event.pointerType;
        record(type, data);
        // A later task observes the state after all click listeners ran.
        if (type === "click") {
          setTimeout(() => record("click:after", {
            defaultPrevented: event.defaultPrevented,
            activation: navigator.userActivation?.isActive,
          }), 0);
        }
      },
      { capture: true, passive: true },
    );
  }
  for (const type of ["blur", "focus", "pagehide", "pageshow"]) {
    window.addEventListener(type, (event) => record(type, {
      persisted: event.persisted,
    }), { passive: true });
  }
  document.addEventListener("visibilitychange", () => record("visibility", {
    state: document.visibilityState,
  }), { passive: true });
  window.addEventListener("error", () => record("script-error"), { passive: true });
  if (navigator.sendBeacon) {
    const original = navigator.sendBeacon;
    navigator.sendBeacon = function (url, body) {
      const gameEvent = String(url).includes("/events");
      if (gameEvent) record("event-send:start");
      try {
        const queued = Reflect.apply(original, this, [url, body]);
        if (gameEvent) record("event-send:return", { queued });
        return queued;
      } catch (error) {
        record("event-send:throw", { name: error.name });
        throw error;
      }
    };
  }

  const mount = () => {
    const help = document.querySelector("#help-dialog");
    const details = document.createElement("details");
    details.id = "vote-diagnostics";
    const summary = document.createElement("summary");
    summary.textContent = "診断ログ（この画面内のみ）";
    const note = document.createElement("p");
    note.textContent = "投票を試したあと、このログをコピーしてください。自動送信はしません。";
    const textarea = document.createElement("textarea");
    textarea.readOnly = true;
    textarea.rows = 12;
    textarea.style.width = "100%";
    textarea.setAttribute("aria-label", "診断ログ");
    const copy = document.createElement("button");
    copy.type = "button";
    copy.className = "text-button";
    copy.textContent = "ログをコピー";
    details.addEventListener("toggle", () => {
      if (details.open) textarea.value = report();
    });
    copy.addEventListener("click", async () => {
      textarea.value = report();
      try {
        await navigator.clipboard.writeText(textarea.value);
        copy.textContent = "コピーしました";
      } catch {
        textarea.focus();
        textarea.select();
      }
    });
    details.append(summary, note, textarea, copy);
    help.insertBefore(details, document.querySelector("#help-done"));
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount, { once: true });
  } else mount();
})();
