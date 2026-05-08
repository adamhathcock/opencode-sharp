import { UsageTracker } from "./tracker";

const toolUsage = new UsageTracker();
const lspUsage = new UsageTracker();

export function recordToolUsage(name: string) {
  toolUsage.record(name);
}

export function recordLspUsage(method: string) {
  lspUsage.record(method);
}

export function getUsageStatus() {
  return {
    tools: toolUsage.status(),
    lspMethods: lspUsage.status()
  };
}

export function clearUsage() {
  toolUsage.clear();
  lspUsage.clear();
}
