import { tool } from "@opencode-ai/plugin";
import type { Plugin } from "@opencode-ai/plugin";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { CodeActionOrCommand } from "./csharp/types";
import { isCodeAction, summarizeCodeAction } from "./tools/codeActions";
import { resolveWorkspacePath } from "./tools/paths";
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
