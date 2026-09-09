// Run in ordinary Windows after agreeing to re-trust the canonical commands.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {install} from '../src/install.mjs';
import {readJson} from '../src/storage.mjs';
import {taskContext} from '../src/lifecycle.mjs';
if(taskContext())throw Error('Run in ordinary Windows PowerShell.');
const root='C:/AI/Projects/.codex-fuel-guard-rober';
const manifest=readJson(path.join(root,'install-manifest.json'),null);
if(!manifest)throw Error('Migrate the Windows installation first.');
const config=path.join(manifest.codexHome,'config.toml');
const before=fs.readFileSync(config);
const result=install({root:path.resolve(root),codexHome:manifest.codexHome,startup:manifest.startup,source:path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),bridge:path.join(path.resolve(root),'app','hook.ps1'),canonicalHooks:true});
if(!fs.readFileSync(config).equals(before))throw Error('Unexpected concurrent Codex config change; inspect before proceeding.');
console.log(JSON.stringify({result,next:'Review and trust the two Fuel Guard handlers in Codex Settings > Hooks. No daemon restart required.'},null,2));
