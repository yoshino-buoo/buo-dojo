import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createGameAnalytics } from "../analytics.js";
import worker from "../analytics-worker/worker.js";

const config = {
  hostname: "yoshino-buoo.github.io",
  beaconToken: "public-site-token",
  eventsUrl: "https://example.workers.dev/events",
};
const result = () => ({
  mode: "microphone",
  training: true,
  durationMs: 73000,
  glyphs: Array(73).fill("字"),
  mastery: true,
});
function clientFixture(href = "https://yoshino-buoo.github.io/buo-dojo/") {
  const scripts = [],
    sent = [],
    requests = [];
  const env = {
    location: { href },
    crypto: { randomUUID },
    document: {
      getElementById: (id) => scripts.find((script) => script.id === id),
      createElement: () => ({
        attributes: {},
        setAttribute(key, value) {
          this.attributes[key] = value;
        },
      }),
      head: { append: (script) => scripts.push(script) },
    },
    navigator: {
      sendBeacon(url, body) {
        sent.push({ url, body });
        return true;
      },
    },
    fetch(url, options) {
      requests.push({ url, options });
      return Promise.resolve();
    },
  };
  return { env, scripts, sent, requests };
}

test("analytics loads once only on the configured production hostname", () => {
  for (const href of [
    "http://localhost:4173/",
    "https://other.github.io/buo-dojo/",
  ]) {
    const f = clientFixture(href);
    createGameAnalytics({ config, env: f.env }).recordResult(result());
    assert.equal(f.scripts.length, 0);
    assert.equal(f.sent.length, 0);
  }
  const f = clientFixture();
  createGameAnalytics({ config, env: f.env });
  createGameAnalytics({ config, env: f.env });
  assert.equal(f.scripts.length, 1);
  assert.equal(f.scripts[0].type, "module");
  assert.deepEqual(JSON.parse(f.scripts[0].attributes["data-cf-beacon"]), {
    token: config.beaconToken,
  });
});

test("each round is counted once, votes separately, with only numeric result data", async () => {
  const f = clientFixture();
  const analytics = createGameAnalytics({ config, env: f.env });
  const round = result();
  analytics.recordResult(round);
  analytics.recordResult(round);
  analytics.recordVote(round);
  analytics.recordVote(round);
  analytics.recordResult({
    ...round,
    mode: "demo",
    training: false,
    durationMs: 7399.9,
    glyphs: Array(11).fill("字"),
    mastery: false,
  });
  const events = await Promise.all(
    f.sent.map(async ({ body }) => JSON.parse(await body.text())),
  );
  assert.deepEqual(
    events.map(({ kind }) => kind),
    ["result", "vote", "vote", "result"],
  );
  assert.equal(new Set(events.map(({ id }) => id)).size, 4);
  assert.equal(events[0].course, "training");
  assert.equal(events[0].durationTenths, 730);
  assert.equal(events[0].glyphCount, 73);
  assert.equal(events[3].course, "normal");
  assert.equal(events[3].input, "demo");
  assert.equal(events[3].durationTenths, 73);
  assert.deepEqual(Object.keys(events[0]).sort(), [
    "complete",
    "course",
    "durationTenths",
    "glyphCount",
    "id",
    "input",
    "kind",
  ]);
});

test("blocked analytics and sendBeacon failure never interrupt the game", async () => {
  const f = clientFixture();
  f.env.navigator.sendBeacon = () => false;
  f.env.fetch = (url, options) => {
    f.requests.push({ url, options });
    return Promise.reject(new Error("offline"));
  };
  const analytics = createGameAnalytics({ config, env: f.env });
  assert.doesNotThrow(() => analytics.recordResult(result()));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(f.requests[0].options.keepalive, true);
  assert.equal(f.requests[0].options.credentials, "omit");
  f.env.crypto.randomUUID = () => {
    throw new Error("unavailable");
  };
  assert.doesNotThrow(() => analytics.recordVote(result()));
});

const valid = () => ({
  id: randomUUID(),
  kind: "result",
  course: "training",
  input: "microphone",
  durationTenths: 730,
  glyphCount: 73,
  complete: true,
});
function request(
  event = valid(),
  { origin = "https://yoshino-buoo.github.io", method = "POST" } = {},
) {
  return new Request(config.eventsUrl, {
    method,
    headers: { Origin: origin, "Content-Type": "text/plain" },
    ...(method === "POST" ? { body: JSON.stringify(event) } : {}),
  });
}
function databaseFixture() {
  const calls = [];
  return {
    calls,
    DB: {
      prepare(sql) {
        return {
          bind(...values) {
            return {
              async run() {
                calls.push({ sql, values });
              },
            };
          },
        };
      },
    },
  };
}

test("collector writes validated results and vote clicks with bound parameters", async () => {
  const db = databaseFixture();
  for (const kind of ["result", "vote"]) {
    const event = { ...valid(), kind, extraPrivateField: "not retained" };
    const response = await worker.fetch(request(event), db);
    assert.equal(response.status, 204);
    assert.equal(
      response.headers.get("Access-Control-Allow-Origin"),
      "https://yoshino-buoo.github.io",
    );
    assert.deepEqual(db.calls.at(-1).values, [
      event.id,
      kind,
      "training",
      "microphone",
      730,
      73,
      1,
    ]);
    assert.match(db.calls.at(-1).sql, /ON CONFLICT\(id\) DO NOTHING/);
  }
});

test("collector rejects foreign origins, public reads, invalid data and oversized bodies", async () => {
  const db = databaseFixture();
  assert.equal(
    (
      await worker.fetch(
        request(valid(), { origin: "https://elsewhere.example" }),
        db,
      )
    ).status,
    403,
  );
  assert.equal(
    (await worker.fetch(request(null, { method: "GET" }), db)).status,
    405,
  );
  assert.equal(
    (await worker.fetch(request(null, { method: "OPTIONS" }), db)).status,
    204,
  );
  for (const patch of [
    { course: "unknown" },
    { durationTenths: 731 },
    { glyphCount: 74 },
    { input: "unknown" },
    { complete: "true" },
    { id: "not-a-uuid" },
    { durationTenths: 729, complete: true },
    { course: "normal", durationTenths: 730 },
    { extra: "x".repeat(2048) },
  ]) {
    assert.equal(
      (await worker.fetch(request({ ...valid(), ...patch }), db)).status,
      400,
    );
  }
  assert.equal(db.calls.length, 0);
  assert.equal((await worker.fetch(request(), {})).status, 503);
});
