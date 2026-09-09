import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createHash, randomBytes } from "node:crypto";
import {fileURLToPath} from 'node:url';
const moduleDirectory=path.dirname(fileURLToPath(import.meta.url));
// Installed launchers resolve their own installation, never an inherited
// LOCALAPPDATA/FUEL_GUARD_HOME from a different execution identity.
const installedRoot=path.basename(moduleDirectory)==='src'&&path.basename(path.dirname(moduleDirectory))==='app'?path.resolve(moduleDirectory,'../..'):null;
export const home =
  installedRoot || process.env.FUEL_GUARD_HOME ||
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
  const endpoint=readJson(path.join(dir,'endpoint.json'),null);
  if(endpoint && (!Number.isInteger(endpoint.port)||endpoint.port<1024||endpoint.port>65535))throw Object.assign(Error('Invalid installation endpoint.json port'),{code:'INSTALL_INVALID'});
  return {
    host: "127.0.0.1",
    port:
      endpoint?.port ?? (40000 +
      (parseInt(
        createHash("sha256")
          .update(path.resolve(dir).toLowerCase())
          .digest("hex")
          .slice(0, 4),
        16,
      ) %
        20000)),
  };
}
export function secret(dir = home, create = false) {
  const f = path.join(dir, "ipc-token");
  if(!create){
    try{return fs.readFileSync(f,'utf8').trim();}catch(e){throw Object.assign(Error(`Installation token is missing or inaccessible at ${dir}; run diagnostics in ordinary Windows and Codex. Clients never create tokens.`),{code:e.code==='ENOENT'?'INSTALL_MISSING':'INSTALL_INACCESSIBLE'});}
  }
  fs.mkdirSync(dir, { recursive: true });
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
