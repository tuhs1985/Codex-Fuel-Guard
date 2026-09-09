import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {ensureStarted,taskContext} from '../src/lifecycle.mjs';
import {secret,connection} from '../src/storage.mjs';
import {request} from '../src/ipc.mjs';
import {discoverCodex} from '../src/discovery.mjs';
test('migration endpoint preserves the owned port and rejects invalid overrides',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fg-endpoint-'));
 try {
  fs.writeFileSync(path.join(dir,'endpoint.json'),JSON.stringify({port:44976}));
  assert.deepEqual(connection(dir),{host:'127.0.0.1',port:44976});
  for(const port of [0,65536,'44976',44976.5]){
   fs.writeFileSync(path.join(dir,'endpoint.json'),JSON.stringify({port}));
   assert.throws(()=>connection(dir),{code:'INSTALL_INVALID'});
  }
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('start never spawns on auth, inaccessible, occupied, timeout or unknown failures',async()=>{
 for(const code of ['AUTH_MISMATCH','PORT_OCCUPIED','IPC_TIMEOUT','INSTALL_INACCESSIBLE','INSTALL_MISSING','EACCES']){let starts=0;await assert.rejects(ensureStarted({probe:async()=>{throw Object.assign(Error(code),{code})},launch:()=>{starts++;}}),{code});assert.equal(starts,0);}
});
test('sandbox and Codex task cannot spawn an absent Windows daemon',async()=>{assert.equal(taskContext({},'CodexSandboxOffline'),true);assert.equal(taskContext({CODEX_THREAD_ID:'abc'},'rober'),true);await assert.rejects(ensureStarted({task:true,probe:async()=>{throw Object.assign(Error(),{code:'ECONNREFUSED'})}}),{code:'HOST_START_REQUIRED'});});
test('clients never mint installation tokens; owner creates once',()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fg-token-'));assert.throws(()=>secret(dir),{code:'INSTALL_MISSING'});assert.equal(fs.existsSync(path.join(dir,'ipc-token')),false);const first=secret(dir,true);assert.equal(secret(dir,true),first);assert.equal(secret(dir),first);});
test('real HTTP 403 is auth mismatch and preserves token',async()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fg-auth-'));const before=secret(dir,true);const server=http.createServer((req,res)=>{res.writeHead(403);res.end();});await new Promise(r=>server.listen(0,'127.0.0.1',r));fs.writeFileSync(path.join(dir,'endpoint.json'),JSON.stringify({port:server.address().port}));try{await assert.rejects(request('status',{},dir),{code:'AUTH_MISMATCH'});assert.equal(secret(dir),before);}finally{server.close();}});
test('discovery survives removed pinned App version without PATH or config mutation',()=>{const root=fs.mkdtempSync(path.join(os.tmpdir(),'fg-discovery-'));const file=path.join(root,'OpenAI','Codex','bin','new-build','codex.exe');fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,'test-only');const env={LOCALAPPDATA:root,PATH:''};assert.equal(discoverCodex({configured:path.join(root,'old','codex.exe'),env}),file);assert.equal(env.PATH,'');assert.throws(()=>discoverCodex({env:{LOCALAPPDATA:path.join(root,'missing'),PATH:''}}),{code:'CODEX_NOT_FOUND'});});
