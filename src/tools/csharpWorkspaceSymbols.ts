import { tool } from "@opencode-ai/plugin";
import { getClient } from "../state";
import { json } from "../shared/json";
import { normalizeWorkspaceSymbols } from "./locations";

export const csharpWorkspaceSymbolsTool: any = tool({
  description:
    "Search C# workspace symbols using Roslyn workspace/symbol and return normalized file positions.",
  args: {
    query: tool.schema.string(),
    limit: tool.schema.number().optional(),
  },
  async execute(args, context) {
    const client = getClient(context);
    const limit = getLimit(args.limit, 50, 200);
    const symbols = (await client.workspaceSymbols(args.query)).slice(0, limit);

    return json({
      ok: true,
      query: args.query,
      limit,
      symbols: normalizeWorkspaceSymbols(symbols),
    });
  },
});

function getLimit(value: number | undefined, fallback: number, max: number) {
  if (value === undefined || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(Math.max(Math.floor(value), 1), max);
}
