import { tool } from "@opencode-ai/plugin";
import type { Plugin } from "@opencode-ai/plugin";
import { promises as fs } from "node:fs";
import type { CodeAction, CodeActionOrCommand, WorkspaceEdit } from "./csharp/types";
import { shutdownClientForRoot, getClient } from "./state";
import {
  normalizeLocations,
  positionToToolPosition,
  rangeStartToToolPosition,
} from "./tools/locations";
import { resolveWorkspacePath } from "./tools/paths";
import { getPosition } from "./tools/position";
import { getRange } from "./tools/range";
import { json, isRecord } from "./shared/json";
import { applyWorkspaceEdit } from "./tools/workspaceEdit";
import { isCodeAction } from "./tools/codeActions";

export const CSharpLspPlugin: Plugin = async () => ({
  async event({ event }) {
    if (event.type === "server.instance.disposed") {
      await shutdownClientForRoot(event.properties.directory);
    }
  },
  tool: {
    csharp_symbol_context: tool({
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
          documentSymbols: normalizeSymbols(symbols),
        });
      },
    }),
    csharp_find_references: tool({
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
    }),
    csharp_diagnostics: tool({
      description:
        "Return Roslyn diagnostics for a C# file using the opencode-sharp sidecar.",
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
    csharp_rename_symbol: tool({
      description:
        "Rename a C# symbol using Roslyn textDocument/rename, optionally applying the returned workspace edit.",
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
        const applied =
          args.apply && edit ? await applyWorkspaceEdit(edit) : undefined;

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
    csharp_code_action: tool({
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
    }),
    csharp_apply_workspace_edit: tool({
      description:
        "Apply an LSP WorkspaceEdit returned by Roslyn tools and report changed files.",
      args: { edit: tool.schema.any() },
      async execute(args) {
        return json({
          ok: true,
          applied: await applyWorkspaceEdit(args.edit as WorkspaceEdit),
        });
      },
    }),
  },
});

export default CSharpLspPlugin;

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

async function summarizeResolvedActions(
  client: { resolveCodeAction(action: CodeAction): Promise<CodeAction> },
  actions: CodeActionOrCommand[],
) {
  return await Promise.all(flattenCodeActions(actions).map((action) => summarizeAction(client, action)));
}

async function summarizeAction(
  client: { resolveCodeAction(action: CodeAction): Promise<CodeAction> },
  action: CodeActionOrCommand,
) {
  if (!isCodeAction(action)) {
    return {
      title: action.title,
      command: action.command,
      arguments: action.arguments,
    };
  }

  const resolved = await resolveActionIfPossible(client, action);
  return {
    title: resolved.title,
    kind: resolved.kind,
    diagnostics: resolved.diagnostics,
    edit: resolved.edit,
    command: resolved.command,
    data: resolved.data,
    resolveError: "resolveError" in resolved ? resolved.resolveError : undefined,
  };
}

async function resolveActionIfPossible(
  client: { resolveCodeAction(action: CodeAction): Promise<CodeAction> },
  action: CodeAction,
) {
  try {
    return await client.resolveCodeAction(action);
  } catch (error) {
    return {
      ...action,
      resolveError: error instanceof Error ? error.message : String(error),
    };
  }
}

function flattenCodeActions(
  actions: CodeActionOrCommand[],
): CodeActionOrCommand[] {
  return actions.flatMap((action) => {
    const children = (action as Record<string, unknown>).children;
    return [
      action,
      ...(Array.isArray(children)
        ? flattenCodeActions(children as CodeActionOrCommand[])
        : []),
    ];
  });
}
