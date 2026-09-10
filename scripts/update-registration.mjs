// Ordinary Windows only. Update three runtime modules; preserve integration/trust.
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {execFileSync} from "node:child_process";
import {request} from "../src/ipc.mjs";
import {readJson} from "../src/storage.mjs";
import {ensureStarted,taskContext} from "../src/lifecycle.mjs";
if(taskContext()) throw Error("Run this update in ordinary Windows PowerShell.");
const root=path.resolve("C:/AI/Projects/.codex-fuel-guard-rober");
const manifest=readJson(path.join(root,"install-manifest.json"),null);
if(manifest?.root!==root)throw Error("Canonical installation manifest required.");
const entry=path.join(root,"app/src/cli.mjs");
const source=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../src");
const names=["core.mjs","cli.mjs","daemon.mjs"];
const backup=path.join(root,"backups",`registration-${Date.now()}`);
const protectedFiles=[manifest.agents,manifest.hooks,manifest.launcher,manifest.bridge,path.join(manifest.codexHome,"config.toml"),path.join(root,"config.json"),path.join(root,"ipc-token"),path.join(root,"endpoint.json")];
const before=new Map(protectedFiles.filter(Boolean).map(f=>[f,fs.readFileSync(f)]));
const old=await request("status",{},root);
if(old.installation!==root)throw Error("Listener installation mismatch; no change made.");
const command=execFileSync("powershell.exe",["-NoProfile","-NonInteractive","-Command",`(Get-CimInstance Win32_Process -Filter 'ProcessId=${Number(old.pid)}').CommandLine`],{windowsHide:true,encoding:"utf8"}).trim();
if(!command.toLowerCase().includes(entry.toLowerCase())||!command.endsWith(" daemon"))throw Error("Listener process ownership check failed.");
fs.mkdirSync(backup,{recursive:true});
for(const name of names){fs.accessSync(path.join(source,name));fs.copyFileSync(path.join(root,"app/src",name),path.join(backup,name));}
let stopped=false;
try {
  await request("stop",{},root);stopped=true;
  await new Promise(r=>setTimeout(r,600));
  for(const name of names)fs.copyFileSync(path.join(source,name),path.join(root,"app/src",name));
  await ensureStarted({dir:root,entry});
  let status;
  for(let i=0;i<30;i++){
    status=await request("status",{},root);
    if(status.health==="ready"&&!status.stale)break;
    await new Promise(r=>setTimeout(r,1000));
  }
  if(status.health!=="ready"||status.stale)throw Error("Updated reader not healthy");
  for(const [file,bytes] of before)if(!fs.readFileSync(file).equals(bytes))throw Error(`Protected file changed: ${file}`);
  console.log(JSON.stringify({updated:names,installation:root,pid:status.pid,health:status.health,integrationUnchanged:true,rollbackModules:backup},null,2));
}catch(error){
  if(stopped){
    try{const current=await request("status",{},root);if(current.installation===root)await request("stop",{},root);}catch{}
    await new Promise(r=>setTimeout(r,600));
    for(const name of names)fs.copyFileSync(path.join(backup,name),path.join(root,"app/src",name));
    await ensureStarted({dir:root,entry});
  }
  throw error;
}
