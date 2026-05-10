import { tool } from "@opencode-ai/plugin";
import { getClient } from "../state.js";
import { json } from "../shared/json.js";
import { resolveWorkspacePath } from "./paths.js";

export const csharpDiagnosticsTool: any = tool({
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
});
