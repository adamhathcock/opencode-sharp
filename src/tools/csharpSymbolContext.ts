import { tool } from "@opencode-ai/plugin";
import { getPosition } from "./position";
import { resolveWorkspacePath } from "./paths";
import { getClient } from "../state";
import {
  normalizeLocations,
  positionToToolPosition,
} from "./locations";
import { json } from "../shared/json";
import { normalizeDocumentSymbols } from "./symbolNormalization";

export const csharpSymbolContextTool: any = tool({
  description:
    "Best first C# symbol context tool. Returns Roslyn hover, definition, and document symbols for a file position.",
  args: {
    file: tool.schema.string(),
    line: tool.schema.number(),
    column: tool.schema.number(),
  },
  async execute(args, context) {
    const client = getClient(context);
    const file = resolveWorkspacePath(context, args.file);
    const position = getPosition(args);
    const [hover, definition, symbols] = await Promise.all([
      client.hover(file, position),
      client.symbolLocations(file, position, "definition"),
      client.documentSymbols(file),
    ]);

    return json({
      ok: true,
      file,
      position,
      toolPosition: positionToToolPosition(position),
      hover,
      definition: normalizeLocations(definition),
      documentSymbols: normalizeDocumentSymbols(symbols),
    });
  },
});
