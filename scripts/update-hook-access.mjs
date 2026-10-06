// Client-only update: safe in the shared workspace; no daemon launch/restart.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readJson} from '../src/storage.mjs';
const root=path.resolve('C:/AI/Projects/.codex-fuel-guard-rober');
const manifest=readJson(path.join(root,'install-manifest.json'),null);
if(manifest?.root!==root)throw Error('Verified canonical installation required.');
const source=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../src');
// Dependency first: old CLI remains compatible during the two-file update.
const names=['lifecycle.mjs','cli.mjs'];
const before=new Map(names.map(name=>[name,fs.readFileSync(path.join(root,'app/src',name))]));
const next=new Map(names.map(name=>[name,fs.readFileSync(path.join(source,name))]));
const protectedFiles=[manifest.agents,manifest.hooks,manifest.launcher,manifest.bridge,path.join(manifest.codexHome,'config.toml'),path.join(root,'config.json'),path.join(root,'ipc-token'),path.join(root,'endpoint.json')];
const protectedBytes=new Map(protectedFiles.map(file=>[file,fs.readFileSync(file)]));
const backup=path.join(root,'backups',`hook-access-${Date.now()}`);
fs.mkdirSync(backup,{recursive:true});
for(const [name,bytes] of before)fs.writeFileSync(path.join(backup,name),bytes);
function replace(name,bytes){
  const target=path.join(root,'app/src',name),tmp=target+'.hook-access.tmp';
  fs.writeFileSync(tmp,bytes);fs.renameSync(tmp,target);
}
try{
  for(const [name,bytes] of next)replace(name,bytes);
  for(const [file,bytes] of protectedBytes)if(!fs.readFileSync(file).equals(bytes))throw Error(`Protected file changed concurrently: ${file}`);
}catch(error){for(const [name,bytes] of before)replace(name,bytes);throw error;}
console.log(JSON.stringify({updated:names,backup,integrationUnchanged:true,daemonRestarted:false},null,2));
