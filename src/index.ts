import { tool } from "@opencode-ai/plugin";
import type { Plugin } from "@opencode-ai/plugin";

export const CSharpLspPlugin: Plugin = async () => ({
  tool: {
    csharp_symbol_context: tool({
      description: "Return basic C# symbol context for a file location.",
      args: {
        file: tool.schema.string(),
        line: tool.schema.number(),
        column: tool.schema.number()
      },
      async execute(args) {
        return JSON.stringify({
          ok: true,
          ...args
        });
      }
    })
  }
});

export default CSharpLspPlugin;