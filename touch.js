// On affected iOS WebKit versions, a document-level pointer listener restores
// short-tap feedback and first-tap link activation. Paired device checks with
// identical styles and analytics confirmed that registration alone is enough.
// Keep it empty and passive so scrolling and link activation stay native.
document.addEventListener("pointerdown", () => {}, {
  capture: true,
  passive: true,
});
