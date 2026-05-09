import type { JsonRpcMessage } from "../lsp/types";

export class MessageLog {
  private messages: unknown[] = [];
  private stderr = "";

  appendStderr(chunk: Buffer) {
    this.stderr = (this.stderr + chunk.toString("utf8")).slice(-12000);
  }

  capture(message: JsonRpcMessage) {
    if (
      message.method !== "window/logMessage" &&
      message.method !== "window/showMessage" &&
      message.method !== "$/progress"
    ) {
      return false;
    }

    this.messages.push({ method: message.method, params: message.params });
    this.messages = this.messages.slice(-100);
    return true;
  }

  status() {
    return {
      logMessages: this.messages.slice(-20),
      stderr: this.stderr.slice(-4000),
    };
  }
}
