import { tool } from "@opencode-ai/plugin";
import { promises as fs } from "node:fs";
import path from "node:path";
import type {
  CodeAction,
  CodeActionOrCommand,
  Diagnostic,
} from "../csharp/types.js";
import { getClient } from "../state.js";
import { json } from "../shared/json.js";
import {
  applyFirstCandidate,
  getDiagnosticCode,
  isAddMissingUsingAction,
  isOrganizeImportsAction,
  resolveEditableCandidates,
  type AppliedCodeAction,
  type SkippedCodeAction,
} from "./codeActionApply.js";
import { resolveWorkspacePath } from "./paths.js";

export const csharpFixAllDiagnosticsTool: any = tool({
  description:
    "Collect C# diagnostics for a file or project, find matching Roslyn code actions, and apply conservative safe fixes.",
  args: {
    file: tool.schema.string().optional(),
    project: tool.schema.string().optional(),
    maxPasses: tool.schema.number().optional(),
    includeWarnings: tool.schema.boolean().optional(),
    diagnosticCodes: tool.schema.array(tool.schema.string()).optional(),
    apply: tool.schema.boolean().optional(),
  },
  async execute(args, context) {
    const client = getClient(context);
    const root = context.worktree || context.directory;
    const files = args.file
      ? [resolveWorkspacePath(context, args.file)]
      : await getProjectFiles(root, args.project);
    const maxPasses = clampPasses(args.maxPasses);
    const apply = args.apply ?? true;
    const includeWarnings = args.includeWarnings ?? false;
    const diagnosticCodes = new Set(args.diagnosticCodes ?? []);
    const applied: Array<{ file: string } & AppliedCodeAction> = [];
    const skipped: Array<
      { file: string; diagnostic?: Diagnostic } & SkippedCodeAction
    > = [];
    const diagnosticsConsidered: Array<{
      file: string;
      diagnostic: Diagnostic;
    }> = [];

    for (let pass = 1; pass <= maxPasses; pass += 1) {
      let changed = false;

      for (const file of files) {
        const diagnostics = filterDiagnostics(
          (await client.diagnostics(file)).diagnostics,
          includeWarnings,
          diagnosticCodes,
        );

        for (const diagnostic of diagnostics) {
          diagnosticsConsidered.push({ file, diagnostic });
          const actions = (await client.codeActions(file, diagnostic.range, {
            diagnostics: [diagnostic],
          })) as CodeActionOrCommand[];
          const result = await resolveEditableCandidates(
            client,
            actions,
            isSafeDiagnosticFix,
          );
          skipped.push(
            ...result.skipped.map((item) => ({ file, diagnostic, ...item })),
          );

          if (!apply) {
            continue;
          }

          const action = await applyFirstCandidate(result.candidates);
          if (action) {
            applied.push({ file, ...action });
            changed = true;
            break;
          }
        }

        if (changed) {
          break;
        }
      }

      if (!apply || !changed) {
        break;
      }
    }

    const remainingDiagnostics = await collectRemainingDiagnostics(
      client,
      files,
      includeWarnings,
      diagnosticCodes,
    );

    return json({
      ok: true,
      files,
      maxPasses,
      apply,
      safeFixPolicy:
        "text-edit-only add-missing-using or organize-imports actions",
      diagnosticsConsidered,
      applied,
      skipped,
      remainingDiagnostics,
    });
  },
});

function isSafeDiagnosticFix(action: CodeAction) {
  return isAddMissingUsingAction(action) || isOrganizeImportsAction(action);
}

function filterDiagnostics(
  diagnostics: Diagnostic[],
  includeWarnings: boolean,
  diagnosticCodes: Set<string>,
) {
  const seen = new Set<string>();
  return diagnostics.filter((diagnostic) => {
    const code = getDiagnosticCode(diagnostic);
    if (diagnosticCodes.size > 0 && (!code || !diagnosticCodes.has(code))) {
      return false;
    }
    if (
      !includeWarnings &&
      diagnostic.severity !== undefined &&
      diagnostic.severity !== 1
    ) {
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

async function collectRemainingDiagnostics(
  client: { diagnostics(file: string): Promise<{ diagnostics: Diagnostic[] }> },
  files: string[],
  includeWarnings: boolean,
  diagnosticCodes: Set<string>,
) {
  const result = [];
  for (const file of files) {
    result.push({
      file,
      diagnostics: filterDiagnostics(
        (await client.diagnostics(file)).diagnostics,
        includeWarnings,
        diagnosticCodes,
      ),
    });
  }
  return result;
}

async function getProjectFiles(root: string, project: string | undefined) {
  const projectPath = project ? path.resolve(root, project) : root;
  const stat = await fs.stat(projectPath);
  const directory = stat.isDirectory()
    ? projectPath
    : path.dirname(projectPath);
  return await listCSharpFiles(directory);
}

async function listCSharpFiles(directory: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    if (
      entry.name === "bin" ||
      entry.name === "obj" ||
      entry.name.startsWith(".")
    ) {
      continue;
    }

    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listCSharpFiles(fullPath)));
    } else if (entry.isFile() && entry.name.endsWith(".cs")) {
      files.push(fullPath);
    }
  }

  return files.sort();
}

function clampPasses(value: number | undefined) {
  if (value === undefined || !Number.isFinite(value)) {
    return 10;
  }

  return Math.min(Math.max(Math.floor(value), 1), 100);
}
