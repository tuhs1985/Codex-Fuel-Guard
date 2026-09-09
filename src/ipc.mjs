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
        if(res.statusCode===403){res.resume();reject(Object.assign(Error(`Fuel Guard port ${connection(dir).port} is reachable but rejected this installation token (HTTP 403). Compare Windows/task token fingerprints; do not launch another daemon.`),{code:'AUTH_MISMATCH'}));return;}
        if(res.headers['x-fuel-guard']!=='1'&&res.statusCode!==200){res.resume();reject(Object.assign(Error('Port is occupied by an unrecognized service; no daemon was launched.'),{code:'PORT_OCCUPIED'}));return;}
        let body = "";
        res.on("data", (x) => (body += x));
        res.on("end", () => {
          try {
            const v = JSON.parse(body);
            if (v.error) reject(Error(v.error));
            else if(command==='status'&&(!v.running||!Number.isInteger(v.pid)))reject(Object.assign(Error('Port responded with an unrecognized service.'),{code:'PORT_OCCUPIED'}));
            else resolve(v);
          } catch {
            reject(Object.assign(Error("Port responded with invalid Fuel Guard protocol; no daemon was launched."),{code:'PORT_OCCUPIED'}));
          }
        });
      },
    );
    r.setTimeout(timeout, () => r.destroy(Object.assign(Error("Fuel Guard connection timed out; listener health or sandbox access is uncertain. No new daemon will be launched."),{code:'IPC_TIMEOUT'})));
    r.on("error", reject);
    r.end(data);
  });
}
