import { tool } from "@opencode-ai/plugin";
import { getClient } from "../state";
import { json } from "../shared/json";

export const csharpWorkspaceDiagnosticsTool: any = tool({
  description:
    "Return solution-wide Roslyn diagnostics grouped by file, preserving raw workspace diagnostic reports.",
  args: {},
  async execute(_args, context) {
    const client = getClient(context);
    return json({
      ok: true,
      diagnostics: await client.workspaceDiagnostics(),
    });
  },
});
