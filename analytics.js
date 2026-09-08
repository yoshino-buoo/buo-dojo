import { ANALYTICS } from "./config.js";

/** Best-effort statistics: never delay a result or an outgoing vote link. */
export function createGameAnalytics({
  config = ANALYTICS,
  env = globalThis,
} = {}) {
  const reported = new WeakSet();
  let enabled = false;
  try {
    const url = new URL(env.location.href);
    enabled = url.protocol === "https:" && url.hostname === config.hostname;
    if (
      enabled &&
      config.beaconToken &&
      !env.document.getElementById("cloudflare-analytics")
    ) {
      const script = env.document.createElement("script");
      script.id = "cloudflare-analytics";
      script.type = "module";
      script.src = "https://static.cloudflareinsights.com/beacon.min.js";
      script.setAttribute(
        "data-cf-beacon",
        JSON.stringify({ token: config.beaconToken }),
      );
      env.document.head.append(script);
    }
  } catch {
    // Missing or blocked analytics must not affect the game.
  }

  function send(kind, result) {
    if (!enabled || !config.eventsUrl || !result?.glyphs?.length) return;
    try {
      const body = JSON.stringify({
        id: env.crypto.randomUUID(),
        kind,
        course: result.training ? "training" : "normal",
        input: result.mode,
        durationTenths: Math.floor(result.durationMs / 100),
        glyphCount: result.glyphs.length,
        complete: result.mastery,
      });
      const blob = new Blob([body], { type: "text/plain;charset=UTF-8" });
      if (env.navigator.sendBeacon?.(config.eventsUrl, blob)) return;
      env
        .fetch(config.eventsUrl, {
          method: "POST",
          body,
          headers: { "Content-Type": "text/plain;charset=UTF-8" },
          credentials: "omit",
          keepalive: true,
        })
        .catch(() => {});
    } catch {
      // Ad blockers, offline devices and missing APIs are all non-fatal.
    }
  }

  return {
    recordResult(result) {
      if (!result || reported.has(result)) return;
      reported.add(result);
      send("result", result);
    },
    recordVote(result) {
      send("vote", result);
    },
  };
}
