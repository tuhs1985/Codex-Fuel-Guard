import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {atomic} from '../src/storage.mjs';
import {hookObservation,attachWithHookFallback} from '../src/lifecycle.mjs';
function setup(t){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fg-receipt-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const id='session-test';
  const record={id,installation:path.resolve(dir),ok:true,event:'PostToolUse',at:Date.now()};
  const write=(value=record)=>atomic(path.join(dir,'hook-receipts',`${id}.json`),value);
  const denied=()=>{throw Object.assign(Error('connect denied'),{code:'EACCES',syscall:'connect'});};
  return {dir,id,record,write,denied};
}
test('denied socket accepts only recent exact-ID hook evidence without attempting attach',async t=>{
  const f=setup(t);f.write();let calls=0;
  const result=await attachWithHookFallback({...f,start:f.denied,attach:()=>{calls++;}});
  assert.equal(result.verification,'recent-hook-receipt');assert.equal(result.registeredByThisCommand,false);
  assert.equal(result.quotaHealth,'unknown');assert.equal(calls,0);
});
test('missing stale future failed wrong-ID and wrong-installation receipts do not imply protection',async t=>{
  const f=setup(t);
  for(const value of [null,{...f.record,at:Date.now()-91000},{...f.record,at:Date.now()+60000},{...f.record,ok:false},{...f.record,id:'other-session'},{...f.record,installation:'elsewhere'},{...f.record,event:'Stop'}]){
    f.write(value);
    await assert.rejects(attachWithHookFallback({...f,start:f.denied}),{code:'SANDBOX_ACCESS_DENIED'});
  }
  assert.equal(hookObservation(f.dir,'../invalid'),null);
});
test('malformed receipt and another chat global success never count',async t=>{
  const f=setup(t);atomic(path.join(f.dir,'hook-health.json'),f.record);
  assert.equal(hookObservation(f.dir,f.id),null);
  f.write();fs.writeFileSync(path.join(f.dir,'hook-receipts',`${f.id}.json`),'bad');
  assert.equal(hookObservation(f.dir,f.id),null);
});
test('authentication, missing installation, refused socket and file access failures are not masked',async t=>{
  const f=setup(t);f.write();
  for(const [code,syscall] of [['AUTH_MISMATCH','connect'],['ECONNREFUSED','connect'],['INSTALL_MISSING',undefined],['EACCES','open']]){
    await assert.rejects(attachWithHookFallback({...f,start:()=>{throw Object.assign(Error(code),{code,syscall});}}),{code});
  }
  await assert.rejects(attachWithHookFallback({...f,start:f.denied,endpoint:'ws://127.0.0.1:1234'}),{code:'SANDBOX_ACCESS_DENIED'});
});
test('successful direct attach remains authoritative even with receipt',async t=>{
  const f=setup(t);f.write();
  assert.deepEqual(await attachWithHookFallback({...f,start:async()=>{},attach:async()=>({attached:f.id,health:'ready'})}),{attached:f.id,health:'ready'});
});
