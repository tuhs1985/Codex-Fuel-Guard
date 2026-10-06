import {spawn} from 'node:child_process';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import {request} from './ipc.mjs';
import {home,readJson} from './storage.mjs';
import {validSessionId} from './core.mjs';
export function hookObservation(dir,id,now=Date.now()) {
  if(!validSessionId(id))return null;
  try {
    const receipt=readJson(path.join(dir,'hook-receipts',`${id}.json`),null);
    if(receipt?.id!==id||receipt.installation!==path.resolve(dir)||receipt.ok!==true||
      !['PostToolUse','UserPromptSubmit'].includes(receipt.event)||
      !Number.isSafeInteger(receipt.at)||receipt.at>now||now-receipt.at>90000)return null;
    return {id,at:receipt.at,ageSeconds:Math.floor((now-receipt.at)/1000)};
  }catch{return null;}
}
export async function attachWithHookFallback({dir=home,id,cwd,endpoint,start,attach=()=>request('attach',{id,cwd,endpoint},dir,15000)}) {
  if(!validSessionId(id))throw Error('Explicit valid thread/session id required; cwd guessing is disabled');
  try {await start();return await attach();}
  catch(error){
    if(!['EACCES','EPERM'].includes(error.code)||error.syscall!=='connect')throw error;
    const observed=!endpoint&&hookObservation(dir,id);
    if(observed)return {attached:id,mode:'hook',verification:'recent-hook-receipt',registeredByThisCommand:false,
      directConnection:'sandbox-access-denied',hookObservedAt:observed.at,ageSeconds:observed.ageSeconds,
      health:'recent-hook-delivery-confirmed',quotaHealth:'unknown',
      note:'This exact ID recently reached the daemon through a hook. Direct tool access is blocked; current daemon/quota health was not queried. No daemon was started.'};
    throw Object.assign(Error('Tool sandbox denied the local connection. No recent successful hook receipt for this exact ID (or steering was requested). Hook protection is unverified; check from ordinary Windows. Do not reinstall or start a second daemon.'),{code:'SANDBOX_ACCESS_DENIED'});
  }
}
export function taskContext(env=process.env,username){if(env.CODEX_THREAD_ID)return true;try{username??=os.userInfo().username;}catch{return true;}return /^codexsandbox/i.test(username);}
export async function ensureStarted({dir=home,entry,probe=()=>request('status',{},dir),launch,task=taskContext()}={}){
  try{return await probe();}catch(e){if(e.code!=='ECONNREFUSED')throw e;}
  if(task)throw Object.assign(Error('Windows daemon is absent. Start Fuel Guard from ordinary Windows PowerShell; a Codex task must not start a second daemon under its sandbox identity.'),{code:'HOST_START_REQUIRED'});
  fs.mkdirSync(dir,{recursive:true});
  const log=fs.openSync(path.join(dir,'startup.log'),'w');
  let child;
  try{child=launch?launch():spawn(process.execPath,[entry,'daemon'],{detached:true,windowsHide:true,stdio:['ignore',log,log],env:{...process.env,FUEL_GUARD_HOME:dir}});}finally{fs.closeSync(log);}
  let failure;child.on('error',e=>failure=e);child.unref();
  for(let i=0;i<40;i++){
    if(failure)throw failure;
    await new Promise(r=>setTimeout(r,100));
    try{return await probe();}catch(e){if(e.code!=='ECONNREFUSED')throw e;}
  }
  throw Object.assign(Error(`Windows daemon failed to listen; inspect ${path.join(dir,'startup.log')}. No additional daemon was launched.`),{code:'START_FAILED'});
}
