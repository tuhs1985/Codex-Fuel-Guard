import {spawn} from 'node:child_process';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import {request} from './ipc.mjs';
import {home} from './storage.mjs';
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
