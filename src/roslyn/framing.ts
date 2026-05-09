import type { JsonRpcMessage } from "../lsp/types";

export function formatMessage(message: unknown) {
  const body = JSON.stringify(message);
  return `Content-Length: ${Buffer.byteLength(body, "utf8")}\r\n\r\n${body}`;
}

export class MessageBuffer {
  private buffer = Buffer.alloc(0);

  append(chunk: Buffer) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    const messages: JsonRpcMessage[] = [];

    while (true) {
      const headerEnd = this.buffer.indexOf("\r\n\r\n");
      if (headerEnd === -1) {
        return messages;
      }

      const header = this.buffer.subarray(0, headerEnd).toString("ascii");
      const match = /Content-Length: (\d+)/i.exec(header);
      if (!match) {
        this.buffer = this.buffer.subarray(headerEnd + 4);
        continue;
      }

      const length = Number(match[1]);
      const messageStart = headerEnd + 4;
      const messageEnd = messageStart + length;
      if (this.buffer.length < messageEnd) {
        return messages;
      }

      const raw = this.buffer
        .subarray(messageStart, messageEnd)
        .toString("utf8");
      this.buffer = this.buffer.subarray(messageEnd);
      messages.push(JSON.parse(raw) as JsonRpcMessage);
    }
  }
}
