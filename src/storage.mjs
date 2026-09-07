import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createHash, randomBytes } from "node:crypto";
export const home =
  process.env.FUEL_GUARD_HOME ||
  path.join(
    process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"),
    "CodexFuelGuard",
  );
export function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
  } catch (e) {
    if (e.code === "ENOENT") return fallback;
    throw e;
  }
}
export function atomic(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = file + "." + process.pid + ".tmp";
  fs.writeFileSync(temp, JSON.stringify(value, null, 2) + "\n", {
    mode: 0o600,
  });
  fs.renameSync(temp, file);
}
export function connection(dir = home) {
  return {
    host: "127.0.0.1",
    port:
      40000 +
      (parseInt(
        createHash("sha256")
          .update(path.resolve(dir).toLowerCase())
          .digest("hex")
          .slice(0, 4),
        16,
      ) %
        20000),
  };
}
export function secret(dir = home) {
  fs.mkdirSync(dir, { recursive: true });
  const f = path.join(dir, "ipc-token");
  try {
    fs.writeFileSync(f, randomBytes(32).toString("hex"), {
      flag: "wx",
      mode: 0o600,
    });
  } catch (e) {
    if (e.code !== "EEXIST") throw e;
  }
  return fs.readFileSync(f, "utf8").trim();
}
