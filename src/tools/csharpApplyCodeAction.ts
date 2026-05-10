import { tool } from "@opencode-ai/plugin";
import { promises as fs } from "node:fs";
import type { CodeActionOrCommand } from "../csharp/types";
import { getClient } from "../state";
import { json } from "../shared/json";
import {
  findCodeActionById,
  isCodeAction,
} from "./codeActions";
import { applyWorkspaceEdit } from "./workspaceEdit";
import { resolveWorkspacePath } from "./paths";
import { getRange } from "./range";

export const csharpApplyCodeActionTool: any = tool({
  description:
    "Re-fetch, resolve, and apply a Roslyn C# code action by the id returned from csharp_code_action.",
  args: {
    file: tool.schema.string(),
    actionId: tool.schema.string(),
    startLine: tool.schema.number().optional(),
    startColumn: tool.schema.number().optional(),
    endLine: tool.schema.number().optional(),
    endColumn: tool.schema.number().optional(),
  },
  async execute(args, context) {
    const client = getClient(context);
    const file = resolveWorkspacePath(context, args.file);
    const text = await fs.readFile(file, "utf8");
    const range = getRange(args, text);
    const actions = (await client.codeActions(
      file,
      range,
    )) as CodeActionOrCommand[];
    const action = findCodeActionById(actions, args.actionId);

    if (!action) {
      return json({
        ok: false,
        file,
        range,
        actionId: args.actionId,
        error: "No code action matched the supplied id.",
      });
    }

    if (!isCodeAction(action)) {
      return json({
        ok: false,
        file,
        range,
        actionId: args.actionId,
        action,
        error: "Matched action is a command, not an editable code action.",
      });
    }

    const resolved = await client.resolveCodeAction(action);
    if (!resolved.edit) {
      return json({
        ok: false,
        file,
        range,
        actionId: args.actionId,
        action: resolved,
        error: "Resolved code action did not include a workspace edit.",
      });
    }

    return json({
      ok: true,
      file,
      range,
      actionId: args.actionId,
      title: resolved.title,
      kind: resolved.kind,
      applied: await applyWorkspaceEdit(resolved.edit),
    });
  },
});
