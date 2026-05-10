import { tool } from "@opencode-ai/plugin";
import { promises as fs } from "node:fs";
import type { CodeActionOrCommand } from "../csharp/types";
import { getClient } from "../state";
import { json } from "../shared/json";
import { summarizeResolvedActions } from "./codeActions";
import { resolveWorkspacePath } from "./paths";
import { getRange } from "./range";

export const csharpCodeActionTool: any = tool({
  description:
    "List Roslyn code actions for a C# file range and resolve workspace edits when available.",
  args: {
    file: tool.schema.string(),
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

    return json({
      ok: true,
      file,
      range,
      actions: await summarizeResolvedActions(client, actions),
    });
  },
});
