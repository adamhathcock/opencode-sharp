import { tool } from "@opencode-ai/plugin";
import type { Plugin } from "@opencode-ai/plugin";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { CodeActionOrCommand } from "./csharp/types";
import type { SymbolLocationKind } from "./roslyn/client";
import { isCodeAction, summarizeCodeAction } from "./tools/codeActions";
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
    }
  },
  "chat.message": async () => {
    await refreshStatusSnapshot(pluginContext.worktree || pluginContext.directory);
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
      description: "Pull Roslyn diagnostics for a C# file using the sidecar language server.",
      args: { file: tool.schema.string() },
      async execute(args, context) {
        recordToolUsage("csharp_diagnostics");
        const client = getClient(context);
        const file = resolveWorkspacePath(context, args.file);
        return json({ ok: true, file, diagnostics: await client.diagnostics(file) });
      }
    }),
    csharp_workspace_symbols: tool({
      description: "Search Roslyn workspace symbols across the loaded C# solution/projects.",
      args: { query: tool.schema.string() },
      async execute(args, context) {
        recordToolUsage("csharp_workspace_symbols");
        const client = getClient(context);
        return json({ ok: true, query: args.query, symbols: await client.workspaceSymbols(args.query) });
      }
    }),
    csharp_symbol_locations: tool({
      description: "Find Roslyn definition, declaration, or type-definition locations for a C# symbol position.",
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
      description: "Find Roslyn references for a C# symbol position.",
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
      description: "List Roslyn code actions for a C# file range and return IDs that can be applied.",
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
      description: "Apply a Roslyn code action returned by csharp_code_actions when it contains a workspace edit.",
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

const symbolLocationKinds: SymbolLocationKind[] = ["definition", "declaration", "typeDefinition"];

function isSymbolLocationKind(kind: string): kind is SymbolLocationKind {
  return symbolLocationKinds.includes(kind as SymbolLocationKind);
}
