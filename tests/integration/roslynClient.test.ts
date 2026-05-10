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
}, 20000);

afterAll(async () => {
  await client?.shutdown();
  if (projectRoot) {
    await shutdownClientForRoot(projectRoot);
  }
  if (tempRoot) {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test.serial("document symbols include types and members", async () => {
  const { client, file } = getProject();

  const symbols = await client.documentSymbols(file("Calculator.cs"));

  expect(hasDocumentSymbol(symbols, "Calculator")).toBe(true);
  expect(hasDocumentSymbol(symbols, "Add")).toBe(true);
});

test.serial(
  "definition resolves a method call to the interface member",
  async () => {
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
  },
);

test.serial(
  "workspace symbols find project types without resolve",
  async () => {
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
          symbol.name === "ICalculator" &&
          symbol.file === file("ICalculator.cs"),
      ),
    ).toBe(true);
  },
);

test.serial(
  "workspace symbol tool does not expose unsupported resolve option",
  async () => {
    await withIsolatedProject(async ({ root, file }) => {
      const result = await executeTool(root, "csharp_workspace_symbols", {
        query: "Calculator",
        limit: 10,
      });

      expect(result.ok).toBe(true);
      expect(result.symbols.length).toBeGreaterThan(0);
      expect(
        result.symbols.some(
          (symbol: { name?: string; file?: string }) =>
            symbol.name === "Calculator" &&
            symbol.file === file("Calculator.cs"),
        ),
      ).toBe(true);
      expect(JSON.stringify(result)).not.toContain("resolveError");
    });
  },
  20000,
);

test.serial(
  "organize imports tool applies safe Roslyn action",
  async () => {
    await withIsolatedProject(async ({ root, file }) => {
      const imports = file("OrganizeToolImports.cs");

      const result = await executeTool(root, "csharp_organize_imports", {
        file: imports,
      });
      const updated = await fs.readFile(imports, "utf8");

      expect(result.ok).toBe(true);
      expect(updated.indexOf("using System;")).toBeLessThan(
        updated.indexOf("using System.Text;"),
      );
    });
  },
  20000,
);

test.serial(
  "add missing usings tool applies unresolved type quick fix",
  async () => {
    await withIsolatedProject(async ({ root, file }) => {
      const missingUsing = file("MissingUsing.cs");

      const result = await executeTool(root, "csharp_add_missing_usings", {
        file: missingUsing,
        maxPasses: 3,
      });
      const updated = await fs.readFile(missingUsing, "utf8");

      expect(result.applied.length).toBeGreaterThan(0);
      expect(updated).toContain("using System.Text;");
    });
  },
  30000,
);

test.serial(
  "fix all diagnostics applies conservative safe fixes",
  async () => {
    await withIsolatedProject(async ({ root, file }) => {
      const missingUsing = file("MissingUsingForFixAll.cs");

      const result = await executeTool(root, "csharp_fix_all_diagnostics", {
        file: missingUsing,
        maxPasses: 3,
        diagnosticCodes: ["CS0246"],
      });
      const updated = await fs.readFile(missingUsing, "utf8");

      expect(result.applied.length).toBeGreaterThan(0);
      expect(updated).toContain("using System.Text;");
    });
  },
  20000,
);

test.serial(
  "project context returns static csproj settings",
  async () => {
    await withIsolatedProject(async ({ root, file }) => {
      const result = await executeTool(root, "csharp_project_context", {
        file: file("Calculator.cs"),
      });

      expect(result.projectFile).toBe(file("SampleProject.csproj"));
      expect(result.targetFrameworks).toContain("net8.0");
      expect(result.nullable).toBe("enable");
      expect(result.implicitUsings).toBe("enable");
    });
  },
  20000,
);

test.serial(
  "type context returns containing type and members",
  async () => {
    await withIsolatedProject(async ({ root, file, readPosition }) => {
      const calculator = file("Calculator.cs");
      const position = await readPosition(calculator, "Calculator", 1);

      const result = await executeTool(root, "csharp_type_context", {
        file: calculator,
        line: position.line + 1,
        column: position.character + 1,
      });

      expect(result.containingType.name).toBe("Calculator");
      expect(result.containingType.baseTypes).toContain("ICalculator");
      expect(
        result.containingType.members.some(
          (member: { name?: string }) => member.name === "Add",
        ),
      ).toBe(true);
    });
  },
  20000,
);

test.serial("hover returns Roslyn type information", async () => {
  const { client, file, readPosition } = getProject();
  const consumer = file("Consumer.cs");
  const position = await readPosition(consumer, "ICalculator", 1);

  const hover = await client.hover(consumer, position);

  expect(JSON.stringify(hover)).toContain("ICalculator");
});

test.serial("diagnostics report compiler errors from a real file", async () => {
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

test.serial(
  "code actions include organize imports and can apply its edit",
  async () => {
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
  },
  20000,
);

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

type ProjectHandle = {
  root: string;
  file: (relativePath: string) => string;
  readPosition: (
    file: string,
    needle: string,
    characterOffset?: number,
  ) => Promise<Position>;
};

async function withIsolatedProject(
  callback: (project: ProjectHandle) => Promise<void>,
) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "opencode-sharp-tool-"));
  const projectRoot = path.join(root, "SampleProject");
  await fs.cp(fixtureRoot, projectRoot, { recursive: true });

  try {
    await callback({
      root: projectRoot,
      file: (relativePath: string) => path.join(projectRoot, relativePath),
      readPosition: async (file: string, needle: string, characterOffset = 0) =>
        positionOf(await fs.readFile(file, "utf8"), needle, characterOffset),
    });
  } finally {
    await shutdownClientForRoot(projectRoot);
    await fs.rm(root, { recursive: true, force: true });
  }
}

async function executeTool(
  root: string,
  name: string,
  args: Record<string, unknown>,
) {
  const plugin = await CSharpLspPlugin({} as never);
  const tool = plugin.tool?.[name];
  expect(tool).toBeDefined();
  if (!tool) {
    throw new Error(`Expected ${name} tool.`);
  }

  return JSON.parse(
    getToolOutput(
      await tool.execute(args, { directory: root, worktree: root } as never),
    ),
  );
}
