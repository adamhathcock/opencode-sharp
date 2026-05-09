import path from "node:path";
import { pathToFileURL } from "node:url";
import type { JsonRpcMessage } from "../lsp/types";
import { isRecord } from "../shared/json";
import { getConfigurationValue } from "./configuration";

export function handleServerRequest(root: string, message: JsonRpcMessage) {
  if (message.method === "workspace/configuration") {
    const items =
      isRecord(message.params) && Array.isArray(message.params.items)
        ? message.params.items
        : [];
    return items.map((item) => getConfigurationValue(item));
  }

  if (message.method === "workspace/applyEdit") {
    return {
      applied: false,
      failureReason:
        "Client-side workspace/applyEdit is not supported by opencode-sharp yet.",
    };
  }

  if (message.method === "workspace/workspaceFolders") {
    return [{ uri: pathToFileURL(root).toString(), name: path.basename(root) }];
  }

  return null;
}
