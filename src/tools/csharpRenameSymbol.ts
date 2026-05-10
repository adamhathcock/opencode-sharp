import { tool } from "@opencode-ai/plugin";
import { getClient } from "../state";
import { json } from "../shared/json";
import type { WorkspaceEdit } from "../csharp/types";
import { resolveWorkspacePath } from "./paths";
import { getPosition } from "./position";
import { applyWorkspaceEdit } from "./workspaceEdit";
import { positionToToolPosition } from "./locations";

export const csharpRenameSymbolTool: any = tool({
  description:
    "Rename a C# symbol using Roslyn textDocument/rename, optionally applying the returned workspace edit.",
  args: {
    file: tool.schema.string(),
    line: tool.schema.number(),
    column: tool.schema.number(),
    newName: tool.schema.string(),
    apply: tool.schema.boolean().optional(),
  },
  async execute(args, context) {
    const client = getClient(context);
    const file = resolveWorkspacePath(context, args.file);
    const position = getPosition(args);
    const edit = (await client.rename(
      file,
      position,
      args.newName,
    )) as WorkspaceEdit | null;
    const applied = args.apply && edit ? await applyWorkspaceEdit(edit) : undefined;

    return json({
      ok: true,
      file,
      position,
      toolPosition: positionToToolPosition(position),
      newName: args.newName,
      applied,
      edit,
    });
  },
});
