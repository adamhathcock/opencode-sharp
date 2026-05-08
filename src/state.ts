import type { ToolContext } from "@opencode-ai/plugin";
import path from "node:path";
import type { CodeActionOrCommand } from "./csharp/types";
import { RoslynLspClient } from "./roslyn/client";

const clients = new Map<string, RoslynLspClient>();
const actionCache = new Map<string, { client: RoslynLspClient; action: CodeActionOrCommand }>();
let nextActionId = 1;

export function getClient(context: ToolContext) {
  const root = path.resolve(context.worktree || context.directory);
  let client = clients.get(root);
  if (!client) {
    client = new RoslynLspClient(root);
    clients.set(root, client);
  }

  return client;
}

export function cacheAction(client: RoslynLspClient, action: CodeActionOrCommand) {
  const id = `ca-${nextActionId++}`;
  actionCache.set(id, { client, action });
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

export async function shutdownAllClients() {
  await Promise.all([...clients.values()].map((client) => client.shutdown()));
  clients.clear();
  actionCache.clear();
}
