import { tool } from "@opencode-ai/plugin";
import type { Plugin } from "@opencode-ai/plugin";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { CodeActionOrCommand } from "./csharp/types";
import type { SymbolLocationKind } from "./roslyn/client";
import { isCodeAction, summarizeCodeAction } from "./tools/codeActions";
import { isCSharpFile, resolveRootPath } from "./tools/csharpFiles";
import { normalizeLocations } from "./tools/locations";
import { resolveWorkspacePath } from "./tools/paths";
import { getPosition } from "./tools/position";
import { getRange } from "./tools/range";
import { getErrorMessage, resolveCachedCodeAction } from "./tools/resolveCodeAction";
import { applyWorkspaceEdit } from "./tools/workspaceEdit";
import { cacheAction, deleteCachedAction, getCachedAction, getClient, getClientCount, getClientForRoot, getStatus, shutdownAllClients } from "./state";
import { json } from "./shared/json";
import { writeStatusSnapshot } from "./status/snapshot";
import { recordToolUsage } from "./usage";

export const CSharpLspPlugin: Plugin = async (pluginContext) => ({
  event: async ({ event }) => {
    if (event.type === "server.instance.disposed") {
      await shutdownAllClients();
      return;
    }

    const root = pluginContext.worktree || pluginContext.directory;
    if (event.type === "file.edited") {
      await preloadCSharpFile(root, event.properties.file);
    }
    if (event.type === "file.watcher.updated" && event.properties.event !== "unlink") {
      await preloadCSharpFile(root, event.properties.file);
    }
    if (event.type === "message.part.updated") {
      await preloadCSharpFile(root, getCSharpPathFromPart(event.properties.part));
    }
  },
  "chat.message": async () => {
    await refreshStatusSnapshot(pluginContext.worktree || pluginContext.directory);
  },
  "tool.execute.after": async (input) => {
    if (input.tool === "read") {
      await preloadCSharpFile(pluginContext.worktree || pluginContext.directory, getStringProperty(input.args, "filePath"));
    }
  },
  "experimental.chat.system.transform": async (_input, output) => {
    output.system.push(csharpToolPreferencePrompt);
  },
  "tool.definition": async (input, output) => {
    if (shouldGuideToolDefinition(input.toolID)) {
      output.description = `${output.description}\n\nFor C#/.cs semantic work, prefer the opencode-sharp Roslyn tools: csharp_diagnostics, csharp_symbol_locations, csharp_references, csharp_workspace_symbols, csharp_code_actions, and csharp_apply_code_action.`;
    }
  },
  tool: {
    csharp_lsp_status: tool({
      description: "Return status for the opencode-sharp Roslyn language server sidecar.",
      args: {},
      async execute(_args, context) {
        recordToolUsage("csharp_lsp_status");
        const status = getStatus(getClient(context));
        await writeStatusSnapshot(status.root, status);
        return json({ ok: true, ...status });
      }
    }),
    csharp_lsp_shutdown: tool({
      description: "Shut down opencode-sharp Roslyn language server sidecars.",
      args: {},
      async execute() {
        recordToolUsage("csharp_lsp_shutdown");
        const count = getClientCount();
        await shutdownAllClients();
        return json({ ok: true, shutDown: count });
      }
    }),
    csharp_diagnostics: tool({
      description: "Preferred tool for .cs diagnostics. Pull Roslyn diagnostics for a C# file using the opencode-sharp sidecar instead of generic LSP diagnostics.",
      args: { file: tool.schema.string() },
      async execute(args, context) {
        recordToolUsage("csharp_diagnostics");
        const client = getClient(context);
        const file = resolveWorkspacePath(context, args.file);
        return json({ ok: true, file, diagnostics: await client.diagnostics(file) });
      }
    }),
    csharp_workspace_symbols: tool({
      description: "Preferred tool for C# workspace symbols. Search Roslyn workspace symbols across loaded C# solutions/projects instead of generic workspace symbol tools.",
      args: { query: tool.schema.string() },
      async execute(args, context) {
        recordToolUsage("csharp_workspace_symbols");
        const client = getClient(context);
        return json({ ok: true, query: args.query, symbols: await client.workspaceSymbols(args.query) });
      }
    }),
    csharp_symbol_locations: tool({
      description: "Preferred tool for .cs definitions, declarations, and type definitions. Use Roslyn symbol locations instead of generic LSP location tools.",
      args: {
        file: tool.schema.string(),
        line: tool.schema.number(),
        column: tool.schema.number(),
        kind: tool.schema.string().optional()
      },
      async execute(args, context) {
        recordToolUsage("csharp_symbol_locations");
        const requestedKind = args.kind ?? "definition";
        if (!isSymbolLocationKind(requestedKind) && requestedKind !== "all") {
          return json({ ok: false, error: `Unsupported symbol location kind: ${requestedKind}` });
        }

        const client = getClient(context);
        const file = resolveWorkspacePath(context, args.file);
        const position = getPosition(args);
        const kinds = requestedKind === "all" ? symbolLocationKinds : [requestedKind];
        const results = await Promise.all(kinds.map(async (kind) => ({
          kind,
          locations: normalizeLocations(await client.symbolLocations(file, position, kind))
        })));

        return json({ ok: true, file, position, results });
      }
    }),
    csharp_references: tool({
      description: "Preferred tool for .cs references. Find Roslyn references for a C# symbol position instead of generic LSP reference tools.",
      args: {
        file: tool.schema.string(),
        line: tool.schema.number(),
        column: tool.schema.number(),
        includeDeclaration: tool.schema.boolean().optional()
      },
      async execute(args, context) {
        recordToolUsage("csharp_references");
        const client = getClient(context);
        const file = resolveWorkspacePath(context, args.file);
        const position = getPosition(args);
        const includeDeclaration = args.includeDeclaration ?? true;
        const references = normalizeLocations(await client.references(file, position, includeDeclaration));
        return json({ ok: true, file, position, includeDeclaration, references });
      }
    }),
    csharp_code_actions: tool({
      description: "Preferred tool for .cs fixes/refactorings. List Roslyn code actions for a C# file range and return IDs that can be applied instead of generic code-action tools.",
      args: {
        file: tool.schema.string(),
        startLine: tool.schema.number().optional(),
        startColumn: tool.schema.number().optional(),
        endLine: tool.schema.number().optional(),
        endColumn: tool.schema.number().optional()
      },
      async execute(args, context) {
        recordToolUsage("csharp_code_actions");
        const client = getClient(context);
        const file = resolveWorkspacePath(context, args.file);
        const range = getRange(args, await fs.readFile(file, "utf8"));
        const actions = await client.codeActions(file, range);
        const summaries = actions.map((action) => summarizeCodeAction(cacheAction(client, action as CodeActionOrCommand, file, range), action as CodeActionOrCommand));

        return json({ ok: true, file, range, actions: summaries });
      }
    }),
    csharp_apply_code_action: tool({
      description: "Preferred tool for applying .cs fixes/refactorings. Apply a Roslyn code action returned by csharp_code_actions when it contains a workspace edit.",
      args: { id: tool.schema.string() },
      async execute(args) {
        recordToolUsage("csharp_apply_code_action");
        const cached = getCachedAction(args.id);
        if (!cached) {
          return json({ ok: false, error: `Unknown code action ID: ${args.id}` });
        }
        if (!isCodeAction(cached.action)) {
          return json({ ok: false, error: "Command-only code actions are not supported yet.", action: cached.action });
        }
        let action;
        try {
          action = await resolveCachedCodeAction(cached);
        } catch (error) {
          deleteCachedAction(args.id);
          return json({ ok: false, error: getErrorMessage(error), action: summarizeCodeAction(args.id, cached.action) });
        }

        if (!action.edit) {
          return json({ ok: false, error: "Code action did not include a workspace edit.", action: summarizeCodeAction(args.id, action) });
        }
        const applied = await applyWorkspaceEdit(action.edit);
        deleteCachedAction(args.id);
        return json({ ok: true, title: action.title, applied });
      }
    })
  }
});

