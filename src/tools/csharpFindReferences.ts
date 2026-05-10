import { tool } from "@opencode-ai/plugin";
import { getClient } from "../state";
import { json } from "../shared/json";
import { normalizeLocations } from "./locations";
import { resolveWorkspacePath } from "./paths";
import { getPosition } from "./position";

export const csharpFindReferencesTool: any = tool({
  description:
    "Find C# references for a symbol position using Roslyn textDocument/references.",
  args: {
    file: tool.schema.string(),
    line: tool.schema.number(),
    column: tool.schema.number(),
    includeDeclaration: tool.schema.boolean().optional(),
  },
  async execute(args, context) {
    const client = getClient(context);
    const file = resolveWorkspacePath(context, args.file);
    const position = getPosition(args);
    const includeDeclaration = args.includeDeclaration ?? true;
    const references = normalizeLocations(
      await client.references(file, position, includeDeclaration),
    );

    return json({
      ok: true,
      file,
      position,
      includeDeclaration,
      references,
    });
  },
});
