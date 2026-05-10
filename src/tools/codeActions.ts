import type { CodeAction, CodeActionOrCommand } from "../csharp/types.js";

export function summarizeCodeAction(id: string, action: CodeActionOrCommand) {
  if (isCodeAction(action)) {
    return {
      id,
      title: action.title,
      kind: action.kind,
      hasEdit: action.edit !== undefined,
      needsResolve: action.edit === undefined && action.data !== undefined,
      hasCommand: action.command !== undefined,
      diagnostics:
        action.diagnostics?.map((diagnostic) => ({
          source: diagnostic.source,
          code: diagnostic.code,
          severity: diagnostic.severity,
          message: diagnostic.message,
          range: diagnostic.range,
        })) ?? [],
    };
  }

  return {
    id,
    title: action.title,
    command: action.command,
    hasEdit: false,
    hasCommand: true,
    diagnostics: [],
  };
}

export function findMatchingCodeAction(
  actions: CodeActionOrCommand[],
  target: CodeAction,
) {
  return actions.find(
    (action): action is CodeAction =>
      isCodeAction(action) &&
      action.title === target.title &&
      action.kind === target.kind,
  );
}

export function findCodeActionById(actions: CodeActionOrCommand[], id: string) {
  const index = Number(id);
  if (!Number.isInteger(index) || index < 0) {
    return undefined;
  }

  return flattenCodeActions(actions)[index];
}

export function flattenCodeActions(
  actions: CodeActionOrCommand[],
): CodeActionOrCommand[] {
  return actions.flatMap((action) => {
    const children = (action as Record<string, unknown>).children;
    return [
      action,
      ...(Array.isArray(children)
        ? flattenCodeActions(children as CodeActionOrCommand[])
        : []),
    ];
  });
}

export function isCodeAction(
  action: CodeActionOrCommand,
): action is CodeAction {
  return !(
    "command" in action &&
    typeof action.command === "string" &&
    !("kind" in action) &&
    !("edit" in action)
  );
}

export async function summarizeResolvedActions(
  client: { resolveCodeAction(action: CodeAction): Promise<CodeAction> },
  actions: CodeActionOrCommand[],
) {
  return await Promise.all(
    flattenCodeActions(actions).map((action, index) =>
      summarizeAction(client, String(index), action),
    ),
  );
}

async function summarizeAction(
  client: { resolveCodeAction(action: CodeAction): Promise<CodeAction> },
  id: string,
  action: CodeActionOrCommand,
) {
  if (!isCodeAction(action)) {
    return {
      id,
      title: action.title,
      command: action.command,
      arguments: action.arguments,
    };
  }

  const resolved = await resolveActionIfPossible(client, action);
  return {
    id,
    title: resolved.title,
    kind: resolved.kind,
    diagnostics: resolved.diagnostics,
    edit: resolved.edit,
    command: resolved.command,
    data: resolved.data,
    resolveError:
      "resolveError" in resolved ? resolved.resolveError : undefined,
  };
}

async function resolveActionIfPossible(
  client: { resolveCodeAction(action: CodeAction): Promise<CodeAction> },
  action: CodeAction,
) {
  try {
    return await client.resolveCodeAction(action);
  } catch (error) {
    return {
      ...action,
      resolveError: error instanceof Error ? error.message : String(error),
    };
  }
}
