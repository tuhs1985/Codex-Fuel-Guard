import { createHash } from "node:crypto";

export const defaults = {
  thresholds: [20, 10, 5],
  hysteresis: 3,
  recoverySamples: 2,
  pollSeconds: 15,
  staleSeconds: 90,
};
export function configuration(value = {}) {
  const c = { ...defaults, ...value };
  if (
    !Array.isArray(c.thresholds) ||
    !c.thresholds.length ||
    c.thresholds.some((x) => !Number.isFinite(x) || x <= 0 || x >= 100) ||
    new Set(c.thresholds).size !== c.thresholds.length
  )
    throw Error("Invalid thresholds");
  for (const [key, min, max] of [
    ["hysteresis", 1, 50],
    ["recoverySamples", 2, 100],
    ["pollSeconds", 5, 300],
    ["staleSeconds", 30, 3600],
  ])
    if (!Number.isFinite(c[key]) || c[key] < min || c[key] > max)
      throw Error(`Invalid ${key}`);
  c.thresholds = [...c.thresholds].sort((a, b) => b - a);
  return c;
}
export function parseSnapshot(raw) {
  if (!raw || typeof raw !== "object") throw Error("Missing rate-limit state");
  const map = raw.rateLimitsByLimitId;
  const buckets =
    map &&
    typeof map === "object" &&
    !Array.isArray(map) &&
    Object.keys(map).length
      ? Object.entries(map)
      : raw.rateLimits
        ? [[raw.rateLimits.limitId || "codex", raw.rateLimits]]
        : [];
  const windows = [];
  for (const [id, b] of buckets) {
    if (!b || typeof b !== "object") continue;
    for (const slot of ["primary", "secondary"]) {
      const w = b[slot];
      if (
        !w ||
        !Number.isInteger(w.usedPercent) ||
        w.usedPercent < 0 ||
        w.usedPercent > 100 ||
        ![300, 10080].includes(w.windowDurationMins)
      )
        continue;
      if (
        w.resetsAt != null &&
        (!Number.isSafeInteger(w.resetsAt) || w.resetsAt <= 0)
      )
        continue;
      const key = `${id}:${w.windowDurationMins}`;
      if (windows.some((x) => x.key === key))
        throw Error("Duplicate quota duration in bucket");
      windows.push({
        key,
        bucket: id,
        minutes: w.windowDurationMins,
        remaining: 100 - w.usedPercent,
        resetsAt: w.resetsAt ?? null,
      });
    }
  }
  if (!windows.length) throw Error("No valid 5-hour or weekly quota windows");
  return {
    account: raw.accountId
      ? createHash("sha256").update(raw.accountId).digest("hex")
      : null,
    windows,
  };
}
export function warning(w, threshold) {
  const label = w.minutes === 300 ? "5-hour" : "Weekly";
  const advice =
    threshold <= 5
      ? "Stop expanding scope. Finish only immediately completable work and create a durable restart/handoff state before quota exhaustion."
      : threshold <= 10
        ? "Prioritize completing the current objective. Avoid starting additional substantial work. Prepare a checkpoint if completion becomes uncertain."
        : "Continue current work, but avoid unnecessary scope expansion.";
  return `[FUEL GUARD] ${label} allowance approximately ${w.remaining}% remaining${w.bucket === "codex" ? "" : ` (${w.bucket})`}. ${advice}`;
}
export function initialState() {
  return {
    version: 1,
    account: null,
    lastSample: 0,
    serial: 0,
    windows: {},
    sessions: {},
  };
}
export class Guard {
  constructor(state = initialState(), config = {}) {
    if (state.version !== 1) throw Error("Unsupported state version");
    this.state = state;
    this.config = configuration(config);
  }
  update(raw, at = Date.now(), partial = false) {
    const parsed = parseSnapshot(raw),
      s = this.state,
      c = this.config;
    if (at <= s.lastSample) return [];
    if (parsed.account && s.account && parsed.account !== s.account) {
      s.windows = {};
      for (const session of Object.values(s.sessions)) session.delivered = {};
    }
    if (parsed.account) s.account = parsed.account;
    s.lastSample = at;
    const events = [];
    if (!partial)
      for (const old of Object.values(s.windows)) old.available = false;
    for (const w of parsed.windows) {
      let old = s.windows[w.key];
      // A delayed prior window must never replace a newer epoch.
      if (old?.resetsAt && w.resetsAt && w.resetsAt < old.resetsAt - 60)
        continue;
      // Backend reset timestamps can jitter by seconds. Keep the established
      // epoch within one minute; only materially older epochs are out of order.
      if (
        old?.resetsAt &&
        w.resetsAt &&
        Math.abs(w.resetsAt - old.resetsAt) <= 60
      )
        w.resetsAt = old.resetsAt;
      const reset =
        old?.resetsAt &&
        w.resetsAt &&
        w.resetsAt > old.resetsAt &&
        at >= old.resetsAt * 1000;
      if (!old || reset) old = { fired: [], recovery: {}, event: null };
      Object.assign(old, w, { seenAt: at, available: true });
      for (const t of c.thresholds) {
        if (w.remaining >= t + c.hysteresis) {
          old.recovery[t] = (old.recovery[t] || 0) + 1;
          if (old.recovery[t] >= c.recoverySamples)
            old.fired = old.fired.filter((x) => x !== t);
        } else old.recovery[t] = 0;
      }
      if (old.event && !old.fired.includes(old.event.threshold))
        old.event = null;
      const crossed = c.thresholds.filter(
        (t) => w.remaining <= t && !old.fired.includes(t),
      );
      if (crossed.length) {
        old.fired = [...new Set([...old.fired, ...crossed])];
        const threshold = Math.min(...crossed);
        old.event = {
          id: ++s.serial,
          threshold,
          text: warning(w, threshold),
          at,
        };
        events.push(old.event);
      }
      s.windows[w.key] = old;
    }
    return events;
  }
  attach(id, cwd, mode = "hook", endpoint = null, now = Date.now()) {
    if (typeof id !== "string" || !/^[a-zA-Z0-9_-]{8,128}$/.test(id))
      throw Error(
        "Explicit valid thread/session id required; cwd guessing is disabled",
      );
    if (!["hook", "steer"].includes(mode)) throw Error("Invalid delivery mode");
    const previous = this.state.sessions[id];
    if (previous && previous.cwd !== cwd)
      throw Error("Thread already registered with another cwd");
    this.state.sessions[id] = {
      ...previous,
      id,
      cwd,
      mode,
      endpoint,
      lastSeen: now,
      delivered: previous?.delivered || {},
    };
    return this.state.sessions[id];
  }
  pending(id, now = Date.now()) {
    const session = this.state.sessions[id];
    if (!session) return [];
    return Object.values(this.state.windows)
      .filter(
        (w) =>
          w.available &&
          w.event &&
          now - w.seenAt <= this.config.staleSeconds * 1000 &&
          (!w.resetsAt || now < w.resetsAt * 1000) &&
          session.delivered[w.key] !== w.event.id &&
          w.remaining <= w.event.threshold + this.config.hysteresis,
      )
      .map((w) => ({
        key: w.key,
        ...w.event,
        text: warning(w, w.event.threshold),
      }));
  }
  acknowledge(id, events) {
    const s = this.state.sessions[id];
    if (s) for (const e of events) s.delivered[e.key] = e.id;
  }
  prune(now = Date.now()) {
    for (const [id, s] of Object.entries(this.state.sessions))
      if (now - s.lastSeen > 30 * 86400000) delete this.state.sessions[id];
  }
}
export async function steerPending(
  guard,
  id,
  rpc,
  activeTurn,
  save = () => {},
) {
  const pending = guard.pending(id);
  if (!activeTurn || !pending.length) return false;
  // The expected turn precondition makes an idle race fail instead of starting work.
  await rpc("turn/steer", {
    threadId: id,
    expectedTurnId: activeTurn,
    input: [{ type: "text", text: pending.map((x) => x.text).join("\n") }],
  });
  guard.acknowledge(id, pending);
  save();
  return true;
}
