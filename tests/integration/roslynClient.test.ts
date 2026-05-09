import { afterAll, beforeAll, expect, test } from "bun:test";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { CodeActionOrCommand, Position } from "../../src/csharp/types";
import { CSharpLspPlugin } from "../../src/index";
import { RoslynLspClient } from "../../src/roslyn/client";
import { shutdownClientForRoot } from "../../src/state";
import {
  normalizeLocations,
  normalizeWorkspaceSymbols,
} from "../../src/tools/locations";
import { applyWorkspaceEdit } from "../../src/tools/workspaceEdit";

const fixtureRoot = fileURLToPath(
  new URL("../fixtures/SampleProject", import.meta.url),
);

let client: RoslynLspClient | undefined;
let tempRoot: string | undefined;
let projectRoot: string | undefined;

beforeAll(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "opencode-sharp-"));
  projectRoot = path.join(tempRoot, "SampleProject");
  await fs.cp(fixtureRoot, projectRoot, { recursive: true });

  client = new RoslynLspClient(projectRoot);
  await client.preloadDocument(path.join(projectRoot, "Consumer.cs"));
  await waitForProjectLoad(client);
});

afterAll(async () => {
  await client?.shutdown();
  if (tempRoot) {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test("document symbols include types and members", async () => {
  const { client, file } = getProject();

  const symbols = await client.documentSymbols(file("Calculator.cs"));

  expect(hasDocumentSymbol(symbols, "Calculator")).toBe(true);
  expect(hasDocumentSymbol(symbols, "Add")).toBe(true);
});

test("definition resolves a method call to the interface member", async () => {
  const { client, file, readPosition } = getProject();
  const consumer = file("Consumer.cs");
  const position = await readPosition(consumer, "Add(1", 1);

  const response = await client.symbolLocations(
    consumer,
    position,
    "definition",
  );
  const locations = normalizeLocations(response);

  expect(
    locations.some((location) => location.file === file("ICalculator.cs")),
  ).toBe(true);
});

test("references include interface, implementation, and call sites", async () => {
  const { client, file, readPosition } = getProject();
  const calculator = file("Calculator.cs");
  const position = await readPosition(calculator, "Add(int", 1);

  const response = await client.references(calculator, position, true);
  const locations = normalizeLocations(response);
  const files = new Set(locations.map((location) => location.file));

  expect(files.has(file("ICalculator.cs"))).toBe(true);
  expect(files.has(file("Calculator.cs"))).toBe(true);
  expect(files.has(file("Consumer.cs"))).toBe(true);
});

test("workspace symbols find project types without resolve", async () => {
  const { client, file } = getProject();

  const symbols = normalizeWorkspaceSymbols(
    await client.workspaceSymbols("Calculator"),
  );

  expect(
    symbols.some(
      (symbol) =>
        symbol.name === "Calculator" && symbol.file === file("Calculator.cs"),
    ),
  ).toBe(true);
  expect(
    symbols.some(
      (symbol) =>
        symbol.name === "ICalculator" && symbol.file === file("ICalculator.cs"),
    ),
  ).toBe(true);
});

test("workspace symbol tool does not expose unsupported resolve option", async () => {
  const { root, file } = getProject();
  const plugin = await CSharpLspPlugin({} as never);
  const workspaceSymbols = plugin.tool?.csharp_workspace_symbols;

  expect(workspaceSymbols).toBeDefined();
  if (!workspaceSymbols) {
    throw new Error("Expected csharp_workspace_symbols tool.");
  }

  const toolResult = await workspaceSymbols.execute(
    { query: "Calculator", limit: 10 },
    { directory: root, worktree: root } as never,
  );
  await shutdownClientForRoot(root);
  const result = JSON.parse(getToolOutput(toolResult));

  expect(result.ok).toBe(true);
  expect(result.symbols.length).toBeGreaterThan(0);
  expect(
    result.symbols.some(
      (symbol: { name?: string; file?: string }) =>
        symbol.name === "Calculator" && symbol.file === file("Calculator.cs"),
    ),
  ).toBe(true);
  expect(JSON.stringify(result)).not.toContain("resolveError");
});

test("hover returns Roslyn type information", async () => {
  const { client, file, readPosition } = getProject();
  const consumer = file("Consumer.cs");
  const position = await readPosition(consumer, "ICalculator", 1);

  const hover = await client.hover(consumer, position);

  expect(JSON.stringify(hover)).toContain("ICalculator");
});

test("diagnostics report compiler errors from a real file", async () => {
  const { client, file } = getProject();

  const result = await client.diagnostics(file("Broken.cs"));

  expect(
    result.diagnostics.some(
      (diagnostic) =>
        diagnostic.code === "CS0103" ||
        diagnostic.message.includes("MissingSymbol"),
    ),
  ).toBe(true);
});

test("code actions include organize imports and can apply its edit", async () => {
  const { client, file } = getProject();
  const imports = file("Imports.cs");
  const text = await fs.readFile(imports, "utf8");

  const actions = flattenCodeActions(
    (await client.codeActions(
      imports,
      fullRange(text),
    )) as CodeActionOrCommand[],
  );
  const action = actions.find(
    (candidate) => getTitle(candidate) === "Sort Usings",
  );

  expect(action).toBeDefined();
  if (!action || !isRecord(action)) {
    throw new Error("Expected Sort Usings code action.");
  }

  const resolved = await client.resolveCodeAction(
    action as CodeActionOrCommand,
  );
  expect(resolved.edit).toBeDefined();
  if (!resolved.edit) {
    throw new Error(
      "Expected organize imports to resolve to a workspace edit.",
    );
  }

  await applyWorkspaceEdit(resolved.edit);
  const updated = await fs.readFile(imports, "utf8");

  expect(updated.indexOf("using System;")).toBeLessThan(
    updated.indexOf("using System.Text;"),
  );
});

function getProject() {
  if (!client || !projectRoot) {
    throw new Error("Roslyn integration fixture was not initialized.");
  }
  const root = projectRoot;

  return {
    client,
    root,
    file: (relativePath: string) => path.join(root, relativePath),
    readPosition: async (file: string, needle: string, characterOffset = 0) =>
      positionOf(await fs.readFile(file, "utf8"), needle, characterOffset),
  };
}

async function waitForProjectLoad(client: RoslynLspClient) {
  const deadline = Date.now() + 15000;
  do {
    if (
      JSON.stringify(client.status().logMessages).includes(
        "Successfully completed load",
      )
    ) {
      await client.waitForRoslynOperations([
        "Workspace",
        "SolutionCrawlerLegacy",
        "DiagnosticService",
      ]);
      return;
    }

    await delay(250);
  } while (Date.now() < deadline);

  throw new Error(
    `Timed out waiting for Roslyn project load: ${JSON.stringify(client.status())}`,
  );
}

async function delay(milliseconds: number) {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function positionOf(text: string, needle: string, characterOffset: number) {
  const offset = text.indexOf(needle);
  if (offset < 0) {
    throw new Error(`Could not find ${needle}`);
  }

  return offsetToPosition(text, offset + characterOffset);
}

function offsetToPosition(text: string, offset: number): Position {
  const before = text.slice(0, offset);
  const lines = before.split(/\r?\n/);
  return {
    line: lines.length - 1,
    character: lines[lines.length - 1]?.length ?? 0,
  };
}

function fullRange(text: string) {
  const lines = text.split(/\r?\n/);
  const lastLine = Math.max(0, lines.length - 1);
  return {
    start: { line: 0, character: 0 },
    end: { line: lastLine, character: lines[lastLine]?.length ?? 0 },
  };
}

function hasDocumentSymbol(symbols: unknown[], name: string): boolean {
  return symbols.some((symbol) => {
    if (!isRecord(symbol)) {
      return false;
    }
    if (typeof symbol.name === "string" && symbol.name.startsWith(name)) {
      return true;
    }

    return Array.isArray(symbol.children)
      ? hasDocumentSymbol(symbol.children, name)
      : false;
  });
}

function flattenCodeActions(actions: unknown[]): unknown[] {
  return actions.flatMap((action) => [
    action,
    ...(isRecord(action) && Array.isArray(action.children)
      ? flattenCodeActions(action.children)
      : []),
  ]);
}

function getTitle(value: unknown) {
  return isRecord(value) ? value.title : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getToolOutput(result: unknown) {
  if (typeof result === "string") {
    return result;
  }

  if (isRecord(result) && typeof result.output === "string") {
    return result.output;
  }

  throw new Error(`Unexpected tool result: ${JSON.stringify(result)}`);
}
