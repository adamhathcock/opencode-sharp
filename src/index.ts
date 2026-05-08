import { tool } from "@opencode-ai/plugin";
import type { Plugin } from "@opencode-ai/plugin";
import { promises as fs } from "node:fs";
import type { CodeActionOrCommand } from "./csharp/types";
import { isCodeAction, summarizeCodeAction } from "./tools/codeActions";
import { resolveWorkspacePath } from "./tools/paths";
import { getRange } from "./tools/range";
import { applyWorkspaceEdit } from "./tools/workspaceEdit";
import { cacheAction, deleteCachedAction, getCachedAction, getClient, getClientCount, shutdownAllClients } from "./state";
import { json } from "./shared/json";

export const CSharpLspPlugin: Plugin = async () => ({
  event: async ({ event }) => {
    if (event.type === "server.instance.disposed") {
      await shutdownAllClients();
    }
  },
  tool: {
    csharp_lsp_status: tool({
      description: "Return status for the opencode-sharp Roslyn language server sidecar.",
      args: {},
      async execute(_args, context) {
        return json({ ok: true, ...getClient(context).status() });
      }
    }),

    csharp_lsp_shutdown: tool({
      description: "Shut down opencode-sharp Roslyn language server sidecars.",
      args: {},
      async execute() {
        const count = getClientCount();
        await shutdownAllClients();
        return json({ ok: true, shutDown: count });
      }
    }),

    csharp_diagnostics: tool({
      description: "Pull Roslyn diagnostics for a C# file using the sidecar language server.",
      args: { file: tool.schema.string() },
      async execute(args, context) {
        const client = getClient(context);
        const file = resolveWorkspacePath(context, args.file);
        return json({ ok: true, file, diagnostics: await client.diagnostics(file) });
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
        const client = getClient(context);
        const file = resolveWorkspacePath(context, args.file);
        const range = getRange(args, await fs.readFile(file, "utf8"));
        const actions = await client.codeActions(file, range);
        const summaries = actions.map((action) => summarizeCodeAction(cacheAction(client, action as CodeActionOrCommand), action as CodeActionOrCommand));

        return json({ ok: true, file, range, actions: summaries });
      }
    }),

    csharp_apply_code_action: tool({
      description: "Apply a Roslyn code action returned by csharp_code_actions when it contains a workspace edit.",
      args: { id: tool.schema.string() },
      async execute(args) {
        const cached = getCachedAction(args.id);
        if (!cached) {
          return json({ ok: false, error: `Unknown code action ID: ${args.id}` });
        }

        if (!isCodeAction(cached.action)) {
          return json({ ok: false, error: "Command-only code actions are not supported yet.", action: cached.action });
        }

        const action = await cached.client.resolveCodeAction(cached.action);
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
