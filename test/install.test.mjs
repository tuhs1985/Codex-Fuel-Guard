import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { install, uninstall, managed } from "../src/install.mjs";
function fixture() {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "fuel-guard-test-"));
  const o = {
    root: path.join(temp, "guard"),
    codexHome: path.join(temp, "codex"),
    startup: path.join(temp, "startup"),
    source: path.resolve("."),
    integratePath: false,
  };
  fs.mkdirSync(o.codexHome);
  return o;
}
test("installer twice, existing instructions/hooks preserved, exact uninstall restoration", () => {
  const o = fixture();
  const a = path.join(o.codexHome, "AGENTS.md"),
    h = path.join(o.codexHome, "hooks.json");
  const original = Buffer.from("\uFEFF# My instructions\r\nKeep these.\r\n");
  const hooks =
    '{"hooks":{"PostToolUse":[{"hooks":[{"type":"command","command":"existing"}]}]}}';
  fs.writeFileSync(a, original);
  fs.writeFileSync(h, hooks);
  install(o);
  const first = fs.readFileSync(a);
  install(o);
  assert.deepEqual(fs.readFileSync(a), first);
  assert.equal(JSON.parse(fs.readFileSync(h)).hooks.PostToolUse.length, 2);
  uninstall(o);
  assert.deepEqual(fs.readFileSync(a), original);
  assert.equal(fs.readFileSync(h, "utf8"), hooks);
  assert.equal(uninstall(o).installed, false);
});
test("uninstall preserves later unrelated edits and files", () => {
  const o = fixture();
  install(o);
  const a = path.join(o.codexHome, "AGENTS.md");
  fs.appendFileSync(a, "\nNew global instruction\n");
  const extra = path.join(o.root, "personal.txt");
  fs.writeFileSync(extra, "mine");
  uninstall(o);
  assert.match(fs.readFileSync(a, "utf8"), /New global instruction/);
  assert.doesNotMatch(fs.readFileSync(a, "utf8"), /CODEX-FUEL-GUARD/);
  assert.equal(fs.readFileSync(extra, "utf8"), "mine");
});
test("malformed markers or hooks fail before changing shared files", () => {
  assert.throws(() => managed("<!-- CODEX-FUEL-GUARD:BEGIN -->", "x"));
  const o = fixture();
  const a = path.join(o.codexHome, "AGENTS.md"),
    h = path.join(o.codexHome, "hooks.json");
  fs.writeFileSync(a, "keep");
  fs.writeFileSync(h, "malformed");
  assert.throws(() => install(o));
  assert.equal(fs.readFileSync(a, "utf8"), "keep");
});
test("failed copy rolls shared files back", () => {
  const o = fixture();
  const a = path.join(o.codexHome, "AGENTS.md");
  fs.writeFileSync(a, "keep");
  assert.throws(() =>
    install({ ...o, source: path.join(o.root, "nonexistent") }),
  );
  assert.equal(fs.readFileSync(a, "utf8"), "keep");
  assert.equal(fs.existsSync(path.join(o.codexHome, "hooks.json")), false);
});
test("uninstall preflight preserves instructions if shared hooks were damaged", () => {
  const o = fixture();
  install(o);
  const a = path.join(o.codexHome, "AGENTS.md"),
    before = fs.readFileSync(a);
  fs.writeFileSync(path.join(o.codexHome, "hooks.json"), "bad");
  assert.throws(() => uninstall(o));
  assert.deepEqual(fs.readFileSync(a), before);
});
test("partial upgrade copy failure restores installed executable modules", () => {
  const o = fixture();
  install(o);
  const cli = path.join(o.root, "app", "src", "cli.mjs"),
    before = fs.readFileSync(cli);
  const bad = path.join(o.root, "bad-source");
  fs.mkdirSync(path.join(bad, "src"), { recursive: true });
  fs.writeFileSync(path.join(bad, "src", "cli.mjs"), "broken replacement");
  fs.mkdirSync(path.join(bad, "src", "zzz.mjs"));
  assert.throws(() => install({ ...o, source: bad }));
  assert.deepEqual(fs.readFileSync(cli), before);
});
