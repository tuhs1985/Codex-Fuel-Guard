import test from "node:test";
import assert from "node:assert/strict";
import { Guard, hookIdentity, sameDirectory } from "../src/core.mjs";

function lowGuard() {
  const g = new Guard();
  g.update({rateLimits:{primary:{usedPercent:81,windowDurationMins:300}}});
  return g;
}
test("same parent shell ID across directories preserves registration and acknowledgement", () => {
  const g = lowGuard();
  g.attach("parent-session", "C:/parent");
  const events = g.pending("parent-session");
  g.acknowledge("parent-session", events);
  g.attach("parent-session", "C:/worker");
  assert.equal(g.state.sessions["parent-session"].cwd, "C:/parent");
  assert.equal(g.state.sessions["parent-session"].lastCwd, "C:/worker");
  assert.deepEqual(g.pending("parent-session"), []);
  const restarted = new Guard(JSON.parse(JSON.stringify(g.state)));
  restarted.attach("parent-session", "C:/third");
  assert.deepEqual(restarted.pending("parent-session"), []);
});
test("worker-first shell registration does not stop parent hooks in another cwd", () => {
  const g = lowGuard();
  g.attach("parent-session", "C:/worker");
  g.attach("parent-session", "C:/parent", "hook", null, Date.now(), "parent-session");
  assert.equal(g.pending("parent-session").length, 1);
});
test("explicit worker hook identity is independent of inherited environment and parent acknowledgement", () => {
  const g = lowGuard();
  g.attach("parent-session", "C:/parent");
  const identity = hookIdentity({session_id:"parent-session",agent_id:"worker-session",CODEX_THREAD_ID:"parent-session"});
  assert.deepEqual(identity, {id:"worker-session",sessionId:"parent-session"});
  g.attach(identity.id,"C:/worker","hook",null,Date.now(),identity.sessionId);
  g.acknowledge(identity.id,g.pending(identity.id));
  assert.equal(g.pending("parent-session").length,1);
  assert.equal(g.pending(identity.id).length,0);
  g.attach("unrelated-session","C:/worker","hook",null,Date.now(),"unrelated-session");
  assert.equal(g.pending("unrelated-session").length,1);
  const before=JSON.stringify(g.state);
  assert.throws(()=>g.attach(identity.id,"C:/worker","hook",null,Date.now(),"unrelated-session"),/different session/);
  assert.equal(JSON.stringify(g.state),before);
});
test("hooks without worker identity use only the supplied session ID; invalid worker IDs fail closed",()=>{
  assert.deepEqual(hookIdentity({session_id:"parent-session",cwd:"C:/worker"}),{id:"parent-session",sessionId:"parent-session"});
  for(const agent_id of ["",false,123,"__proto__"])
    assert.throws(()=>hookIdentity({session_id:"parent-session",agent_id}),/agent_id/);
  assert.throws(()=>hookIdentity({agent_id:"worker-session"}),/session_id/);
});
test("steer binding cannot be redirected or silently downgraded by registration",()=>{
  const g=new Guard();
  g.attach("steered-session","C:/parent","steer","ws://127.0.0.1:5000");
  assert.throws(()=>g.attach("steered-session","C:/worker","steer","ws://127.0.0.1:5000"),/cwd mismatch/);
  assert.throws(()=>g.attach("steered-session","C:/parent","steer","ws://127.0.0.1:5001"),/binding mismatch/);
  assert.throws(()=>g.attach("steered-session","C:/parent"),/binding mismatch/);
  assert.equal(g.state.sessions["steered-session"].endpoint,"ws://127.0.0.1:5000");
  assert.equal(sameDirectory("C:/Parent/", "c:\\parent"),true);
  assert.equal(sameDirectory("C:/parent", "C:/worker"),false);
});
