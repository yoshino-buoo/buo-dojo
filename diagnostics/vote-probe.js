// Paired device checks use the same script and game resources. Only the pointer
// variant registers a listener; neither variant collects logs or wraps APIs.
(() => {
  const mode = new URL(document.currentScript.src).searchParams.get("mode");
  if (mode === "pointer") {
    document.addEventListener("pointerdown", () => {}, {
      capture: true,
      passive: true,
    });
  }
})();
