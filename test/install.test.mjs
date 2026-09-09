import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {readJson} from '../src/storage.mjs';
import { install, uninstall, managed } from "../src/install.mjs";

test('migration keeps trusted hook definitions and config bytes while redirecting bridge and startup',()=>{
 const o=fixture();install(o);
 const hooks=fs.readFileSync(path.join(o.codexHome,'hooks.json'));
 const config=path.join(o.codexHome,'config.toml');fs.writeFileSync(config,'# existing trust/settings\n');
 const previous=readJson(path.join(o.root,'install-manifest.json'));
 const root=path.join(path.dirname(o.root),'shared-root');
 const migrated={...o,root,previousManifest:previous,bridge:path.join(o.root,'app','hook.ps1')};
 install(migrated);
 assert.deepEqual(fs.readFileSync(path.join(o.codexHome,'hooks.json')),hooks);
 assert.equal(fs.readFileSync(config,'utf8'),'# existing trust/settings\n');
 assert.ok(fs.readFileSync(migrated.bridge,'utf8').includes(root));
 assert.ok(fs.readFileSync(path.join(o.startup,'CodexFuelGuard.vbs'),'utf8').includes(root));
 const once=fs.readFileSync(path.join(o.codexHome,'AGENTS.md'));install(migrated);assert.deepEqual(fs.readFileSync(path.join(o.codexHome,'AGENTS.md')),once);
});
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

test('canonical hook repair replaces owned commands once and preserves trust config',()=>{
 const o=fixture();install(o);
 const config=path.join(o.codexHome,'config.toml');fs.writeFileSync(config,'# trust is owned by Codex\n');
 const bridge=path.join(o.root,'canonical','hook.ps1');
 install({...o,bridge,canonicalHooks:true});
 install({...o,bridge,canonicalHooks:true});
 const hooks=readJson(path.join(o.codexHome,'hooks.json'));
 for(const event of ['PostToolUse','UserPromptSubmit']){
  assert.equal(hooks.hooks[event].length,1);
  assert.ok(hooks.hooks[event][0].hooks[0].command.includes(bridge));
 }
 assert.equal(fs.readFileSync(config,'utf8'),'# trust is owned by Codex\n');
});
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
