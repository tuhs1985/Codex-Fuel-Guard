import http from "node:http";
import { connection, secret, home } from "./storage.mjs";
export function request(command, args = {}, dir = home, timeout = 2500) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ command, args });
    const r = http.request(
      {
        ...connection(dir),
        method: "POST",
        path: "/",
        headers: {
          "x-fuel-guard-token": secret(dir),
          "content-type": "application/json",
          "content-length": Buffer.byteLength(data),
        },
      },
      (res) => {
        let body = "";
        res.on("data", (x) => (body += x));
        res.on("end", () => {
          try {
            const v = JSON.parse(body);
            if (v.error) reject(Error(v.error));
            else resolve(v);
          } catch {
            reject(Error("Invalid daemon reply"));
          }
        });
      },
    );
    r.setTimeout(timeout, () => r.destroy(Error("Fuel Guard timeout")));
    r.on("error", reject);
    r.end(data);
  });
}
