import type { ToolContext } from "@opencode-ai/plugin";
import path from "node:path";

export function resolveWorkspacePath(context: ToolContext, file: string) {
  return path.isAbsolute(file)
    ? file
    : path.resolve(context.worktree || context.directory, file);
}
