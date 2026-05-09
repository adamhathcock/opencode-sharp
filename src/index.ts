import { tool } from "@opencode-ai/plugin";
import type { Plugin } from "@opencode-ai/plugin";
import type { WorkspaceEdit } from "./csharp/types";
import type { SymbolLocationKind } from "./roslyn/client";
import { shutdownClientForRoot } from "./state";
import {
  positionToToolPosition,
  rangeStartToToolPosition,
  normalizeLocations,
} from "./tools/locations";
import { resolveWorkspacePath } from "./tools/paths";
import { getPosition } from "./tools/position";
import { getClient } from "./state";
import { json } from "./shared/json";
import { applyWorkspaceEdit } from "./tools/workspaceEdit";

export const CSharpLspPlugin: Plugin = async (pluginContext) => ({
  async event({ event }) {
    if (event.type === "server.instance.disposed") {
      await shutdownClientForRoot(event.properties.directory);
    }
  },
  tool: {
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
        "Preferred tool for .cs definitions, type definitions, and implementations. Use Roslyn symbol locations instead of generic LSP location tools.",
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
    csharp_hover: tool({
      description:
        "Preferred tool for C# hover/type information at a file position using Roslyn.",
      args: {
        file: tool.schema.string(),
        line: tool.schema.number(),
        column: tool.schema.number(),
      },
      async execute(args, context) {
        const client = getClient(context);
        const file = resolveWorkspacePath(context, args.file);
        const position = getPosition(args);
        return json({
          ok: true,
          file,
          position,
          toolPosition: positionToToolPosition(position),
          hover: await client.hover(file, position),
        });
      },
    }),
    csharp_document_symbols: tool({
      description:
        "Preferred tool for a semantic C# file outline using Roslyn document symbols.",
      args: { file: tool.schema.string() },
      async execute(args, context) {
        const client = getClient(context);
        const file = resolveWorkspacePath(context, args.file);
        const symbols = await client.documentSymbols(file);
        return json({ ok: true, file, symbols: normalizeSymbols(symbols) });
      },
    }),
    csharp_prepare_rename: tool({
      description:
        "Preferred tool to check whether a C# symbol can be renamed by Roslyn at a file position.",
      args: {
        file: tool.schema.string(),
        line: tool.schema.number(),
        column: tool.schema.number(),
      },
      async execute(args, context) {
        const client = getClient(context);
        const file = resolveWorkspacePath(context, args.file);
        const position = getPosition(args);
        return json({
          ok: true,
          file,
          position,
          toolPosition: positionToToolPosition(position),
          prepareRename: await client.prepareRename(file, position),
        });
      },
    }),
    csharp_rename: tool({
      description:
        "Preferred tool to semantically rename a C# symbol using Roslyn, optionally applying the returned workspace edit.",
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
  "typeDefinition",
  "implementation",
];

function isSymbolLocationKind(kind: string): kind is SymbolLocationKind {
  return symbolLocationKinds.includes(kind as SymbolLocationKind);
}

function normalizeSymbols(symbols: unknown[]): unknown[] {
  return symbols.map((symbol) => {
    if (!isRecord(symbol)) {
      return symbol;
    }

    const normalized = {
      ...symbol,
      position: rangeStartToToolPosition(symbol.selectionRange ?? symbol.range),
    };
    if (Array.isArray(symbol.children)) {
      return { ...normalized, children: normalizeSymbols(symbol.children) };
    }
    if (isRecord(symbol.location)) {
      return {
        ...normalized,
        location: normalizeLocationObject(symbol.location),
      };
    }

    return normalized;
  });
}

function normalizeLocationObject(location: Record<string, unknown>) {
  const normalized = normalizeLocations(location);
  return normalized[0] ?? location;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
