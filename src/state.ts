import type { ToolContext } from "@opencode-ai/plugin";
import path from "node:path";
import { RoslynLspClient } from "./roslyn/client.js";

const clients = new Map<string, RoslynLspClient>();

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

export async function shutdownClientForRoot(root: string) {
  const resolvedRoot = path.resolve(root);
  const client = clients.get(resolvedRoot);
  if (!client) {
    return;
  }

  await client.shutdown();
  clients.delete(resolvedRoot);
}
