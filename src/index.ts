import { tool } from "@opencode-ai/plugin";
import type { Plugin } from "@opencode-ai/plugin";
import type { SymbolLocationKind } from "./roslyn/client";
import { normalizeLocations } from "./tools/locations";
import { resolveWorkspacePath } from "./tools/paths";
import { getPosition } from "./tools/position";
import {
  getClient,
  getClientCount,
  getStatus,
  shutdownAllClients,
} from "./state";
import { json } from "./shared/json";

export const CSharpLspPlugin: Plugin = async (pluginContext) => ({
  tool: {
    csharp_lsp_status: tool({
      description:
        "Return status for the opencode-sharp Roslyn language server sidecar.",
      args: {},
      async execute(_args, context) {
        const status = getStatus(getClient(context));
        return json({ ok: true, ...status });
      },
    }),
    csharp_lsp_shutdown: tool({
      description: "Shut down opencode-sharp Roslyn language server sidecars.",
      args: {},
      async execute() {
        const count = getClientCount();
        await shutdownAllClients();
        return json({ ok: true, shutDown: count });
      },
    }),
    csharp_diagnostics: tool({
      description:
        "Preferred tool for .cs diagnostics. Pull Roslyn diagnostics for a C# file using the opencode-sharp sidecar instead of generic LSP diagnostics.",
      args: { file: tool.schema.string() },
      async execute(args, context) {
        const client = getClient(context);
        const file = resolveWorkspacePath(context, args.file);
        return json({
          ok: true,
          file,
          diagnostics: await client.diagnostics(file),
        });
      },
    }),
    csharp_workspace_symbols: tool({
      description:
        "Preferred tool for C# workspace symbols. Search Roslyn workspace symbols across loaded C# solutions/projects instead of generic workspace symbol tools.",
      args: { query: tool.schema.string() },
      async execute(args, context) {
        const client = getClient(context);
        return json({
          ok: true,
          query: args.query,
          symbols: await client.workspaceSymbols(args.query),
        });
      },
    }),
    csharp_symbol_locations: tool({
      description:
        "Preferred tool for .cs definitions, declarations, and type definitions. Use Roslyn symbol locations instead of generic LSP location tools.",
      args: {
        file: tool.schema.string(),
        line: tool.schema.number(),
        column: tool.schema.number(),
        kind: tool.schema.string().optional(),
      },
      async execute(args, context) {
        const requestedKind = args.kind ?? "definition";
        if (!isSymbolLocationKind(requestedKind) && requestedKind !== "all") {
          return json({
            ok: false,
            error: `Unsupported symbol location kind: ${requestedKind}`,
          });
        }

        const client = getClient(context);
        const file = resolveWorkspacePath(context, args.file);
        const position = getPosition(args);
        const kinds =
          requestedKind === "all" ? symbolLocationKinds : [requestedKind];
        const results = await Promise.all(
          kinds.map(async (kind) => ({
            kind,
            locations: normalizeLocations(
              await client.symbolLocations(file, position, kind),
            ),
          })),
        );

        return json({ ok: true, file, position, results });
      },
    }),
    csharp_references: tool({
      description:
        "Preferred tool for .cs references. Find Roslyn references for a C# symbol position instead of generic LSP reference tools.",
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
    }),
  },
});

export default CSharpLspPlugin;

const symbolLocationKinds: SymbolLocationKind[] = [
  "definition",
  "declaration",
  "typeDefinition",
];

function isSymbolLocationKind(kind: string): kind is SymbolLocationKind {
  return symbolLocationKinds.includes(kind as SymbolLocationKind);
}
