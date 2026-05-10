import { tool } from "@opencode-ai/plugin";
import { getClient } from "../state";
import { json } from "../shared/json";
import {
  normalizeLocations,
  positionToToolPosition,
} from "./locations";
import { resolveWorkspacePath } from "./paths";
import { getPosition } from "./position";
import type { SymbolLocationKind } from "../roslyn/client";

export const csharpSymbolLocationsTool: any = tool({
  description:
    "Find C# definition, type definition, or implementation locations for a symbol position using Roslyn.",
  args: {
    file: tool.schema.string(),
    line: tool.schema.number(),
    column: tool.schema.number(),
    kind: tool.schema.string().optional(),
  },
  async execute(args, context) {
    const client = getClient(context);
    const file = resolveWorkspacePath(context, args.file);
    const position = getPosition(args);
    const kind = getLocationKind(args.kind);

    return json({
      ok: true,
      file,
      position,
      toolPosition: positionToToolPosition(position),
      kind,
      locations: normalizeLocations(await client.symbolLocations(file, position, kind)),
    });
  },
});

function getLocationKind(kind: string | undefined): SymbolLocationKind {
  if (
    kind === undefined ||
    kind === "definition" ||
    kind === "typeDefinition" ||
    kind === "implementation"
  ) {
    return kind ?? "definition";
  }

  throw new Error(
    "kind must be one of: definition, typeDefinition, implementation",
  );
}
