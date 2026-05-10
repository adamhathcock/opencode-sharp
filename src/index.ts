import type { Plugin } from "@opencode-ai/plugin";
import { csharpTools } from "./tools/registry";
import { shutdownClientForRoot } from "./state";

export const CSharpLspPlugin: Plugin = async () => ({
  async event({ event }) {
    if (event.type === "server.instance.disposed") {
      await shutdownClientForRoot(event.properties.directory);
    }
  },
  tool: csharpTools,
});

export default CSharpLspPlugin;
