import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  Guard,
  parseSnapshot,
  steerPending,
  configuration,
} from "../src/core.mjs";
const now = 1700000000000,
  reset = now / 1000 + 10000;
test("live reset timestamp jitter does not freeze valid quota readings or rearm", () => {
  const g = new Guard();
  g.attach("session-one", "A");
  g.update(sample(20), now);
  assert.equal(g.update(sample(19, 99, reset + 1), now + 1).length, 0);
  assert.equal(g.update(sample(10, 99, reset - 1), now + 2).length, 1);
  assert.equal(g.state.windows["codex:300"].remaining, 10);
  assert.equal(g.state.windows["codex:300"].available, true);
  assert.match(g.pending("session-one", now + 2)[0].text, /10%/);
});
const sample = (r, weekly = 99, resetsAt = reset) => ({
  accountId: "a",
  rateLimits: {
    limitId: "codex",
    primary: { usedPercent: 100 - r, windowDurationMins: 300, resetsAt },
    secondary: {
      usedPercent: 100 - weekly,
      windowDurationMins: 10080,
      resetsAt: reset + 600000,
    },
  },
});
test("parse actual installed 0.153.4 response, multi-bucket authoritative", () => {
  const r = JSON.parse(
    fs.readFileSync(new URL("./fixtures/real-0.153.4.json", import.meta.url)),
  );
  r.rateLimits.primary.usedPercent = 100;
  assert.deepEqual(
    parseSnapshot(r).windows.map((x) => x.remaining),
    [88, 20],
  );
});
test("20, 10, 5 crossing and duplicate suppression", () => {
  const g = new Guard();
  let t = now;
  for (const [r, n] of [
    [90, 0],
    [20, 1],
    [20, 0],
    [19, 0],
    [10, 1],
    [10, 0],
    [5, 1],
    [4, 0],
  ])
    assert.equal(g.update(sample(r), ++t).length, n);
});
test("steep drop coalesces to checkpoint; initial low state warns", () => {
  const g = new Guard();
  assert.match(g.update(sample(4), now)[0].text, /durable restart/);
  assert.equal(g.update(sample(3), now + 1).length, 0);
});
test("out of order sample and stale reset cannot regress", () => {
  const g = new Guard();
  g.update(sample(10), now);
  g.update(sample(90), now - 1);
  g.update(sample(90, 99, reset - 120), now + 1);
  assert.equal(g.state.windows["codex:300"].remaining, 10);
});
test("hysteresis requires sufficient recovery on two samples", () => {
  const g = new Guard();
  g.update(sample(20), now);
  for (const [i, r] of [21, 20, 23, 20, 23, 24].entries())
    assert.equal(g.update(sample(r), now + i + 1).length, 0);
  assert.equal(g.update(sample(20), now + 10).length, 1);
});
test("genuine reset rearms; timestamp change alone does not", () => {
  const g = new Guard();
  g.update(sample(5), now);
  assert.equal(g.update(sample(5, 99, reset + 1), now + 1).length, 0);
  assert.equal(
    g.update(sample(5, 99, reset + 10000), (reset + 2) * 1000).length,
    1,
  );
});
test("weekly can bind independently and 5-hour may be missing", () => {
  const g = new Guard();
  assert.match(g.update(sample(99, 10), now)[0].text, /Weekly/);
  const raw = sample(99, 5);
  raw.rateLimits.primary = null;
  assert.match(g.update(raw, now + 1)[0].text, /Weekly/);
});
test("missing malformed unknown durations are not zero", () => {
  for (const raw of [
    null,
    {},
    { rateLimits: {} },
    { rateLimits: { primary: { usedPercent: "90", windowDurationMins: 300 } } },
    { rateLimits: { primary: { usedPercent: 110, windowDurationMins: 300 } } },
  ])
    assert.throws(() => parseSnapshot(raw));
  const raw = sample(9);
  raw.rateLimits.primary.windowDurationMins = null;
  assert.equal(parseSnapshot(raw).windows.length, 1);
});
test("restart persistence prevents duplicate events", () => {
  let g = new Guard();
  g.update(sample(20), now);
  g.attach("session-one", "C:/AI/A");
  const p = g.pending("session-one", now);
  g.acknowledge("session-one", p);
  g = new Guard(JSON.parse(JSON.stringify(g.state)));
  assert.equal(g.update(sample(19), now + 1).length, 0);
  assert.equal(g.pending("session-one", now + 1).length, 0);
});
test("multiple project sessions independently receive and idle sessions defer", () => {
  const g = new Guard();
  g.update(sample(20), now);
  g.attach("session-one", "C:/AI/A");
  g.attach("session-two", "C:/Project/B");
  g.acknowledge("session-one", g.pending("session-one", now));
  assert.equal(g.pending("session-one", now).length, 0);
  assert.equal(g.pending("session-two", now).length, 1);
  assert.deepEqual(g.pending("unknown", now), []);
  assert.throws(() => g.attach("", "x"));
  g.attach("session-one", "C:/worker");
  assert.equal(g.pending("session-one", now).length, 0);
  assert.equal(g.pending("session-two", now).length, 1);
});
test("stale and expired warnings deferred; recovery invalidates pending", () => {
  const g = new Guard();
  g.attach("session-one", "A");
  g.update(sample(20), now);
  assert.equal(g.pending("session-one", now + 100000).length, 0);
  g.update(sample(24), now + 1);
  g.update(sample(24), now + 2);
  assert.equal(g.pending("session-one", now + 2).length, 0);
});
test("account switch clears old quota and delivery state", () => {
  const g = new Guard();
  g.update(sample(20), now);
  g.attach("session-one", "A");
  g.acknowledge("session-one", g.pending("session-one", now));
  const s = sample(19);
  s.accountId = "b";
  assert.equal(g.update(s, now + 1).length, 1);
  assert.equal(g.pending("session-one", now + 1).length, 1);
});
test("active-turn steering has precondition; idle never starts turn; failed steer retained", async () => {
  const g = new Guard();
  g.attach("session-one", "A");
  g.update(sample(20, 99, (Date.now() / 1000) | 0), now);
  g.state.windows["codex:300"].resetsAt = Math.floor(Date.now() / 1000) + 1000;
  g.state.windows["codex:300"].seenAt = Date.now();
  const calls = [];
  const rpc = async (m, p) => calls.push([m, p]);
  assert.equal(await steerPending(g, "session-one", rpc, null), false);
  await assert.rejects(
    steerPending(
      g,
      "session-one",
      async () => {
        throw Error("turn ended");
      },
      "turn-1",
    ),
  );
  assert.equal(g.pending("session-one").length, 1);
  await steerPending(g, "session-one", rpc, "turn-2");
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], "turn/steer");
  assert.equal(calls[0][1].expectedTurnId, "turn-2");
  assert.equal(g.pending("session-one").length, 0);
});
test("config validation rejects unsafe values", () => {
  for (const c of [
    { thresholds: [20, 20] },
    { thresholds: [0] },
    { pollSeconds: 0 },
    { hysteresis: 0 },
  ])
    assert.throws(() => configuration(c));
});
test("missing full snapshot windows become unavailable; sparse notifications preserve other windows", () => {
  const g = new Guard();
  g.attach("session-one", "A");
  g.update(sample(10, 20), now);
  const partial = sample(9);
  partial.rateLimits.secondary = null;
  g.update(partial, now + 1, true);
  assert.equal(g.pending("session-one", now + 1).length, 2);
  g.update(partial, now + 2);
  assert.equal(g.pending("session-one", now + 2).length, 1);
});
