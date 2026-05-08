import type { JsonRpcId, JsonRpcMessage, PendingRequest } from "../lsp/types";

export class PendingRequests {
  private nextId = 1;
  private pending = new Map<JsonRpcId, PendingRequest>();

  create(method: string) {
    const id = this.nextId++;
    const promise = new Promise<unknown>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`LSP request timed out: ${method}`));
      }, 30000);

      this.pending.set(id, {
        method,
        resolve: (value) => {
          clearTimeout(timeout);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        }
      });
    });

    return { id, promise };
  }

  resolve(message: JsonRpcMessage) {
    const pending = this.pending.get(message.id!);
    if (!pending) {
      return;
    }

    this.pending.delete(message.id!);
    if (message.error) {
      pending.reject(new Error(`${pending.method}: ${message.error.message}`));
    } else {
      pending.resolve(message.result);
    }
  }

  rejectAll(error: Error) {
    for (const request of this.pending.values()) {
      request.reject(error);
    }
    this.pending.clear();
  }
}
