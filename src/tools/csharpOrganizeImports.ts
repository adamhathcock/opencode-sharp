import { tool } from "@opencode-ai/plugin";
import { promises as fs } from "node:fs";
import type { CodeActionOrCommand } from "../csharp/types";
import { getClient } from "../state";
import { json } from "../shared/json";
import {
  applyFirstCandidate,
  isOrganizeImportsAction,
  resolveEditableCandidates,
} from "./codeActionApply";
import { resolveWorkspacePath } from "./paths";
import { getRange } from "./range";

export const csharpOrganizeImportsTool: any = tool({
  description:
    "Organize C# usings/imports for a file by applying Roslyn's safe organize imports code action.",
  args: { file: tool.schema.string() },
  async execute(args, context) {
    const client = getClient(context);
    const file = resolveWorkspacePath(context, args.file);
    const text = await fs.readFile(file, "utf8");
    const range = getRange({}, text);
    const actions = (await client.codeActions(file, range, {
      only: ["source.organizeImports"],
    })) as CodeActionOrCommand[];
    const { candidates, skipped } = await resolveEditableCandidates(
      client,
      actions,
      isOrganizeImportsAction,
    );
    const applied = await applyFirstCandidate(candidates);

    return json({
      ok: applied !== undefined,
      file,
      range,
      applied,
      skipped,
      error: applied
        ? undefined
        : "No safe organize imports code action found.",
    });
  },
});
