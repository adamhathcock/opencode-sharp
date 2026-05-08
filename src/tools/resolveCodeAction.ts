import type { CodeActionOrCommand } from "../csharp/types";
import type { getCachedAction } from "../state";
import { findMatchingCodeAction } from "./codeActions";

type CachedAction = NonNullable<ReturnType<typeof getCachedAction>>;

export async function resolveCachedCodeAction(cached: CachedAction) {
  try {
    return await cached.client.resolveCodeAction(cached.action);
  } catch (error) {
    const refreshedActions = await cached.client.codeActions(cached.file, cached.range) as CodeActionOrCommand[];
    const refreshedAction = findMatchingCodeAction(refreshedActions, cached.action);
    if (!refreshedAction) {
      throw new Error(`Cached code action is stale and no matching action was returned by Roslyn: ${getErrorMessage(error)}`);
    }

    return await cached.client.resolveCodeAction(refreshedAction);
  }
}

export function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
