import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { EventEmitter } from "node:events";
import path from "node:path";
import os from "node:os";

export function localEndpoint(endpoint) {
  const u = new URL(endpoint);
  if (
    u.protocol !== "ws:" ||
    u.hostname !== "127.0.0.1" ||
    !u.port ||
    u.username ||
    u.password ||
    u.pathname !== "/" ||
    u.search ||
    u.hash
  )
    throw Error("Only explicit ws://127.0.0.1:PORT endpoints are supported");
  return u.href;
}
export class AppServer extends EventEmitter {
  constructor({
    executable = "codex",
    endpoint = null,
    codexHome = process.env.CODEX_HOME ||
      path.join(process.env.USERPROFILE || os.homedir(), ".codex"),
  } = {}) {
    super();
    Object.assign(this, { executable, endpoint, codexHome });
    this.pending = new Map();
    this.id = 0;
    this.closed = false;
  }
  async connect() {
    if (this.endpoint) {
      this.ws = new WebSocket(localEndpoint(this.endpoint));
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          this.ws.close();
          reject(Error("Endpoint timeout"));
        }, 5000);
        this.ws.addEventListener(
          "open",
          () => {
            clearTimeout(timer);
            resolve();
          },
          { once: true },
        );
        this.ws.addEventListener(
          "error",
          () => {
            clearTimeout(timer);
            reject(Error("Endpoint connection failed"));
          },
          { once: true },
        );
      });
      this.ws.addEventListener("message", (e) => this.receive(e.data));
      this.ws.addEventListener("close", () => this.fail());
    } else {
      this.child = spawn(
        this.executable,
        ["app-server", "--stdio", "-c", "analytics.enabled=false"],
        {
          windowsHide: true,
          env: { ...process.env, CODEX_HOME: this.codexHome },
          stdio: ["pipe", "pipe", "pipe"],
        },
      );
      this.child.stderr.resume();
      this.child.on("error", () => this.fail());
      this.child.on("exit", () => this.fail());
      this.child.stdin.on("error", () => this.fail());
      createInterface({ input: this.child.stdout }).on("line", (x) =>
        this.receive(x),
      );
    }
    const info = await this.rpc("initialize", {
      clientInfo: { name: "codex_fuel_guard", version: "0.1.0" },
      capabilities: { experimentalApi: true },
    });
    this.send({ method: "initialized" });
    return info;
  }
  send(x) {
    if (this.closed) throw Error("App-server disconnected");
    const data = JSON.stringify(x);
    if (this.ws) this.ws.send(data);
    else this.child.stdin.write(data + "\n");
  }
  receive(line) {
    let x;
    try {
      x = JSON.parse(line);
    } catch {
      return;
    }
    if (x.id != null && x.method) {
      this.send({
        id: x.id,
        error: {
          code: -32601,
          message:
            "Fuel Guard does not handle approval or authentication requests",
        },
      });
    } else if (x.id != null && this.pending.has(x.id)) {
      const p = this.pending.get(x.id);
      clearTimeout(p.timer);
      this.pending.delete(x.id);
      if (x.error)
        p.reject(Error(`Codex RPC ${x.error.code}: ${x.error.message}`));
      else p.resolve(x.result);
    } else if (x.method) this.emit("notification", x.method, x.params);
  }
  rpc(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++this.id,
        timer = setTimeout(() => {
          this.pending.delete(id);
          reject(Error(`Codex RPC timeout: ${method}`));
        }, 10000);
      this.pending.set(id, { resolve, reject, timer });
      try {
        this.send({ id, method, params });
      } catch (e) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(e);
      }
    });
  }
  fail() {
    if (this.closed) return;
    this.closed = true;
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(Error("App-server disconnected"));
    }
    this.pending.clear();
    this.emit("disconnected");
  }
  close() {
    this.fail();
    this.ws?.close();
    this.child?.kill();
  }
}
