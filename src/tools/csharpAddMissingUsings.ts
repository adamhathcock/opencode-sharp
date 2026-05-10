import { tool } from "@opencode-ai/plugin";
import type { CodeActionOrCommand, Diagnostic } from "../csharp/types.js";
import { getClient } from "../state.js";
import { json } from "../shared/json.js";
import {
  applyFirstCandidate,
  getDiagnosticCode,
  isAddMissingUsingAction,
  resolveEditableCandidates,
  type AppliedCodeAction,
  type SkippedCodeAction,
} from "./codeActionApply.js";
import { resolveWorkspacePath } from "./paths.js";

export const csharpAddMissingUsingsTool: any = tool({
  description:
    "Add missing C# using directives for a file by applying safe Roslyn quick fixes for unresolved type diagnostics.",
  args: {
    file: tool.schema.string(),
    maxPasses: tool.schema.number().optional(),
  },
  async execute(args, context) {
    const client = getClient(context);
    const file = resolveWorkspacePath(context, args.file);
    const maxPasses = clampPasses(args.maxPasses);
    const applied: AppliedCodeAction[] = [];
    const skipped: SkippedCodeAction[] = [];

    for (let pass = 1; pass <= maxPasses; pass += 1) {
      const diagnostics = getMissingUsingDiagnostics(
        (await client.diagnostics(file)).diagnostics,
      );
      let changed = false;

      for (const diagnostic of diagnostics) {
        const actions = (await client.codeActions(file, diagnostic.range, {
          diagnostics: [diagnostic],
        })) as CodeActionOrCommand[];
        const result = await resolveEditableCandidates(
          client,
          actions,
          isAddMissingUsingAction,
        );
        skipped.push(...result.skipped);

        const action = await applyFirstCandidate(result.candidates);
        if (action) {
          applied.push(action);
          changed = true;
          break;
        }
      }

      if (!changed) {
        break;
      }
    }

    const remainingDiagnostics = getMissingUsingDiagnostics(
      (await client.diagnostics(file)).diagnostics,
    );
    return json({
      ok: true,
      file,
      maxPasses,
      applied,
      skipped,
      remainingDiagnostics,
    });
  },
});

export function getMissingUsingDiagnostics(diagnostics: Diagnostic[]) {
  const seen = new Set<string>();
  return diagnostics.filter((diagnostic) => {
    const code = getDiagnosticCode(diagnostic);
    if (code !== "CS0246") {
      return false;
    }

    const key = JSON.stringify({
      code,
      message: diagnostic.message,
      range: diagnostic.range,
    });
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function clampPasses(value: number | undefined) {
  if (value === undefined || !Number.isFinite(value)) {
    return 5;
  }

  return Math.min(Math.max(Math.floor(value), 1), 20);
}
