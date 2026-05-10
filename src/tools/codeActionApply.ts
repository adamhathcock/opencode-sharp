import type {
  CodeAction,
  CodeActionOrCommand,
  WorkspaceEdit,
} from "../csharp/types";
import type { RoslynLspClient } from "../roslyn/client";
import { flattenCodeActions, isCodeAction } from "./codeActions";
import { applyWorkspaceEdit } from "./workspaceEdit";

export type ActionCandidate = {
  action: CodeAction;
  title: string;
  kind?: string;
};

export type AppliedCodeAction = {
  title: string;
  kind?: string;
  applied: Awaited<ReturnType<typeof applyWorkspaceEdit>>;
};

export type SkippedCodeAction = {
  title?: string;
  kind?: string;
  reason: string;
};

export async function resolveEditableCandidates(
  client: RoslynLspClient,
  actions: CodeActionOrCommand[],
  matches: (action: CodeAction) => boolean,
) {
  const candidates: ActionCandidate[] = [];
  const skipped: SkippedCodeAction[] = [];

  for (const action of flattenCodeActions(actions)) {
    if (!isCodeAction(action)) {
      skipped.push({ title: action.title, reason: "command-only action" });
      continue;
    }

    if (!matches(action)) {
      continue;
    }

    let resolved: CodeAction;
    try {
      resolved = await client.resolveCodeAction(action);
    } catch (error) {
      skipped.push({
        title: action.title,
        kind: action.kind,
        reason: `resolve failed: ${error instanceof Error ? error.message : String(error)}`,
      });
      continue;
    }

    if (!resolved.edit) {
      skipped.push({
        title: resolved.title,
        kind: resolved.kind,
        reason: "resolved action has no workspace edit",
      });
      continue;
    }

    const unsafeReason = getUnsafeEditReason(resolved.edit);
    if (unsafeReason) {
      skipped.push({
        title: resolved.title,
        kind: resolved.kind,
        reason: unsafeReason,
      });
      continue;
    }

    candidates.push({
      action: resolved,
      title: resolved.title,
      kind: resolved.kind,
    });
  }

  return { candidates, skipped };
}

export async function applyFirstCandidate(candidates: ActionCandidate[]) {
  const candidate = candidates[0];
  if (!candidate?.action.edit) {
    return undefined;
  }

  return {
    title: candidate.title,
    kind: candidate.kind,
    applied: await applyWorkspaceEdit(candidate.action.edit),
  } satisfies AppliedCodeAction;
}

export function isOrganizeImportsAction(action: CodeAction) {
  return (
    action.kind === "source.organizeImports" ||
    /\b(sort|organize)\b.*\b(usings|imports)\b/i.test(action.title) ||
    /\b(usings|imports)\b.*\b(sort|organize)\b/i.test(action.title)
  );
}

export function isAddMissingUsingAction(action: CodeAction) {
  return (
    /\b(add|using)\b.*\busing\b/i.test(action.title) ||
    /^using\s+[A-Za-z_][\w.]*;?$/.test(action.title.trim())
  );
}

export function getDiagnosticCode(diagnostic: { code?: string | number }) {
  return diagnostic.code === undefined ? undefined : String(diagnostic.code);
}

function getUnsafeEditReason(edit: WorkspaceEdit) {
  const resourceOperation = edit.documentChanges?.find(
    (change) => !("textDocument" in change),
  );
  if (resourceOperation) {
    return "workspace edit contains resource operations";
  }

  return undefined;
}
