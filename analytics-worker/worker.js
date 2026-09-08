const ALLOWED_ORIGIN = "https://yoshino-buoo.github.io";
const MAX_BODY_BYTES = 1024;

function validEvent(event) {
  if (!event || typeof event !== "object" || Array.isArray(event)) return false;
  const maxTime = event.course === "training" ? 730 : 250;
  const maxGlyphs = event.course === "training" ? 73 : 31;
  return (
    typeof event.id === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      event.id,
    ) &&
    ["result", "vote"].includes(event.kind) &&
    ["normal", "training"].includes(event.course) &&
    ["microphone", "demo"].includes(event.input) &&
    Number.isInteger(event.durationTenths) &&
    event.durationTenths >= 0 &&
    event.durationTenths <= maxTime &&
    Number.isInteger(event.glyphCount) &&
    event.glyphCount >= 1 &&
    event.glyphCount <= maxGlyphs &&
    typeof event.complete === "boolean" &&
    (!event.complete ||
      (event.durationTenths === maxTime && event.glyphCount === maxGlyphs))
  );
}

async function readEvent(request) {
  if (
    !request.body ||
    Number(request.headers.get("Content-Length")) > MAX_BODY_BYTES
  )
    return null;
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}

export default {
  async fetch(request, env) {
    if (new URL(request.url).pathname !== "/events")
      return new Response(null, { status: 404 });
    if (request.headers.get("Origin") !== ALLOWED_ORIGIN)
      return new Response(null, { status: 403 });
    const headers = {
      "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Cache-Control": "no-store",
      Vary: "Origin",
    };
    const reply = (status) => new Response(null, { status, headers });
    if (request.method === "OPTIONS") return reply(204);
    if (request.method !== "POST") return reply(405);
    let event;
    try {
      event = await readEvent(request);
    } catch {
      return reply(400);
    }
    if (!validEvent(event)) return reply(400);
    try {
      await env.DB.prepare(
        `INSERT INTO game_events (id, kind, course, input, duration_tenths, glyph_count, complete)
         VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING`,
      )
        .bind(
          event.id,
          event.kind,
          event.course,
          event.input,
          event.durationTenths,
          event.glyphCount,
          Number(event.complete),
        )
        .run();
      return reply(204);
    } catch {
      return reply(503);
    }
  },
};
