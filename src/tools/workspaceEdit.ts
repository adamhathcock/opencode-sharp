import { promises as fs } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Position, TextEdit, WorkspaceEdit } from "../csharp/types";

export async function applyWorkspaceEdit(edit: WorkspaceEdit) {
  const editsByFile = new Map<string, TextEdit[]>();
  const unsupported: unknown[] = [];

  for (const [uri, edits] of Object.entries(edit.changes ?? {})) {
    addEdits(editsByFile, uri, edits);
  }

  for (const change of edit.documentChanges ?? []) {
    if ("textDocument" in change) {
      addEdits(editsByFile, change.textDocument.uri, change.edits);
    } else {
      unsupported.push(change);
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

  return { changedFiles, unsupported };
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
  const ordered = [...edits].sort(
    (left, right) =>
      positionToOffset(lineStarts, right.range.start) -
      positionToOffset(lineStarts, left.range.start),
  );
  let result = text;

  for (const edit of ordered) {
    const starts = getLineStarts(result);
    const start = positionToOffset(starts, edit.range.start);
    const end = positionToOffset(starts, edit.range.end);
    result = result.slice(0, start) + edit.newText + result.slice(end);
  }

  return result;
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
