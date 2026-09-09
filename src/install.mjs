import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { home, atomic, readJson, secret } from "./storage.mjs";
const begin = "<!-- CODEX-FUEL-GUARD:BEGIN -->",
  end = "<!-- CODEX-FUEL-GUARD:END -->";
const statusMessage = "Codex Fuel Guard";
const events = ["PostToolUse", "UserPromptSubmit"];
export function managed(text, block) {
  const starts = text.split(begin).length - 1,
    ends = text.split(end).length - 1;
  if (starts !== ends || starts > 1)
    throw Error("Ambiguous Fuel Guard instruction markers; no files changed");
  if (starts) {
    const from = text.indexOf(begin),
      to = text.indexOf(end) + end.length;
    if (to < from) throw Error("Reversed instruction markers");
    return text.slice(0, from) + block + text.slice(to);
  }
  return text + (text && !text.endsWith("\n") ? "\n" : "") + block;
}
function paths({
  root = home,
  codexHome = process.env.CODEX_HOME ||
    path.join(process.env.USERPROFILE || os.homedir(), ".codex"),
  startup = path.join(
    process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"),
    "Microsoft",
    "Windows",
    "Start Menu",
    "Programs",
    "Startup",
  ),
} = {}) {
  return {
    root,
    codexHome,
    startup,
    agents: path.join(codexHome, "AGENTS.md"),
    hooks: path.join(codexHome, "hooks.json"),
    launcher: path.join(startup, "CodexFuelGuard.vbs"),
    manifest: path.join(root, "install-manifest.json"),
  };
}
const bytes = (f) => (fs.existsSync(f) ? fs.readFileSync(f) : null);
const text = (f) => bytes(f)?.toString("utf8") || "";
function ps(script) {
  return execFileSync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-Command", script],
    { windowsHide: true, encoding: "utf8" },
  ).trim();
}
const quote = (x) => "'" + x.replaceAll("'", "''") + "'";
function userPath() {
  return ps("[Environment]::GetEnvironmentVariable('Path','User')");
}
function setPath(value) {
  ps(`[Environment]::SetEnvironmentVariable('Path',${quote(value)},'User')`);
}
function write(f, data) {
  fs.mkdirSync(path.dirname(f), { recursive: true });
  const temp = f + ".fuel-guard.tmp";
  fs.writeFileSync(temp, data);
  fs.renameSync(temp, f);
}
function restore(f, data) {
  if (data === null) {
    if (fs.existsSync(f)) fs.unlinkSync(f);
  } else write(f, data);
}
function ownHook(h, command) {
  return h.statusMessage === statusMessage && h.command === command;
}
export function install(options = {}) {
  const p = paths(options),
    source = options.source,
    node = options.node || process.execPath,
    integratePath = options.integratePath ?? process.platform === "win32";
  const previous = readJson(p.manifest, null) || options.previousManifest;
  p.bridge=options.bridge || previous?.bridge || path.join(p.root,"app","hook.ps1");
  if (
    fs.existsSync(p.root) &&
    !previous &&
    fs
      .readdirSync(p.root)
      .some(
        (x) =>
          ![
            "config.json",
            "state.json",
            "ipc-token",
            "backups",
            "app",
            "bin",
            "visibility-probe.txt",
          ].includes(x),
      )
  )
    throw Error("Install directory contains unowned files");
  const cli = path.join(p.root, "app", "src", "cli.mjs"),
    cmd = (options.canonicalHooks ? null : previous?.hookCommand) || `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "${p.bridge}"`;
  const block = `${begin}\nFuel Guard is installed globally. At the start of substantive work run \`& "${path.join(p.root, "bin", "fuel-guard.cmd")}" attach\` (uses CODEX_THREAD_ID; never guess a session). It verifies the single Windows-started daemon; a task must not spawn a sandbox daemon. Trusted global hooks deliver warnings at existing tool/prompt boundaries. Treat [FUEL GUARD] as quota/checkpoint guidance. If unavailable, report once and continue working. Project instructions may add detail.\n${end}`;
  const beforeAgents = bytes(p.agents),
    beforeHooks = bytes(p.hooks),
    beforeStartup = bytes(p.launcher);
  const nextAgents = managed(beforeAgents?.toString("utf8") || "", block);
  const hooks = readJson(p.hooks, { hooks: {} });
  if (!hooks || typeof hooks.hooks !== "object" || Array.isArray(hooks.hooks))
    throw Error("Invalid existing hooks.json");
  for (const event of events) {
    const groups = hooks.hooks[event] || [];
    if (!Array.isArray(groups) || groups.some((g) => !Array.isArray(g.hooks)))
      throw Error("Invalid existing hook groups");
    hooks.hooks[event] = groups
      .map((g) => ({
        ...g,
        hooks: g.hooks.filter((h) => !ownHook(h, previous?.hookCommand || cmd)),
      }))
      .filter((g) => g.hooks.length);
    hooks.hooks[event].push({
      hooks: [{ type: "command", command: cmd, timeout: 3, statusMessage }],
    });
  }
  const oldPath = integratePath ? userPath() : null,
    bin = path.join(p.root, "bin");
  const pathAdded =
    integratePath &&
    !oldPath.split(";").some((x) => x.toLowerCase() === bin.toLowerCase());
  fs.mkdirSync(p.root, { recursive: true });
  const backup = path.join(
    p.root,
    "backups",
    new Date().toISOString().replaceAll(":", "-"),
  );
  fs.mkdirSync(backup, { recursive: true });
  for (const [name, b] of [
    ["AGENTS.md", beforeAgents],
    ["hooks.json", beforeHooks],
    ["startup.vbs", beforeStartup],
  ])
    if (b !== null) fs.writeFileSync(path.join(backup, name), b);
  const appNames = fs
    .readdirSync(path.join(source, "src"))
    .filter((x) => x.endsWith(".mjs"));
  const ownedFiles = [
    ...appNames.map((name) => path.join(p.root, "app", "src", name)),
    p.bridge,
    path.join(bin, "fuel-guard.cmd"),
    p.manifest,
  ];
  const beforeOwned = new Map(ownedFiles.map((f) => [f, bytes(f)]));
  try {
    fs.mkdirSync(path.join(p.root, "app", "src"), { recursive: true });
    for (const name of appNames)
      fs.copyFileSync(
        path.join(source, "src", name),
        path.join(p.root, "app", "src", name),
      );
    write(
      p.bridge,
      `$ErrorActionPreference = 'Stop'\r\n$env:FUEL_GUARD_HOME = ${quote(p.root)}\r\n[Console]::InputEncoding = [System.Text.UTF8Encoding]::new($false)\r\n$OutputEncoding = [System.Text.UTF8Encoding]::new($false)\r\ntry { [Console]::In.ReadToEnd() | & ${quote(node)} ${quote(cli)} hook } catch { exit 0 }\r\n`,
    );
    write(
      path.join(bin, "fuel-guard.cmd"),
      `@echo off\r\n"${node}" "${cli}" %*\r\n`,
    );
    const launch = `"${node}" "${cli}" start`;
    write(
      p.launcher,
      `' Codex Fuel Guard owned startup\r\nCreateObject("WScript.Shell").Run "${launch.replaceAll('"', '""')}", 0, False\r\n`,
    );
    write(p.agents, nextAgents);
    write(p.hooks, JSON.stringify(hooks, null, 2) + "\n");
    if (pathAdded)
      setPath(oldPath + (oldPath && !oldPath.endsWith(";") ? ";" : "") + bin);
    atomic(p.manifest, {
      version: 1,
      ...p,
      hookCommand: cmd,
      managedBlock: block,
      pathAdded: previous?.pathAdded || pathAdded,
      originalAgents: previous
        ? previous.originalAgents
        : (beforeAgents?.toString("base64") ?? null),
      originalHooks: previous
        ? previous.originalHooks
        : (beforeHooks?.toString("base64") ?? null),
      installedHooks: JSON.stringify(hooks, null, 2) + "\n",
      originalStartup: previous
        ? previous.originalStartup
        : (beforeStartup?.toString("base64") ?? null),
      backup,
    });
    secret(p.root,true);
  } catch (e) {
    restore(p.agents, beforeAgents);
    restore(p.hooks, beforeHooks);
    restore(p.launcher, beforeStartup);
    for (const [f, b] of beforeOwned) restore(f, b);
    if (pathAdded) setPath(oldPath);
    throw e;
  }
  return {
    installed: p.root,
    globalInstructions: p.agents,
    hooks: p.hooks,
    backup,
    trustRequired: true,
    next: "Review Codex Fuel Guard hooks in App Settings > Hooks or CLI /hooks; then start/attach and run doctor.",
  };
}
export function uninstall(options = {}) {
  const p = paths(options),
    m = readJson(p.manifest, null);
  if (!m) return { installed: false };
  if (
    m.root !== p.root ||
    m.agents !== p.agents ||
    m.hooks !== p.hooks ||
    m.launcher !== p.launcher
  )
    throw Error("Install manifest path mismatch");
  const currentAgents = text(p.agents),
    currentHooks = text(p.hooks);
  const originalAgents =
    m.originalAgents === null ? null : Buffer.from(m.originalAgents, "base64");
  const originalText = originalAgents?.toString("utf8") || "";
  // Preflight both shared files before changing either, so malformed later edits fail safely.
  managed(currentAgents, "");
  if (currentHooks !== m.installedHooks) {
    const h = readJson(p.hooks, { hooks: {} });
    if (
      !h.hooks ||
      events.some(
        (e) =>
          h.hooks[e] &&
          (!Array.isArray(h.hooks[e]) ||
            h.hooks[e].some((g) => !Array.isArray(g.hooks))),
      )
    )
      throw Error("Invalid edited hooks.json; uninstall made no changes");
  }
  if (currentAgents === managed(originalText, m.managedBlock))
    restore(p.agents, originalAgents);
  else write(p.agents, managed(currentAgents, ""));
  if (currentHooks === m.installedHooks)
    restore(
      p.hooks,
      m.originalHooks === null ? null : Buffer.from(m.originalHooks, "base64"),
    );
  else {
    const hooks = readJson(p.hooks, { hooks: {} });
    for (const event of events)
      if (hooks.hooks[event])
        hooks.hooks[event] = hooks.hooks[event]
          .map((g) => ({
            ...g,
            hooks: g.hooks.filter((h) => !ownHook(h, m.hookCommand)),
          }))
          .filter((g) => g.hooks.length);
    write(p.hooks, JSON.stringify(hooks, null, 2) + "\n");
  }
  if (text(p.launcher).startsWith("' Codex Fuel Guard owned startup"))
    restore(
      p.launcher,
      m.originalStartup === null
        ? null
        : Buffer.from(m.originalStartup, "base64"),
    );
  if ((options.integratePath ?? process.platform === "win32") && m.pathAdded) {
    const bin = path.join(p.root, "bin");
    setPath(
      userPath()
        .split(";")
        .filter((x) => x.toLowerCase() !== bin.toLowerCase())
        .join(";"),
    );
  }
  if(m.bridge && m.bridge!==path.join(p.root,"app","hook.ps1") && text(m.bridge).includes(m.root)){fs.unlinkSync(m.bridge);}
  // Delete only explicitly owned files; retain backups and unknown user additions.
  const owned = [
    "ipc-token",
    "state.json",
    "synthetic.json",
    "hook-health.json",
    "install-manifest.json",
    "bin/fuel-guard.cmd",
    "app/hook.ps1",
    "startup.log",
  ];
  for (const name of owned) {
    const f = path.join(p.root, name);
    if (fs.existsSync(f)) fs.unlinkSync(f);
  }
  for (const name of [
    "cli.mjs",
    "core.mjs",
    "daemon.mjs",
    "install.mjs",
    "ipc.mjs",
    "protocol.mjs",
    "storage.mjs",
    "lifecycle.mjs",
    "discovery.mjs",
  ]) {
    const f = path.join(p.root, "app", "src", name);
    if (fs.existsSync(f)) fs.unlinkSync(f);
  }
  return {
    uninstalled: true,
    retained: p.root,
    reason:
      "Backups, config.json and unknown files retained for rollback/reinstall. Hook trust settings owned by Codex remain inert.",
  };
}
