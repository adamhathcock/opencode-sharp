import { tool } from "@opencode-ai/plugin";
import { getPosition } from "./position.js";
import { resolveWorkspacePath } from "./paths.js";
import { getClient } from "../state.js";
import { normalizeLocations, positionToToolPosition } from "./locations.js";
import { json } from "../shared/json.js";
import { normalizeDocumentSymbols } from "./symbolNormalization.js";

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
