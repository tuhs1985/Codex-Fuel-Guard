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
  atomic(path.join(dir, "config.json"), { codexPath: "does-not-exist.exe" });
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
