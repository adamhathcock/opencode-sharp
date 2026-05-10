import { tool } from "@opencode-ai/plugin";
import type { WorkspaceEdit } from "../csharp/types";
import { json } from "../shared/json";
import { applyWorkspaceEdit } from "./workspaceEdit";

export const csharpApplyWorkspaceEditTool: any = tool({
  description:
    "Apply an LSP WorkspaceEdit returned by Roslyn tools and report changed files.",
  args: { edit: tool.schema.any() },
  async execute(args) {
    return json({
      ok: true,
      applied: await applyWorkspaceEdit(args.edit as WorkspaceEdit),
    });
  },
});