export default CSharpLspPlugin;

async function refreshStatusSnapshot(root: string) {
  const resolved = path.resolve(root);
  const status = getStatus(getClientForRoot(resolved));
  await writeStatusSnapshot(resolved, status);
}

async function preloadCSharpFile(root: string, file: string | undefined) {
  if (!isCSharpFile(file)) {
    return;
  }

  const resolvedRoot = path.resolve(root);
  const resolvedFile = resolveRootPath(resolvedRoot, file);
  const client = getClientForRoot(resolvedRoot);
  recordToolUsage("csharp_preload_document");
  await client.preloadDocument(resolvedFile);
  await writeStatusSnapshot(resolvedRoot, getStatus(client));
}

function getCSharpPathFromPart(part: unknown) {
  if (!isRecord(part)) {
    return undefined;
  }

  const source = part.source;
  if (isRecord(source)) {
    const sourcePath = getStringProperty(source, "path");
    if (isCSharpFile(sourcePath)) {
      return sourcePath;
    }
  }

  return getStringProperty(part, "filename");
}

function getStringProperty(value: unknown, key: string) {
  if (!isRecord(value)) {
    return undefined;
  }

  const property = value[key];
  return typeof property === "string" ? property : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function shouldGuideToolDefinition(toolID: string) {
  const normalized = toolID.toLowerCase();
  if (normalized.startsWith("csharp_")) {
    return false;
  }

  return normalized.includes("lsp")
    || normalized.includes("diagnostic")
    || normalized.includes("symbol")
    || normalized.includes("reference")
    || normalized.includes("codeaction")
    || normalized.includes("code_action")
    || normalized.includes("code-action");
}

const csharpToolPreferencePrompt = `For C#/.cs semantic operations, prefer opencode-sharp Roslyn tools over built-in or generic LSP tools.
Use csharp_diagnostics for .cs diagnostics.
Use csharp_symbol_locations for definitions, declarations, and type definitions in .cs files.
Use csharp_references for references in .cs files.
Use csharp_workspace_symbols for C# workspace symbol searches.
Use csharp_code_actions followed by csharp_apply_code_action for C# fixes and refactorings.
Use generic tools only when the C# Roslyn tool does not cover the operation.`;

const symbolLocationKinds: SymbolLocationKind[] = ["definition", "declaration", "typeDefinition"];

function isSymbolLocationKind(kind: string): kind is SymbolLocationKind {
  return symbolLocationKinds.includes(kind as SymbolLocationKind);
}
