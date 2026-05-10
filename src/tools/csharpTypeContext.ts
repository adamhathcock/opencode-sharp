import { tool } from "@opencode-ai/plugin";
import { promises as fs } from "node:fs";
import type { DocumentSymbol, Position, Range } from "../csharp/types.js";
import { getClient } from "../state.js";
import { json } from "../shared/json.js";
import {
  normalizeLocations,
  positionToToolPosition,
  rangeStartToToolPosition,
} from "./locations.js";
import { resolveWorkspacePath } from "./paths.js";
import { getPosition } from "./position.js";

const typeKinds = new Set([5, 10, 11, 22, 23]);
const memberKindNames: Record<number, string> = {
  6: "method",
  7: "property",
  8: "field",
  9: "constructor",
  10: "enum",
  11: "interface",
  12: "function",
  13: "variable",
  14: "constant",
  22: "namespace",
  23: "struct",
  24: "event",
};

export const csharpTypeContextTool: any = tool({
  description:
    "Return composed C# type context for a symbol position: containing type, declaration, members, constructors, hover, and definition.",
  args: {
    file: tool.schema.string(),
    line: tool.schema.number(),
    column: tool.schema.number(),
  },
  async execute(args, context) {
    const client = getClient(context);
    const file = resolveWorkspacePath(context, args.file);
    const position = getPosition(args);
    const text = await fs.readFile(file, "utf8");
    const [hover, definition, symbols] = await Promise.all([
      client.hover(file, position),
      client.symbolLocations(file, position, "definition"),
      client.documentSymbols(file),
    ]);
    const containingType = findContainingType(
      symbols as DocumentSymbol[],
      position,
    );

    return json({
      ok: true,
      file,
      position,
      toolPosition: positionToToolPosition(position),
      hover,
      definition: normalizeLocations(definition),
      containingType: containingType
        ? summarizeType(containingType, text)
        : undefined,
      limitations: [
        "Base types and interfaces are parsed from source declarations; no full semantic hierarchy expansion is performed.",
      ],
    });
  },
});

function findContainingType(symbols: DocumentSymbol[], position: Position) {
  const matches = flattenSymbols(symbols).filter(
    (symbol) =>
      typeKinds.has(symbol.kind) && containsPosition(symbol.range, position),
  );
  return matches.sort(
    (left, right) => rangeSize(left.range) - rangeSize(right.range),
  )[0];
}

function summarizeType(symbol: DocumentSymbol, text: string) {
  const declaration = getDeclarationText(text, symbol.range);
  const members = (symbol.children ?? []).map((member) =>
    summarizeMember(member, text),
  );

  return {
    name: getSimpleSymbolName(symbol.name),
    displayName: symbol.name,
    kind: memberKindNames[symbol.kind] ?? String(symbol.kind),
    detail: symbol.detail,
    accessibility: getAccessibility(declaration),
    modifiers: getModifiers(declaration),
    declaration,
    baseTypes: getBaseTypes(declaration),
    range: symbol.range,
    position: rangeStartToToolPosition(symbol.selectionRange),
    constructors: members.filter((member) => member.kind === "constructor"),
    members,
  };
}

function summarizeMember(symbol: DocumentSymbol, text: string) {
  const declaration = getDeclarationText(text, symbol.range);
  return {
    name: getSimpleSymbolName(symbol.name),
    displayName: symbol.name,
    kind: memberKindNames[symbol.kind] ?? String(symbol.kind),
    detail: symbol.detail,
    accessibility: getAccessibility(declaration),
    modifiers: getModifiers(declaration),
    declaration,
    range: symbol.range,
    position: rangeStartToToolPosition(symbol.selectionRange),
  };
}

function flattenSymbols(symbols: DocumentSymbol[]): DocumentSymbol[] {
  return symbols.flatMap((symbol) => [
    symbol,
    ...flattenSymbols(symbol.children ?? []),
  ]);
}

function containsPosition(range: Range, position: Position) {
  return (
    comparePosition(range.start, position) <= 0 &&
    comparePosition(position, range.end) <= 0
  );
}

function comparePosition(left: Position, right: Position) {
  return left.line - right.line || left.character - right.character;
}

function rangeSize(range: Range) {
  return (
    (range.end.line - range.start.line) * 10000 +
    range.end.character -
    range.start.character
  );
}

function getDeclarationText(text: string, range: Range) {
  const lines = text.split(/\r?\n/);
  const declarationLines = [];
  for (
    let line = range.start.line;
    line <= Math.min(range.end.line, lines.length - 1);
    line += 1
  ) {
    const value = lines[line]?.trim();
    if (!value) {
      continue;
    }

    declarationLines.push(value);
    if (value.includes("{") || value.endsWith(";") || value.includes("=>")) {
      break;
    }
  }

  return declarationLines
    .join(" ")
    .replace(/\s*\{.*$/, "")
    .trim();
}

function getAccessibility(declaration: string) {
  return /\b(public|private|protected|internal)\b/.exec(declaration)?.[1];
}

function getModifiers(declaration: string) {
  return [
    "abstract",
    "async",
    "const",
    "override",
    "partial",
    "readonly",
    "sealed",
    "static",
    "virtual",
  ].filter((modifier) => new RegExp(`\\b${modifier}\\b`).test(declaration));
}

function getBaseTypes(declaration: string) {
  const clause = /:\s*([^({;=]+)/.exec(declaration)?.[1];
  return clause
    ? clause
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean)
    : [];
}

function getSimpleSymbolName(name: string) {
  return name
    .replace(/\s*\(.*/, "")
    .replace(/\s*:.*/, "")
    .trim();
}
