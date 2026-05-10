import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Position, TextEdit, WorkspaceEdit } from "../csharp/types.js";

export async function applyWorkspaceEdit(edit: WorkspaceEdit) {
  const editsByFile = new Map<string, TextEdit[]>();
  const unsupported: unknown[] = [];
  const resourceOperations = [];

  for (const [uri, edits] of Object.entries(edit.changes ?? {})) {
    addEdits(editsByFile, uri, edits);
  }

  for (const change of edit.documentChanges ?? []) {
    if ("textDocument" in change) {
      addEdits(editsByFile, change.textDocument.uri, change.edits);
    } else {
      const operation = await applyResourceOperation(change);
      if (operation) {
        resourceOperations.push(operation);
      } else {
        unsupported.push(change);
      }
    }
  }

  const changedFiles: Array<{ file: string; edits: number }> = [];
  for (const [uri, edits] of editsByFile) {
    const file = fileURLToPath(uri);
    const original = await fs.readFile(file, "utf8");
    const updated = applyTextEdits(original, edits);
    if (updated !== original) {
      await fs.writeFile(file, updated, "utf8");
    }
    changedFiles.push({ file, edits: edits.length });
  }

  return { changedFiles, resourceOperations, unsupported };
}

async function applyResourceOperation(change: unknown) {
  if (typeof change !== "object" || change === null || !("kind" in change)) {
    return undefined;
  }

  if (
    change.kind === "create" &&
    "uri" in change &&
    typeof change.uri === "string"
  ) {
    const file = fileURLToPath(change.uri);
    await fs.mkdir(path.dirname(file), { recursive: true });
    try {
      await fs.writeFile(file, "", { flag: "wx" });
    } catch (error) {
      if (!isFileExistsError(error)) {
        throw error;
      }
    }
    return { kind: change.kind, file };
  }

  if (
    change.kind === "rename" &&
    "oldUri" in change &&
    "newUri" in change &&
    typeof change.oldUri === "string" &&
    typeof change.newUri === "string"
  ) {
    const oldFile = fileURLToPath(change.oldUri);
    const newFile = fileURLToPath(change.newUri);
    await fs.mkdir(path.dirname(newFile), { recursive: true });
    await fs.rename(oldFile, newFile);
    return { kind: change.kind, oldFile, newFile };
  }

  if (
    change.kind === "delete" &&
    "uri" in change &&
    typeof change.uri === "string"
  ) {
    const file = fileURLToPath(change.uri);
    await fs.rm(file, { force: true });
    return { kind: change.kind, file };
  }

  return undefined;
}

function addEdits(
  editsByFile: Map<string, TextEdit[]>,
  uri: string,
  edits: TextEdit[],
) {
  const existing = editsByFile.get(uri) ?? [];
  existing.push(...edits);
  editsByFile.set(uri, existing);
}

function applyTextEdits(text: string, edits: TextEdit[]) {
  const lineStarts = getLineStarts(text);
  const ordered = edits
    .map((edit) => ({
      edit,
      start: positionToOffset(lineStarts, edit.range.start),
      end: positionToOffset(lineStarts, edit.range.end),
    }))
    .sort((left, right) => right.start - left.start || right.end - left.end);
  let result = text;
  let previousStart = Number.POSITIVE_INFINITY;

  for (const { edit, start, end } of ordered) {
    if (end < start) {
      throw new Error(
        "WorkspaceEdit contains an edit whose end is before start.",
      );
    }
    if (end > previousStart) {
      throw new Error("WorkspaceEdit contains overlapping text edits.");
    }

    result = result.slice(0, start) + edit.newText + result.slice(end);
    previousStart = start;
  }

  return result;
}

function isFileExistsError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "EEXIST"
  );
}

function getLineStarts(text: string) {
  const starts = [0];
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === "\n") {
      starts.push(index + 1);
    }
  }

  return starts;
}

function positionToOffset(lineStarts: number[], position: Position) {
  const lineStart =
    lineStarts[Math.min(position.line, lineStarts.length - 1)] ?? 0;
  return lineStart + position.character;
}
