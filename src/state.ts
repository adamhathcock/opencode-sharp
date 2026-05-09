import type { ToolContext } from "@opencode-ai/plugin";
import path from "node:path";
import type { CodeActionOrCommand, Range } from "./csharp/types";
import { RoslynLspClient } from "./roslyn/client";

const clients = new Map<string, RoslynLspClient>();
const actionCache = new Map<
  string,
  {
    client: RoslynLspClient;
    action: CodeActionOrCommand;
    file: string;
    range: Range;
  }
>();
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

export function cacheAction(
  client: RoslynLspClient,
  action: CodeActionOrCommand,
  file: string,
  range: Range,
) {
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

export async function shutdownClientForRoot(root: string) {
  const resolvedRoot = path.resolve(root);
  const client = clients.get(resolvedRoot);
  if (!client) {
    return;
  }

  await client.shutdown();
  clients.delete(resolvedRoot);

  for (const [id, cached] of actionCache) {
    if (cached.client === client) {
      actionCache.delete(id);
    }
  }
}
