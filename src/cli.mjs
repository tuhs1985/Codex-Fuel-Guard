#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { home, readJson, atomic } from "./storage.mjs";
import { request } from "./ipc.mjs";
import { AppServer } from "./protocol.mjs";
import { daemon } from "./daemon.mjs";

const args = process.argv.slice(2),
  command = args.shift() || "status";
const option = (name) => {
  const i = args.indexOf("--" + name);
  return i < 0 ? undefined : args[i + 1];
};
const id = () => option("thread") || process.env.CODEX_THREAD_ID;
async function start() {
  try {
    return await request("status");
  } catch {}
  fs.mkdirSync(home, { recursive: true });
  const child = spawn(
    process.execPath,
    [fileURLToPath(import.meta.url), "daemon"],
    { detached: true, windowsHide: true, stdio: "ignore", env: process.env },
  );
  child.unref();
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 100));
    try {
      return await request("status");
    } catch {}
  }
  throw Error(
    "Daemon did not start. Run fuel-guard daemon in a terminal to diagnose.",
  );
}
async function main() {
  if (command === "daemon") {
    await daemon();
    return;
  }
  if (command === "hook") {
    let metadata = { at: Date.now() };
    try {
      let input = "";
      for await (const chunk of process.stdin) {
        input += chunk;
        if (input.length > 4 * 1024 * 1024) throw Error("Hook input too large");
      }
      const event = JSON.parse(input.replace(/^\uFEFF/, "")); // Never retain prompts, tool input/output, or transcript paths.
      metadata = {
        ...metadata,
        event: event.hook_event_name,
        id: event.agent_id || event.session_id,
        cwd: event.cwd,
      };
      if (!event.session_id || !event.cwd) return;
      // Hook fast path never spawns a process or makes a hosted request.
      const result = await request(
        "hook",
        {
          id: event.agent_id || event.session_id,
          cwd: event.cwd,
          event: event.hook_event_name,
        },
        home,
        1200,
      );
      atomic(path.join(home, "hook-health.json"), {
        ...metadata,
        ok: true,
        warningReturned: !!result.hookSpecificOutput,
      });
      if (result.hookSpecificOutput)
        process.stdout.write(JSON.stringify(result));
    } catch (e) {
      try {
        atomic(path.join(home, "hook-health.json"), {
          ...metadata,
          ok: false,
          error: e.code || e.name || "HookError",
        });
      } catch {} /* Fail open. Doctor reports bounded local diagnostics. */
    }
    return;
  }
  let result;
  if (command === "start") result = await start();
  else if (command === "attach") {
    await start();
    result = await request(
      "attach",
      {
        id: id(),
        cwd: option("cwd") || process.cwd(),
        endpoint: option("endpoint"),
      },
      home,
      15000,
    );
  } else if (command === "check") result = await request("check", { id: id() });
  else if (command === "detach") result = await request("detach", { id: id() });
  else if (command === "test-warning") {
    if (!option("thread"))
      throw Error("Synthetic testing requires explicit --thread");
    result = await request("synthetic", { id: option("thread") });
  } else if (command === "stop") {
    try {
      result = await request("stop");
    } catch (e) {
      if (e.code === "ECONNREFUSED") result = { running: false };
      else throw e;
    }
  } else if (command === "status") result = await request("status");
  else if (command === "doctor") {
    result = {
      node: process.version,
      home,
      hookHealth: readJson(path.join(home, "hook-health.json"), null),
    };
    try {
      result.daemon = await request("status");
    } catch {
      result.daemon = { running: false };
    }
    const rpc = new AppServer({
      executable:
        readJson(path.join(home, "config.json"), {}).codexPath || "codex",
    });
    try {
      result.codex = await rpc.connect();
      const h = await rpc.rpc("hooks/list", { cwds: [process.cwd()] });
      result.hooks = h.data.map((x) => ({
        cwd: x.cwd,
        warnings: x.warnings,
        errors: x.errors,
        hooks: x.hooks
          .filter((y) => y.statusMessage === "Codex Fuel Guard")
          .map((y) => ({
            event: y.eventName,
            enabled: y.enabled,
            trust: y.trustStatus,
            source: y.sourcePath,
          })),
      }));
      result.loaded = await rpc.rpc("thread/loaded/list");
      result.note =
        "Probe server is separate from native App. Trust Fuel Guard hooks in App Settings > Hooks or CLI /hooks. No turn is started.";
    } catch (e) {
      result.protocolError = e.message;
    } finally {
      rpc.close();
    }
  } else if (command === "install" || command === "uninstall") {
    const { install, uninstall } = await import("./install.mjs");
    if (command === "uninstall") {
      try {
        await request("stop");
        await new Promise((r) => setTimeout(r, 500));
      } catch {}
      result = uninstall();
    } else
      result = install({
        source: path.resolve(
          path.dirname(fileURLToPath(import.meta.url)),
          "..",
        ),
      });
  } else
    throw Error(
      "Commands: start, stop, status, attach [--thread ID] [--endpoint ws://127.0.0.1:PORT], check, doctor, install, uninstall, test-warning --thread ID",
    );
  if (result) console.log(JSON.stringify(result, null, 2));
}
main().catch((e) => {
  console.error(`Fuel Guard: ${e.message}`);
  process.exitCode = 1;
});
