import { createHash } from "node:crypto";

// Keep the test entry identical to the current game, adding only the opt-in
// diagnostic observer. The normal entry never loads the observer.
export function renderVoteCheck(html, diagnosticSource) {
  const revision = createHash("sha256")
    .update(diagnosticSource)
    .digest("hex")
    .slice(0, 12);
  return html.replace(
    "<head>",
    `<head>\n    <meta name="robots" content="noindex, nofollow" />\n    <script defer src="./diagnostics/vote.js?v=${revision}"></script>`,
  );
}

export function renderVoteProbe(html, probeSource, mode) {
  if (!["control", "pointer"].includes(mode)) throw new Error("Unknown vote probe");
  const revision = createHash("sha256")
    .update(probeSource)
    .digest("hex")
    .slice(0, 12);
  return html.replace(
    "<head>",
    `<head>\n    <meta name="robots" content="noindex, nofollow" />\n    <script defer src="./diagnostics/vote-probe.js?v=${revision}&amp;mode=${mode}"></script>`,
  );
}
