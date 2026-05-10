import path from "node:path";
import { pathToFileURL } from "node:url";
import type { WorkspaceEdit } from "../csharp/types.js";
import type { JsonRpcMessage } from "../lsp/types.js";
import { isRecord } from "../shared/json.js";
import { applyWorkspaceEdit } from "../tools/workspaceEdit.js";
import { getConfigurationValue } from "./configuration.js";

export async function handleServerRequest(
  root: string,
  message: JsonRpcMessage,
) {
  if (message.method === "workspace/configuration") {
    const items =
      isRecord(message.params) && Array.isArray(message.params.items)
        ? message.params.items
        : [];
    return items.map((item) => getConfigurationValue(item));
  }

  if (message.method === "workspace/applyEdit") {
    if (!isRecord(message.params) || !isRecord(message.params.edit)) {
      return {
        applied: false,
        failureReason: "workspace/applyEdit request did not include an edit.",
      };
    }

    try {
      await applyWorkspaceEdit(message.params.edit as WorkspaceEdit);
      return { applied: true };
    } catch (error) {
      return {
        applied: false,
        failureReason: error instanceof Error ? error.message : String(error),
      };
    }
  }

  if (message.method === "workspace/diagnostic/refresh") {
    return null;
  }

  if (message.method === "workspace/workspaceFolders") {
    return [{ uri: pathToFileURL(root).toString(), name: path.basename(root) }];
  }

  return null;
}
