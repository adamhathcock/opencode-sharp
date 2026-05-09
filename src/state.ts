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
const completionCache = new Map<
  string,
  { client: RoslynLspClient; item: unknown }
>();
const inlayHintCache = new Map<
  string,
  { client: RoslynLspClient; hint: unknown }
>();
let nextActionId = 1;
let nextCompletionId = 1;
let nextInlayHintId = 1;

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

export function cacheCompletionItem(client: RoslynLspClient, item: unknown) {
  const id = `ci-${nextCompletionId++}`;
  completionCache.set(id, { client, item });
  return id;
}

export function getCachedCompletionItem(id: string) {
  return completionCache.get(id);
}

export function deleteCachedCompletionItem(id: string) {
  completionCache.delete(id);
}

export function cacheInlayHint(client: RoslynLspClient, hint: unknown) {
  const id = `ih-${nextInlayHintId++}`;
  inlayHintCache.set(id, { client, hint });
  return id;
}

export function getCachedInlayHint(id: string) {
  return inlayHintCache.get(id);
}

export function deleteCachedInlayHint(id: string) {
  inlayHintCache.delete(id);
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
  for (const [id, cached] of completionCache) {
    if (cached.client === client) {
      completionCache.delete(id);
    }
  }
  for (const [id, cached] of inlayHintCache) {
    if (cached.client === client) {
      inlayHintCache.delete(id);
    }
  }
}
