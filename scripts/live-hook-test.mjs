// Opt-in supervised integration check. Exactly one test turn, never run by the daemon.
import fs from "node:fs";
import path from "node:path";
import { AppServer } from "../src/protocol.mjs";
import { request } from "../src/ipc.mjs";
if (!process.argv.includes("--run"))
  throw Error(
    "Requires explicit --run; this starts one bounded test inference turn",
  );
const rpc = new AppServer(),
  cwd = path.resolve(".local/live-hook-test");
fs.mkdirSync(cwd, { recursive: true });
const record = {
  date: new Date().toISOString(),
  turnStartRequests: 0,
  turnStartedNotifications: 0,
  completed: false,
  hookEvents: [],
  output: "",
};
let finish;
const done = new Promise((resolve) => (finish = resolve));
rpc.on("notification", (m, p) => {
  if (m === "turn/started") record.turnStartedNotifications++;
  if (m === "hook/completed") record.hookEvents.push(p.run);
  if (m === "item/agentMessage/delta") record.output += p.delta;
  if (m === "turn/completed") {
    record.completed = true;
    record.turnStatus = p.turn.status;
    finish();
  }
});
const timer = setTimeout(() => finish(), 45000);
try {
  record.codex = await rpc.connect();
  const snapshot = await rpc.rpc("account/rateLimits/read");
  record.windows = [
    snapshot.rateLimits.primary,
    snapshot.rateLimits.secondary,
  ].map(
    (w) =>
      w && { remaining: 100 - w.usedPercent, minutes: w.windowDurationMins },
  );
  const started = await rpc.rpc("thread/start", {
    cwd,
    ephemeral: true,
    sandbox: "read-only",
    approvalPolicy: "never",
    developerInstructions:
      "This is a bounded Fuel Guard hook integration test. Do not use tools or inspect files. Reply only with FUEL_GUARD_RECEIVED if additional developer context contains SYNTHETIC DELIVERY TEST, otherwise reply MISSING. Stop immediately after that.",
  });
  record.threadId = started.thread.id;
  record.loaded = (await rpc.rpc("thread/loaded/list")).data.includes(
    record.threadId,
  );
  await request("attach", { id: record.threadId, cwd });
  await request("synthetic", { id: record.threadId });
  record.turnStartRequests++;
  await rpc.rpc("turn/start", {
    threadId: record.threadId,
    input: [
      { type: "text", text: "Perform the one-line hook receipt check now." },
    ],
  });
  await done;
} finally {
  clearTimeout(timer);
  rpc.close();
  fs.writeFileSync(
    ".local/live-hook-result.json",
    JSON.stringify(record, null, 2),
  );
  console.log(JSON.stringify(record, null, 2));
}
if (
  !record.completed ||
  record.output.trim() !== "FUEL_GUARD_RECEIVED" ||
  record.turnStartRequests !== 1 ||
  record.turnStartedNotifications !== 1
)
  process.exitCode = 1;
