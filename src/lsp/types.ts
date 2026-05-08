export type JsonRpcId = number | string;

export type JsonRpcMessage = {
  jsonrpc?: "2.0";
  id?: JsonRpcId;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
};

export type PendingRequest = {
  resolve(value: unknown): void;
  reject(error: Error): void;
  method: string;
};
