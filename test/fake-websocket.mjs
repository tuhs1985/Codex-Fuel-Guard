// Minimal RFC6455 text transport for tests only; production uses Node's WebSocket.
import http from "node:http";
import { createHash } from "node:crypto";
export async function fakeWebSocket(handler) {
  const server = http.createServer(),
    sockets = new Set();
  server.on("upgrade", (req, socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    const accept = createHash("sha1")
      .update(
        req.headers["sec-websocket-key"] +
          "258EAFA5-E914-47DA-95CA-C5AB0DC85B11",
      )
      .digest("base64");
    socket.write(
      `HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`,
    );
    let buffer = Buffer.alloc(0);
    const send = (x) => {
      const payload = Buffer.from(JSON.stringify(x));
      let header;
      if (payload.length < 126) header = Buffer.from([0x81, payload.length]);
      else {
        header = Buffer.alloc(4);
        header[0] = 0x81;
        header[1] = 126;
        header.writeUInt16BE(payload.length, 2);
      }
      socket.write(Buffer.concat([header, payload]));
    };
    socket.on("data", (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      while (buffer.length >= 2) {
        let length = buffer[1] & 127,
          offset = 2;
        const masked = buffer[1] & 128,
          opcode = buffer[0] & 15;
        if (length === 126) {
          if (buffer.length < 4) return;
          length = buffer.readUInt16BE(2);
          offset = 4;
        }
        if (length === 127) throw Error("Unexpected large test frame");
        if (buffer.length < offset + (masked ? 4 : 0) + length) return;
        const mask = masked ? buffer.subarray(offset, offset + 4) : null;
        if (masked) offset += 4;
        const payload = Buffer.from(buffer.subarray(offset, offset + length));
        if (mask)
          for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i % 4];
        buffer = buffer.subarray(offset + length);
        if (opcode === 8) {
          socket.end();
          return;
        }
        if (opcode === 1) handler(JSON.parse(payload.toString()), send);
      }
    });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return {
    endpoint: `ws://127.0.0.1:${server.address().port}`,
    close() {
      for (const s of sockets) s.destroy();
      server.close();
    },
  };
}
