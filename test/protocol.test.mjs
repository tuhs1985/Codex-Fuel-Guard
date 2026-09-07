import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { AppServer, localEndpoint } from "../src/protocol.mjs";
test("real JSON-lines client against fake app-server; protocol rejects server approval requests", async () => {
  const r = new AppServer();
  r.child = spawn(process.execPath, ["test/fake-app-server.mjs"], {
    windowsHide: true,
  });
  createInterface({ input: r.child.stdout }).on("line", (l) => r.receive(l));
  try {
    assert.equal((await r.rpc("initialize")).userAgent, "fake/0.153.4");
    assert.equal(
      (await r.rpc("account/rateLimits/read")).rateLimits.primary.usedPercent,
      81,
    );
    assert.deepEqual((await r.rpc("thread/loaded/list")).data, [
      "fake-thread-1",
    ]);
    let response;
    r.send = (x) => (response = x);
    r.receive(
      JSON.stringify({
        id: 999,
        method: "item/commandExecution/requestApproval",
      }),
    );
    assert.equal(response.error.code, -32601);
    assert.equal(response.result, undefined);
  } finally {
    r.close();
  }
});
test("no remote or ambiguous websocket endpoints", () => {
  for (const endpoint of [
    "wss://example.com",
    "ws://0.0.0.0:1234",
    "ws://localhost:1234",
    "ws://127.0.0.1:1234/path",
    "ws://user@127.0.0.1:1234",
  ])
    assert.throws(() => localEndpoint(endpoint));
  assert.equal(localEndpoint("ws://127.0.0.1:1234"), "ws://127.0.0.1:1234/");
});
test("disconnect rejects outstanding requests", async () => {
  const r = new AppServer();
  r.send = () => {};
  const pending = r.rpc("account/rateLimits/read");
  r.fail();
  await assert.rejects(pending, /disconnected/);
});
