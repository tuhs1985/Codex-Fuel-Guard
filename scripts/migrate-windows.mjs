// Run only from ordinary Windows. This migrates one installation; no new task.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {install} from '../src/install.mjs';
import {request} from '../src/ipc.mjs';
import {readJson,atomic,secret,connection} from '../src/storage.mjs';
import {taskContext,ensureStarted} from '../src/lifecycle.mjs';
if(taskContext())throw Error('Run this migration in ordinary Windows PowerShell, outside Codex.');
const oldRoot=path.join(process.env.LOCALAPPDATA,'CodexFuelGuard');
const root=path.resolve(process.argv[2]||'C:/AI/Projects/.codex-fuel-guard-rober');
const source=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const previous=readJson(path.join(oldRoot,'install-manifest.json'),null);
if(!previous)throw Error('Existing Windows installation manifest required. No changes made.');
if(fs.existsSync(path.join(root,'install-manifest.json'))){
 const journal=readJson(path.join(root,'migration-rollback.json'),null);
 if(journal?.status==='complete'){console.log('Canonical installation already exists; use its launcher. No migration repeated.');process.exit(0);}
 if(!journal||journal.oldRoot!==oldRoot||journal.root!==root)throw Error('Unrecognized destination installation; refusing to overwrite it.');
}
if(!fs.existsSync(path.join(root,'visibility-probe.txt')))throw Error('Complete the ordinary/task visibility probe first.');
const codexHome=previous.codexHome;
const files=[previous.agents,previous.hooks,previous.launcher,path.join(oldRoot,'app','hook.ps1'),path.join(oldRoot,'bin','fuel-guard.cmd')];
const before=files.map(file=>({file,data:fs.existsSync(file)?fs.readFileSync(file).toString('base64'):null}));
const quote=x=>"'"+x.replaceAll("'","''")+"'";
const powershell=s=>execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',s],{windowsHide:true,encoding:'utf8'}).trim();
const oldPath=powershell("[Environment]::GetEnvironmentVariable('Path','User')");
const configFile=path.join(codexHome,'config.toml');
const trustBefore=fs.readFileSync(configFile);
let stopped=false,newStarted=false;
const rollbackFile=path.join(root,'migration-rollback.json');
try{
  // Authenticate before modifying anything. Never kill a guessed or historical PID.
  const status=await request('status',{},oldRoot);
  const owner=JSON.parse(powershell(`Get-CimInstance Win32_Process -Filter 'ProcessId=${Number(status.pid)}' | Select-Object ExecutablePath,CommandLine | ConvertTo-Json -Compress`));
  if(!owner.CommandLine?.toLowerCase().includes(path.join(oldRoot,'app','src','cli.mjs').toLowerCase())||!owner.CommandLine?.endsWith(' daemon'))throw Error('Current listener does not match the owned Windows daemon.');
  atomic(rollbackFile,{oldRoot,root,files:before,oldPath,stoppedPid:status.pid,time:new Date().toISOString(),status:'prepared'});
  await request('stop',{},oldRoot);stopped=true;
  await new Promise(r=>setTimeout(r,500));
  for(const name of ['config.json','state.json','ipc-token']){const f=path.join(oldRoot,name);if(fs.existsSync(f))fs.copyFileSync(f,path.join(root,name));}
  // Reuse the port just released by our authenticated, ownership-verified old
  // daemon. A path-derived new port may belong to an unrelated application.
  atomic(path.join(root,'endpoint.json'),{port:connection(oldRoot).port});
  const result=install({root,codexHome,startup:previous.startup,source,previousManifest:previous,bridge:path.join(oldRoot,'app','hook.ps1')});
  if(!fs.readFileSync(configFile).equals(trustBefore))throw Error('Codex configuration changed unexpectedly; rollback required.');
  const entry=path.join(root,'app','src','cli.mjs');
  fs.writeFileSync(path.join(oldRoot,'bin','fuel-guard.cmd'),`@echo off\r\n"${process.execPath}" "${entry}" %*\r\n`);
  const bin=path.join(oldRoot,'bin').toLowerCase();
  const current=powershell("[Environment]::GetEnvironmentVariable('Path','User')");
  powershell(`[Environment]::SetEnvironmentVariable('Path',${quote(current.split(';').filter(x=>x.toLowerCase()!==bin).join(';'))},'User')`);
  await ensureStarted({dir:root,entry});newStarted=true;
  let ready;
  for(let i=0;i<30;i++){ready=await request('status',{},root);if(ready.health==='ready'&&!ready.stale)break;await new Promise(r=>setTimeout(r,1000));}
  if(ready.health!=='ready'||ready.stale)throw Error(`New daemon quota reader is unhealthy: ${ready.lastError}`);
  atomic(rollbackFile,{...readJson(rollbackFile),status:'complete'});
  console.log(JSON.stringify({migration:'complete-pre-reboot',installation:root,pid:ready.pid,health:ready.health,rollback:rollbackFile,hookTrustPreserved:true,next:'Validate task attach and synthetic receipt, then coordinate reboot.'},null,2));
}catch(e){
  try{const current=await request('status',{},root);if(current.installation===root)await request('stop',{},root);}catch{}
  for(const item of before){if(item.data===null){if(fs.existsSync(item.file))fs.unlinkSync(item.file);}else fs.writeFileSync(item.file,Buffer.from(item.data,'base64'));}
  powershell(`[Environment]::SetEnvironmentVariable('Path',${quote(oldPath)},'User')`);
  if(stopped)await ensureStarted({dir:oldRoot,entry:path.join(oldRoot,'app','src','cli.mjs')});
  if(fs.existsSync(rollbackFile))atomic(rollbackFile,{...readJson(rollbackFile),status:'rolled-back',failure:e.code||e.message});
  console.error(`Migration failed and shared files were restored: ${e.message}. Review ${rollbackFile} before retrying.`);process.exitCode=1;
}
