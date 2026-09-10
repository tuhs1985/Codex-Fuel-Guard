import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import http from "node:http";
import { atomic, connection } from "../src/storage.mjs";
import { request } from "../src/ipc.mjs";
import { Guard } from "../src/core.mjs";
import { install } from "../src/install.mjs";
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
test("daemon IPC restart, hook routing, deferral, duplicates, auth, failed Codex, single instance", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fg-daemon-"));
  const g = new Guard();
  g.update({
    rateLimits: {
      limitId: "codex",
      primary: {
        usedPercent: 81,
        windowDurationMins: 300,
        resetsAt: Math.floor(Date.now() / 1000) + 3600,
      },
    },
  });
  atomic(path.join(dir, "state.json"), g.state);
  // A valid non-Codex executable fails locally, without discovery falling back
  // to the real signed-in Codex installation.
  atomic(path.join(dir, "config.json"), { codexPath: process.execPath });
  install({
    root: dir,
    codexHome: path.join(dir, "test-codex"),
    startup: path.join(dir, "test-startup"),
    source: path.resolve("."),
    integratePath: false,
  });
  const env = { ...process.env, FUEL_GUARD_HOME: dir };
  let child;
  async function launch() {
    child = spawn(process.execPath, ["--input-type=module", "-e", "import {daemon} from './src/daemon.mjs'; await daemon(process.env.FUEL_GUARD_HOME,{isTask:()=>false});"], {
      env,
      windowsHide: true,
      stdio: "ignore",
    });
    for (let i = 0; i < 30; i++) {
      try {
        await request("status", {}, dir);
        return;
      } catch {
        await delay(50);
      }
    }
    throw Error("daemon timeout");
  }
  try {
    await launch();
    await request("attach", { id: "session-one", cwd: "C:/AI/A" }, dir);
    const shared = await request("attach", { id: "session-one", cwd: "C:/worker" }, dir);
    assert.equal(shared.sharedDirectory, true);
    assert.equal(shared.deliveryIdentity, "hook-payload");
    await request("attach", { id: "session-two", cwd: "C:/Project/B" }, dir);
    assert.deepEqual(
      await request(
        "hook",
        { id: "session-one", cwd: "C:/AI/A", event: "Stop" },
        dir,
      ),
      {},
    );
    const first = await request(
      "hook",
      { id: "session-one", cwd: "C:/AI/A", event: "PostToolUse" },
      dir,
    );
    assert.match(first.hookSpecificOutput.additionalContext, /19%/);
    const worker = await request("hook", {id:"worker-one",sessionId:"session-one",cwd:"C:/worker",event:"PostToolUse"},dir);
    assert.match(worker.hookSpecificOutput.additionalContext,/19%/);
    await assert.rejects(request("hook", {id:"worker-one",sessionId:"session-two",cwd:"C:/worker",event:"PostToolUse"},dir),/different session/);
    if (process.platform === "win32") {
      const bridge = spawn(
        "powershell.exe",
        [
          "-NoProfile",
          "-NonInteractive",
          "-ExecutionPolicy",
          "Bypass",
          "-File",
          path.join(dir, "app", "hook.ps1"),
        ],
        {
          windowsHide: true,
          env: {
            ...process.env,
            FUEL_GUARD_HOME: path.join(dir, "wrong"),
            LOCALAPPDATA: path.join(dir, "wrong"),
          },
        },
      );
      let output = "";
      bridge.stdout.on("data", (x) => (output += x));
      bridge.stderr.resume();
      bridge.stdin.end(
        "\uFEFF" +
          JSON.stringify({
            session_id: "bridge-session",
            agent_id: "bridge-worker",
            cwd: "C:/AI/A",
            hook_event_name: "PostToolUse",
          }),
      );
      assert.equal(await new Promise((r) => bridge.on("exit", r)), 0);
      assert.match(
        JSON.parse(output).hookSpecificOutput.additionalContext,
        /19%/,
      );
      assert.equal(
        JSON.parse(fs.readFileSync(path.join(dir, "hook-health.json"))).ok,
        true,
      );
      const identityState = await request("status", {}, dir);
      assert.equal(identityState.sessions.find(x=>x.id==="bridge-worker").hookSessionId,"bridge-session");
      assert.equal(identityState.sessions.some(x=>x.id==="bridge-session"),false);
    }
    assert.equal((await request("hook",{id:"session-one",cwd:"C:/AI/A",event:"PostToolUse"},dir)).hookSpecificOutput,undefined);
    await assert.rejects(request("attach", { id: "", cwd: "x" }, dir));
    const unauthorized = await new Promise((resolve) => {
      http.get({ ...connection(dir), path: "/" }, (r) => {
        r.resume();
        resolve(r.statusCode);
      });
    });
    assert.equal(unauthorized, 403);
    const other = spawn(process.execPath, ["--input-type=module", "-e", "import {daemon} from './src/daemon.mjs'; await daemon(process.env.FUEL_GUARD_HOME,{isTask:()=>false});"], {
      env,
      windowsHide: true,
      stdio: "ignore",
    });
    assert.equal(await new Promise((r) => other.on("exit", r)), 1);
    await request("stop", {}, dir);
    await new Promise((r) => child.on("exit", r));
    await launch();
    assert.equal((await request("hook",{id:"session-one",cwd:"C:/AI/A",event:"PostToolUse"},dir)).hookSpecificOutput,undefined);
    assert.match(
      (
        await request(
          "hook",
          { id: "session-two", cwd: "C:/Project/B", event: "UserPromptSubmit" },
          dir,
        )
      ).hookSpecificOutput.additionalContext,
      /19%/,
    );
    await request("synthetic", { id: "session-one" }, dir);
    assert.equal((await request("hook", {id:"worker-one",sessionId:"session-one",cwd:"C:/worker",event:"PostToolUse"},dir)).hookSpecificOutput,undefined);
    assert.deepEqual(
      await request(
        "hook",
        { id: "session-two", cwd: "C:/Project/B", event: "PostToolUse" },
        dir,
      ),
      {},
    );
    assert.match(
      (
        await request(
          "hook",
          { id: "session-one", cwd: "C:/AI/A", event: "PostToolUse" },
          dir,
        )
      ).hookSpecificOutput.additionalContext,
      /SYNTHETIC/,
    );
  } finally {
    try {
      await request("stop", {}, dir);
    } catch {}
    child?.kill();
  }
});
