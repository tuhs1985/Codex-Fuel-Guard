import { createInterface } from "node:readline";
import fs from "node:fs";
for await (const line of createInterface({ input: process.stdin })) {
  const x = JSON.parse(line);
  if (x.id == null) continue;
  if (process.env.FAKE_LOG)
    fs.appendFileSync(process.env.FAKE_LOG, x.method + "\n");
  const reply = (result) => console.log(JSON.stringify({ id: x.id, result }));
  if (x.method === "initialize") reply({ userAgent: "fake/0.153.4" });
  else if (x.method === "account/rateLimits/read")
    reply({
      rateLimits: {
        limitId: "codex",
        primary: {
          usedPercent: 81,
          windowDurationMins: 300,
          resetsAt: Math.floor(Date.now() / 1000) + 3600,
        },
        secondary: null,
      },
    });
  else if (x.method === "thread/loaded/list")
    reply({ data: ["fake-thread-1"], nextCursor: null });
  else if (x.method === "hooks/list") reply({ data: [] });
  else
    console.log(
      JSON.stringify({
        id: x.id,
        error: { code: -32601, message: "Unsupported fake request" },
      }),
    );
}
