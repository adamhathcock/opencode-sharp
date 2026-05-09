import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import type { JsonRpcMessage } from "../lsp/types";
import { formatMessage, MessageBuffer } from "./framing";
import { MessageLog } from "./messageLog";
import { PendingRequests } from "./pendingRequests";

type RequestHandler = (message: JsonRpcMessage) => unknown;

export class RpcConnection {
  private child: ChildProcessWithoutNullStreams | undefined;
  private pending = new PendingRequests();
  private messageBuffer = new MessageBuffer();
  private log = new MessageLog();
  private lastExit:
    | { code: number | null; signal: NodeJS.Signals | null }
    | undefined;

  constructor(
    private readonly command: string,
    private readonly args: string[],
    private readonly cwd: string,
    private readonly handleRequest: RequestHandler,
  ) {}

  status() {
    return {
      running: this.child !== undefined && this.child.exitCode === null,
      lastExit: this.lastExit,
      ...this.log.status(),
    };
  }

  async start() {
    this.child = spawn(this.command, this.args, {
      cwd: this.cwd,
      stdio: "pipe",
      env: { ...process.env },
    });
    this.child.stdout.on("data", (chunk: Buffer) => this.handleStdout(chunk));
    this.child.stderr.on("data", (chunk: Buffer) =>
      this.log.appendStderr(chunk),
    );
    this.child.on("exit", (code, signal) => this.handleExit(code, signal));

    await new Promise<void>((resolve, reject) => {
      this.child?.once("spawn", resolve);
      this.child?.once("error", reject);
    });
  }

  async shutdown() {
    const child = this.child;
    if (!child) {
      return;
    }

    try {
      await this.request("shutdown", null);
      this.notify("exit", null);
    } catch {
      child.kill();
    }
  }

  request(method: string, params: unknown) {
    if (!this.child) {
      return Promise.reject(new Error("roslyn-language-server is not running"));
    }

    const { id, promise } = this.pending.create(method);
    this.write({ jsonrpc: "2.0", id, method, params });
    return promise;
  }

  notify(method: string, params: unknown) {
    this.write({ jsonrpc: "2.0", method, params });
  }

  private write(message: unknown) {
    if (!this.child) {
      throw new Error("roslyn-language-server is not running");
    }

    this.child.stdin.write(formatMessage(message));
  }

  private handleStdout(chunk: Buffer) {
    for (const message of this.messageBuffer.append(chunk)) {
      this.handleMessage(message);
    }
  }

  private handleMessage(message: JsonRpcMessage) {
    if (message.id !== undefined && message.method === undefined) {
      this.pending.resolve(message);
    } else if (message.id !== undefined && message.method) {
      this.write({
        jsonrpc: "2.0",
        id: message.id,
        result: this.handleRequest(message),
      });
    } else {
      this.log.capture(message);
    }
  }

  private handleExit(code: number | null, signal: NodeJS.Signals | null) {
    this.lastExit = { code, signal };
    this.child = undefined;
    this.pending.rejectAll(
      new Error("roslyn-language-server exited while handling a request"),
    );
  }
}
