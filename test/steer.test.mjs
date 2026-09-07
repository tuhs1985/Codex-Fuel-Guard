import test from "node:test";
import assert from "node:assert/strict";
import { fakeWebSocket } from "./fake-websocket.mjs";
import { AppServer } from "../src/protocol.mjs";
import { Guard, steerPending } from "../src/core.mjs";
import { loadedIds } from "../src/daemon.mjs";
test("fake websocket app-server routes exact thread and handles idle race and restart", async () => {
  const calls = [];
  let active = "turn-1";
  const fake = await fakeWebSocket((x, send) => {
    if (x.id == null) return;
    calls.push(x);
    let result = {};
    if (x.method === "initialize") result = { userAgent: "fake/0.153.4" };
    if (x.method === "thread/loaded/list")
      result = x.params.cursor
        ? { data: ["session-other"], nextCursor: null }
        : { data: ["session-one"], nextCursor: "page-2" };
    if (x.method === "turn/steer" && x.params.expectedTurnId !== active) {
      send({
        id: x.id,
        error: { code: -32600, message: "No matching active turn" },
      });
      return;
    }
    send({ id: x.id, result });
  });
  const g = new Guard();
  g.attach("session-one", "C:/AI/A");
  g.attach("session-other", "C:/Project/B");
  g.update({
    rateLimits: {
      primary: {
        usedPercent: 90,
        windowDurationMins: 300,
        resetsAt: Math.floor(Date.now() / 1000) + 1000,
      },
    },
  });
  let rpc = new AppServer({ endpoint: fake.endpoint });
  try {
    await rpc.connect();
    assert.deepEqual(await loadedIds(rpc), ["session-one", "session-other"]);
    assert.equal(
      await steerPending(g, "session-one", (m, p) => rpc.rpc(m, p), null),
      false,
    );
    active = null;
    await assert.rejects(
      steerPending(g, "session-one", (m, p) => rpc.rpc(m, p), "turn-1"),
    );
    assert.equal(g.pending("session-one").length, 1);
    rpc.close();
    rpc = new AppServer({ endpoint: fake.endpoint });
    await rpc.connect();
    active = "turn-2";
    await steerPending(g, "session-one", (m, p) => rpc.rpc(m, p), "turn-2");
    assert.equal(g.pending("session-one").length, 0);
    assert.equal(g.pending("session-other").length, 1);
    assert.equal(calls.filter((x) => x.method === "turn/start").length, 0);
    assert.ok(
      calls
        .filter((x) => x.method === "turn/steer")
        .every((x) => x.params.threadId === "session-one"),
    );
  } finally {
    rpc.close();
    fake.close();
  }
});
