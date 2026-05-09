import type { CodeAction, CodeActionOrCommand } from "../csharp/types";

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
