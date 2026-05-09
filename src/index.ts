import { tool } from "@opencode-ai/plugin";
import type { Plugin } from "@opencode-ai/plugin";
import { promises as fs } from "node:fs";
import type { CodeActionOrCommand, WorkspaceEdit } from "./csharp/types";
import type { RoslynLspClient, SymbolLocationKind } from "./roslyn/client";
import {
  cacheAction,
  cacheCompletionItem,
  cacheInlayHint,
  deleteCachedCompletionItem,
  deleteCachedInlayHint,
  deleteCachedAction,
  getCachedAction,
  getCachedCompletionItem,
  getCachedInlayHint,
  getClient,
  shutdownClientForRoot,
} from "./state";
import {
  positionToToolPosition,
  rangeStartToToolPosition,
  normalizeLocations,
  uriToFile,
} from "./tools/locations";
import { resolveWorkspacePath } from "./tools/paths";
import { getPosition } from "./tools/position";
import { getRange } from "./tools/range";
import { json } from "./shared/json";
import { applyWorkspaceEdit } from "./tools/workspaceEdit";
import { isCodeAction, summarizeCodeAction } from "./tools/codeActions";
import {
  getErrorMessage,
  resolveCachedCodeAction,
} from "./tools/resolveCodeAction";

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
    csharp_code_actions: tool({
      description:
        "Preferred tool for .cs code actions. List Roslyn quick fixes and refactorings for a file range and return action IDs for csharp_apply_code_action.",
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
        const summarized = actions.map((action) => {
          const id = cacheAction(client, action, file, range);
          return summarizeCodeAction(id, action);
        });
        return json({ ok: true, file, range, actions: summarized });
      },
    }),
    csharp_apply_code_action: tool({
      description:
        "Preferred tool for applying a Roslyn code action returned by csharp_code_actions when it contains or resolves to a workspace edit.",
      args: { id: tool.schema.string() },
      async execute(args) {
        const cached = getCachedAction(args.id);
        if (!cached) {
          return json({
            ok: false,
            error: `Unknown code action ID: ${args.id}`,
          });
        }

        try {
          if (!isCodeAction(cached.action)) {
            return json({
              ok: false,
              id: args.id,
              error: "Command-only code actions are not directly supported.",
              command: cached.action,
            });
          }

          const action = await resolveCachedCodeAction(cached);
          if (!isCodeAction(action)) {
            return json({
              ok: false,
              id: args.id,
              error: "Command-only code actions are not directly supported.",
              command: action,
            });
          }
          if (!action.edit) {
            return json({
              ok: false,
              id: args.id,
              error: "Roslyn code action did not resolve to a workspace edit.",
              action,
            });
          }

          const applied = await applyWorkspaceEdit(action.edit);
          deleteCachedAction(args.id);
          return json({ ok: true, id: args.id, title: action.title, applied });
        } catch (error) {
          return json({
            ok: false,
            id: args.id,
            error: getErrorMessage(error),
          });
        }
      },
    }),
    csharp_organize_imports: tool({
      description:
        "Preferred tool to organize C# imports using Roslyn's source.organizeImports code action, optionally applying the edit.",
      args: {
        file: tool.schema.string(),
        apply: tool.schema.boolean().optional(),
      },
      async execute(args, context) {
        const client = getClient(context);
        const file = resolveWorkspacePath(context, args.file);
        const text = await fs.readFile(file, "utf8");
        const range = getRange({}, text);
        const actions = (await client.codeActions(
          file,
          range,
        )) as CodeActionOrCommand[];
        const action = flattenCodeActions(actions).find(
          isOrganizeImportsAction,
        );
        if (!action) {
          return json({
            ok: true,
            file,
            found: false,
            actions: actions.map((action, index) =>
              summarizeCodeAction(`candidate-${index + 1}`, action),
            ),
          });
        }

        const id = cacheAction(client, action, file, range);
        if (!args.apply) {
          return json({
            ok: true,
            file,
            found: true,
            action: summarizeCodeAction(id, action),
          });
        }

        const resolved = await client.resolveCodeAction(action);
        if (!resolved.edit) {
          return json({
            ok: false,
            file,
            found: true,
            error:
              "Organize imports action did not resolve to a workspace edit.",
            action: resolved,
          });
        }

        const applied = await applyWorkspaceEdit(resolved.edit);
        deleteCachedAction(id);
        return json({ ok: true, file, found: true, applied });
      },
    }),
    csharp_signature_help: tool({
      description:
        "Preferred tool for C# method call signature help at a file position using Roslyn.",
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
          signatureHelp: await client.signatureHelp(file, position),
        });
      },
    }),
    csharp_inlay_hints: tool({
      description:
        "Preferred tool for C# inlay hints from Roslyn, useful for inferred types and parameter names.",
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
        return json({
          ok: true,
          file,
          range,
          inlayHints: summarizeInlayHints(
            client,
            await client.inlayHints(file, range),
          ),
        });
      },
    }),
    csharp_resolve_inlay_hint: tool({
      description:
        "Preferred tool for resolving a Roslyn inlay hint returned by csharp_inlay_hints.",
      args: { id: tool.schema.string() },
      async execute(args) {
        const cached = getCachedInlayHint(args.id);
        if (!cached) {
          return json({
            ok: false,
            error: `Unknown inlay hint ID: ${args.id}`,
          });
        }

        const hint = await cached.client.resolveInlayHint(cached.hint);
        deleteCachedInlayHint(args.id);
        return json({ ok: true, id: args.id, hint });
      },
    }),
    csharp_completion: tool({
      description:
        "Preferred tool for filtered C# Roslyn completions at a file position. Returns compact agent-friendly completion items.",
      args: {
        file: tool.schema.string(),
        line: tool.schema.number(),
        column: tool.schema.number(),
        maxResults: tool.schema.number().optional(),
        triggerCharacter: tool.schema.string().optional(),
      },
      async execute(args, context) {
        const client = getClient(context);
        const file = resolveWorkspacePath(context, args.file);
        const position = getPosition(args);
        const response = await client.completion(
          file,
          position,
          args.triggerCharacter,
        );
        return json({
          ok: true,
          file,
          position,
          toolPosition: positionToToolPosition(position),
          completion: summarizeCompletion(client, response, args.maxResults),
        });
      },
    }),
    csharp_resolve_completion: tool({
      description:
        "Preferred tool for resolving a Roslyn completion item returned by csharp_completion.",
      args: { id: tool.schema.string() },
      async execute(args) {
        const cached = getCachedCompletionItem(args.id);
        if (!cached) {
          return json({
            ok: false,
            error: `Unknown completion item ID: ${args.id}`,
          });
        }

        const item = await cached.client.resolveCompletionItem(cached.item);
        deleteCachedCompletionItem(args.id);
        return json({ ok: true, id: args.id, item });
      },
    }),
    csharp_call_hierarchy: tool({
      description:
        "Preferred tool for C# call hierarchy. Returns Roslyn incoming and/or outgoing calls for a symbol position.",
      args: {
        file: tool.schema.string(),
        line: tool.schema.number(),
        column: tool.schema.number(),
        direction: tool.schema.string().optional(),
      },
      async execute(args, context) {
        const direction = args.direction ?? "both";
        if (!["incoming", "outgoing", "both"].includes(direction)) {
          return json({
            ok: false,
            error: `Unsupported direction: ${direction}`,
          });
        }

        const client = getClient(context);
        const file = resolveWorkspacePath(context, args.file);
        const position = getPosition(args);
        try {
          const items = await client.prepareCallHierarchy(file, position);
          const calls = await Promise.all(
            items.map(async (item: unknown) => ({
              item: normalizeHierarchyItem(item),
              incoming:
                direction === "incoming" || direction === "both"
                  ? normalizeCallHierarchyCalls(
                      await client.incomingCalls(item),
                    )
                  : undefined,
              outgoing:
                direction === "outgoing" || direction === "both"
                  ? normalizeCallHierarchyCalls(
                      await client.outgoingCalls(item),
                    )
                  : undefined,
            })),
          );
          return json({ ok: true, file, position, calls });
        } catch (error) {
          return json({
            ok: false,
            file,
            position,
            error: getErrorMessage(error),
          });
        }
      },
    }),
    csharp_type_hierarchy: tool({
      description:
        "Preferred tool for C# type hierarchy. Returns Roslyn supertypes and/or subtypes for a type position.",
      args: {
        file: tool.schema.string(),
        line: tool.schema.number(),
        column: tool.schema.number(),
        direction: tool.schema.string().optional(),
      },
      async execute(args, context) {
        const direction = args.direction ?? "both";
        if (!["supertypes", "subtypes", "both"].includes(direction)) {
          return json({
            ok: false,
            error: `Unsupported direction: ${direction}`,
          });
        }

        const client = getClient(context);
        const file = resolveWorkspacePath(context, args.file);
        const position = getPosition(args);
        try {
          const items = await client.prepareTypeHierarchy(file, position);
          const types = await Promise.all(
            items.map(async (item: unknown) => ({
              item: normalizeHierarchyItem(item),
              supertypes:
                direction === "supertypes" || direction === "both"
                  ? (await client.supertypes(item)).map(normalizeHierarchyItem)
                  : undefined,
              subtypes:
                direction === "subtypes" || direction === "both"
                  ? (await client.subtypes(item)).map(normalizeHierarchyItem)
                  : undefined,
            })),
          );
          return json({ ok: true, file, position, types });
        } catch (error) {
          return json({
            ok: false,
            file,
            position,
            error: getErrorMessage(error),
          });
        }
      },
    }),
    csharp_semantic_tokens: tool({
      description:
        "Preferred tool for decoded C# Roslyn semantic tokens over a file or range.",
      args: {
        file: tool.schema.string(),
        startLine: tool.schema.number().optional(),
        startColumn: tool.schema.number().optional(),
        endLine: tool.schema.number().optional(),
        endColumn: tool.schema.number().optional(),
        maxTokens: tool.schema.number().optional(),
      },
      async execute(args, context) {
        const client = getClient(context);
        const file = resolveWorkspacePath(context, args.file);
        const text = await fs.readFile(file, "utf8");
        const range =
          args.startLine === undefined ? undefined : getRange(args, text);
        const response = await client.semanticTokens(file, range);
        return json({
          ok: true,
          file,
          range,
          semanticTokens: decodeSemanticTokens(
            response,
            client.semanticTokensLegend(),
            text,
            args.maxTokens,
          ),
          raw: response,
        });
      },
    }),
    csharp_document_highlights: tool({
      description:
        "Preferred tool for same-document C# symbol highlights from Roslyn at a file position.",
      args: {
        file: tool.schema.string(),
        line: tool.schema.number(),
        column: tool.schema.number(),
      },
      async execute(args, context) {
        const client = getClient(context);
        const file = resolveWorkspacePath(context, args.file);
        const position = getPosition(args);
        const highlights = await client.documentHighlights(file, position);
        return json({
          ok: true,
          file,
          position,
          highlights: highlights.map(normalizeDocumentHighlight),
        });
      },
    }),
    csharp_selection_ranges: tool({
      description:
        "Preferred tool for Roslyn semantic selection range expansion at a C# file position.",
      args: {
        file: tool.schema.string(),
        line: tool.schema.number(),
        column: tool.schema.number(),
      },
      async execute(args, context) {
        const client = getClient(context);
        const file = resolveWorkspacePath(context, args.file);
        const position = getPosition(args);
        try {
          const ranges = await client.selectionRanges(file, [position]);
          return json({
            ok: true,
            file,
            position,
            selectionRanges: ranges.map(normalizeSelectionRange),
          });
        } catch (error) {
          return json({
            ok: false,
            file,
            position,
            error: getErrorMessage(error),
          });
        }
      },
    }),
    csharp_workspace_diagnostics: tool({
      description:
        "Preferred tool for Roslyn workspace diagnostics when supported by the server. Returns the raw Roslyn response or error.",
      args: {},
      async execute(_args, context) {
        const client = getClient(context);
        try {
          return json({
            ok: true,
            diagnostics: await client.workspaceDiagnostics(),
          });
        } catch (error) {
          return json({ ok: false, error: getErrorMessage(error) });
        }
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

function summarizeCompletion(
  client: RoslynLspClient,
  response: unknown,
  maxResults: number | undefined,
) {
  const items = getCompletionItems(response);
  const limit = Math.max(1, Math.min(Math.floor(maxResults ?? 50), 200));
  return {
    isIncomplete: isRecord(response) ? response.isIncomplete : undefined,
    total: items.length,
    items: items.slice(0, limit).map((item) =>
      isRecord(item)
        ? {
            id: cacheCompletionItem(client, item),
            label: item.label,
            kind: item.kind,
            detail: item.detail,
            sortText: item.sortText,
            filterText: item.filterText,
            insertText: item.insertText,
            textEdit: item.textEdit,
          }
        : item,
    ),
  };
}

function summarizeInlayHints(client: RoslynLspClient, response: unknown) {
  if (!Array.isArray(response)) {
    return response;
  }

  return response.map((hint) =>
    isRecord(hint)
      ? {
          id: cacheInlayHint(client, hint),
          position: hint.position,
          label: hint.label,
          kind: hint.kind,
          textEdits: hint.textEdits,
          tooltip: hint.tooltip,
          paddingLeft: hint.paddingLeft,
          paddingRight: hint.paddingRight,
          data: hint.data,
        }
      : hint,
  );
}

function normalizeHierarchyItem(item: unknown) {
  if (!isRecord(item)) {
    return item;
  }

  return {
    ...item,
    file: typeof item.uri === "string" ? uriToFile(item.uri) : undefined,
    position: rangeStartToToolPosition(item.selectionRange ?? item.range),
  };
}

function normalizeCallHierarchyCalls(calls: unknown[]) {
  return calls.map((call) => {
    if (!isRecord(call)) {
      return call;
    }

    return {
      ...call,
      from: normalizeHierarchyItem(call.from),
      to: normalizeHierarchyItem(call.to),
      fromRanges: call.fromRanges,
    };
  });
}

function normalizeDocumentHighlight(highlight: unknown) {
  if (!isRecord(highlight)) {
    return highlight;
  }

  return {
    ...highlight,
    position: rangeStartToToolPosition(highlight.range),
  };
}

function normalizeSelectionRange(selectionRange: unknown) {
  const ranges = [];
  let current = selectionRange;
  while (isRecord(current)) {
    ranges.push({
      range: current.range,
      position: rangeStartToToolPosition(current.range),
    });
    current = current.parent;
  }

  return ranges;
}

function decodeSemanticTokens(
  response: unknown,
  legend: unknown,
  text: string,
  maxTokens: number | undefined,
) {
  const data =
    isRecord(response) && Array.isArray(response.data) ? response.data : [];
  const tokenTypes =
    isRecord(legend) && Array.isArray(legend.tokenTypes)
      ? legend.tokenTypes
      : [];
  const tokenModifiers =
    isRecord(legend) && Array.isArray(legend.tokenModifiers)
      ? legend.tokenModifiers
      : [];
  const lines = text.split(/\r?\n/);
  const limit = Math.max(1, Math.min(Math.floor(maxTokens ?? 200), 1000));
  const tokens = [];
  let line = 0;
  let character = 0;

  for (
    let index = 0;
    index + 4 < data.length && tokens.length < limit;
    index += 5
  ) {
    const deltaLine = numberAt(data, index);
    const deltaStart = numberAt(data, index + 1);
    const length = numberAt(data, index + 2);
    const tokenType = numberAt(data, index + 3);
    const modifierBits = numberAt(data, index + 4);

    line += deltaLine;
    character = deltaLine === 0 ? character + deltaStart : deltaStart;
    const tokenText = lines[line]?.slice(character, character + length) ?? "";

    tokens.push({
      range: {
        start: { line, character },
        end: { line, character: character + length },
      },
      position: positionToToolPosition({ line, character }),
      text: tokenText,
      type: tokenTypes[tokenType] ?? tokenType,
      modifiers: tokenModifiers.filter(
        (_modifier, bit) => (modifierBits & (1 << bit)) !== 0,
      ),
    });
  }

  return { total: Math.floor(data.length / 5), tokens };
}

function numberAt(values: unknown[], index: number) {
  const value = values[index];
  return typeof value === "number" ? value : 0;
}

function getCompletionItems(response: unknown): unknown[] {
  if (Array.isArray(response)) {
    return response;
  }
  if (isRecord(response) && Array.isArray(response.items)) {
    return response.items;
  }

  return [];
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

function isOrganizeImportsAction(
  action: CodeActionOrCommand,
): action is CodeActionOrCommand {
  if (!isCodeAction(action)) {
    return false;
  }

  if (action.kind === "source.organizeImports") {
    return true;
  }

  if (!isRecord(action.data)) {
    return false;
  }

  const customTags = action.data.CustomTags;
  return (
    (Array.isArray(customTags) && customTags.includes("OrganizeImports")) ||
    action.title === "Sort Usings" ||
    action.title === "Remove unnecessary usings"
  );
}
