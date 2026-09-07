import http from "node:http";
import path from "node:path";
import { timingSafeEqual } from "node:crypto";
import { Guard, initialState, steerPending } from "./core.mjs";
import { home, readJson, atomic, connection, secret } from "./storage.mjs";
import { AppServer, localEndpoint } from "./protocol.mjs";

export async function daemon(dir = home) {
  const token = secret(dir),
    config = readJson(path.join(dir, "config.json"), {}),
    stateFile = path.join(dir, "state.json");
  let guard,
    quota,
    info = null,
    lastError = null,
    lastRead = null,
    stopping = false,
    pollTimer,
    sequence = 0;
  const links = new Map(),
    active = new Map();
  const save = () => atomic(stateFile, guard.state);
  const ingest = (raw, seq, partial = false) => {
    if (seq !== sequence) return;
    try {
      guard.update(raw, Date.now(), partial);
      guard.prune();
      save();
      lastRead = Date.now();
      lastError = null;
    } catch {
      if (!partial) lastError = "Quota response has no valid supported windows";
    }
  };
  async function poll() {
    if (stopping) return;
    try {
      if (!quota || quota.closed) {
        quota = new AppServer({ executable: config.codexPath || "codex" });
        info = await quota.connect();
        quota.on("notification", (method, p) => {
          if (method === "account/rateLimits/updated")
            ingest(p, ++sequence, true);
        });
      }
      const seq = ++sequence;
      ingest(await quota.rpc("account/rateLimits/read"), seq);
    } catch {
      lastError = "Codex quota read unavailable; run fuel-guard doctor";
      quota?.close();
      quota = null;
    }
    for (const session of Object.values(guard.state.sessions).filter(
      (x) => x.mode === "steer",
    )) {
      try {
        let link = links.get(session.endpoint);
        if (!link || link.closed) {
          link = new AppServer({ endpoint: session.endpoint });
          await link.connect();
          links.set(session.endpoint, link);
          link.on("notification", (m, p) => {
            if (m === "turn/started")
              active.set(`${session.endpoint}:${p.threadId}`, p.turn.id);
            if (m === "turn/completed")
              active.delete(`${session.endpoint}:${p.threadId}`);
          });
        }
        const loaded = await loadedIds(link);
        if (!loaded.includes(session.id)) {
          active.delete(`${session.endpoint}:${session.id}`);
          continue;
        }
        // Do not resume unloaded threads. Metadata read verifies identity; lifecycle tracks active turns.
        const result = await link.rpc("thread/read", {
          threadId: session.id,
          includeTurns: false,
        });
        if (result.thread.cwd !== session.cwd) continue;
        const turns = await link.rpc("thread/turns/list", {
          threadId: session.id,
          limit: 1,
          sortDirection: "desc",
          itemsView: "notLoaded",
        });
        const current = turns.data.find((x) => x.status === "inProgress");
        if (current)
          active.set(`${session.endpoint}:${session.id}`, current.id);
        else active.delete(`${session.endpoint}:${session.id}`);
        await steerPending(
          guard,
          session.id,
          (m, p) => link.rpc(m, p),
          active.get(`${session.endpoint}:${session.id}`),
          save,
        );
      } catch {
        /* Deferred on stale turn, lost endpoint, approval, or failed delivery. */
      }
    }
    if (!stopping)
      pollTimer = setTimeout(poll, guard.config.pollSeconds * 1000);
  }
  async function handle(command, a) {
    switch (command) {
      case "status":
        return {
          running: true,
          pid: process.pid,
          version: "0.1.0",
          codex: info?.userAgent,
          lastRead,
          lastError,
          stale:
            !lastRead ||
            Date.now() - lastRead > guard.config.staleSeconds * 1000,
          windows: Object.values(guard.state.windows).map(
            ({ bucket, minutes, remaining, resetsAt, seenAt, available }) => ({
              bucket,
              minutes,
              remaining,
              resetsAt,
              seenAt,
              available,
            }),
          ),
          sessions: Object.values(guard.state.sessions).map(
            ({ id, cwd, mode, lastSeen }) => ({ id, cwd, mode, lastSeen }),
          ),
        };
      case "attach": {
        if (a.endpoint) {
          localEndpoint(a.endpoint);
          const link = new AppServer({ endpoint: a.endpoint });
          try {
            await link.connect();
            if (!(await loadedIds(link)).includes(a.id))
              throw Error("Thread is not loaded at the supplied endpoint");
            const r = await link.rpc("thread/read", {
              threadId: a.id,
              includeTurns: false,
            });
            if (r.thread.cwd !== a.cwd) throw Error("Thread cwd mismatch");
          } finally {
            link.close();
          }
        }
        guard.attach(
          a.id,
          a.cwd,
          a.endpoint ? "steer" : "hook",
          a.endpoint || null,
        );
        save();
        return { attached: a.id, mode: a.endpoint ? "steer" : "hook" };
      }
      case "hook": {
        if (!["PostToolUse", "UserPromptSubmit"].includes(a.event)) return {};
        const prior = guard.state.sessions[a.id];
        guard.attach(
          a.id,
          a.cwd,
          prior?.mode || "hook",
          prior?.endpoint || null,
        );
        const events = guard.pending(a.id);
        const synthetic = readJson(path.join(dir, "synthetic.json"), null);
        const test =
          synthetic &&
          synthetic.id === a.id &&
          synthetic.expiresAt > Date.now() &&
          !synthetic.delivered;
        if (test) {
          synthetic.delivered = true;
          synthetic.deliveredAt = Date.now();
          atomic(path.join(dir, "synthetic.json"), synthetic);
        }
        guard.acknowledge(a.id, events);
        save();
        const text = [
          ...events.map((x) => x.text),
          ...(test ? [synthetic.text] : []),
        ].join("\n");
        return text
          ? {
              hookSpecificOutput: {
                hookEventName: a.event,
                additionalContext: text,
              },
            }
          : {};
      }
      case "check": {
        if (!guard.state.sessions[a.id]) throw Error("Session not attached");
        const events = guard.pending(a.id);
        guard.acknowledge(a.id, events);
        save();
        return { warnings: events.map((x) => x.text) };
      }
      case "detach": {
        delete guard.state.sessions[a.id];
        save();
        return { detached: a.id };
      }
      case "synthetic": {
        if (!guard.state.sessions[a.id])
          throw Error("Attach the intended session first");
        atomic(path.join(dir, "synthetic.json"), {
          id: a.id,
          expiresAt: Date.now() + 120000,
          delivered: false,
          text: "[FUEL GUARD] SYNTHETIC DELIVERY TEST: 5-hour allowance approximately 20% remaining. Continue current work, but avoid unnecessary scope expansion. Test only; real quota is unchanged.",
        });
        return { queuedFor: a.id, expiresInSeconds: 120 };
      }
      case "stop":
        setTimeout(shutdown, 50);
        return { stopped: true };
      default:
        throw Error("Unknown command");
    }
  }
  let chain = Promise.resolve();
  const server = http.createServer((req, res) => {
    const received = Buffer.from(
        String(req.headers["x-fuel-guard-token"] || ""),
      ),
      expected = Buffer.from(token);
    if (
      req.method !== "POST" ||
      req.url !== "/" ||
      received.length !== expected.length ||
      !timingSafeEqual(received, expected)
    ) {
      res.writeHead(403);
      res.end();
      return;
    }
    let body = "";
    req.on("data", (x) => {
      body += x;
      if (body.length > 8192) req.destroy();
    });
    req.on("end", () => {
      chain = chain.then(async () => {
        try {
          const { command, args } = JSON.parse(body);
          const result = await handle(command, args || {});
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify(result));
        } catch (e) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: e.message }));
        }
      });
    });
  });
  server.requestTimeout = 5000;
  server.headersTimeout = 5000;
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(connection(dir).port, "127.0.0.1", resolve);
  });
  try {
    guard = new Guard(readJson(stateFile, initialState()), config);
  } catch (e) {
    server.close();
    throw e;
  }
  function shutdown() {
    stopping = true;
    clearTimeout(pollTimer);
    quota?.close();
    for (const link of links.values()) link.close();
    server.close();
    setTimeout(() => process.exit(0), 200).unref();
  }
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
  void poll();
  return server;
}
export async function loadedIds(rpc) {
  const ids = [];
  let cursor;
  do {
    const r = await rpc.rpc("thread/loaded/list", {
      ...(cursor ? { cursor } : {}),
      limit: 100,
    });
    ids.push(...r.data);
    cursor = r.nextCursor;
  } while (cursor);
  return ids;
}
