import type { ToolContext } from "@opencode-ai/plugin";
import path from "node:path";
import type { CodeActionOrCommand, Range } from "./csharp/types";
import { RoslynLspClient } from "./roslyn/client";
import { clearUsage, getUsageStatus } from "./usage";

const clients = new Map<string, RoslynLspClient>();
const actionCache = new Map<string, { client: RoslynLspClient; action: CodeActionOrCommand; file: string; range: Range }>();
let nextActionId = 1;

export function getClient(context: ToolContext) {
  const root = path.resolve(context.worktree || context.directory);
  return getClientForRoot(root);
}

export function getClientForRoot(root: string) {
  let client = clients.get(root);
  if (!client) {
    client = new RoslynLspClient(root);
    clients.set(root, client);
  }

  return client;
}

export function cacheAction(client: RoslynLspClient, action: CodeActionOrCommand, file: string, range: Range) {
  const id = `ca-${nextActionId++}`;
  actionCache.set(id, { client, action, file, range });
  return id;
}

export function getCachedAction(id: string) {
  return actionCache.get(id);
}

export function deleteCachedAction(id: string) {
  actionCache.delete(id);
}

export function getClientCount() {
  return clients.size;
}

export function getStatus(client: RoslynLspClient) {
  return {
    ...client.status(),
    usage: getUsageStatus()
  };
}

export async function shutdownAllClients() {
  await Promise.all([...clients.values()].map((client) => client.shutdown()));
  clients.clear();
  actionCache.clear();
  clearUsage();
}
