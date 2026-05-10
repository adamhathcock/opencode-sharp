import type {
  CodeAction,
  Diagnostic,
  Position,
  Range,
  WorkspaceSymbol,
} from "../csharp/types";
import { getStableCodeActions } from "./codeActionPolling";
import { getRoslynCommand } from "./command";
import { getDiagnostics, getWorkspaceDiagnostics } from "./diagnostics";
import { DocumentStore } from "./documents";
import { getInitializeParams } from "./initialize";
import { handleServerRequest } from "./serverRequests";
import { RpcConnection } from "./rpcConnection";

export type SymbolLocationKind =
  | "definition"
  | "typeDefinition"
  | "implementation";

const symbolLocationMethods: Record<SymbolLocationKind, string> = {
  definition: "textDocument/definition",
  typeDefinition: "textDocument/typeDefinition",
  implementation: "textDocument/implementation",
};

export class RoslynLspClient {
  private connection: RpcConnection | undefined;
  private initialized: Promise<void> | undefined;
  private initializeResult: unknown;
  private documents = new DocumentStore((method, params) =>
    this.notify(method, params),
  );

  constructor(private readonly root: string) {}

  status() {
    return {
      root: this.root,
      initialized: this.initialized !== undefined,
      openDocuments: this.documents.size,
      serverCapabilities: getProperty(this.initializeResult, "capabilities"),
      ...this.connection?.status(),
    };
  }

  async shutdown() {
    await this.connection?.shutdown();
    this.initialized = undefined;
    this.documents.clear();
  }

  diagnostics(file: string) {
    return getDiagnostics(this, file);
  }

  workspaceDiagnostics() {
    return getWorkspaceDiagnostics(this);
  }

  async preloadDocument(file: string) {
    await this.syncDocument(file);
    await this.waitForRoslynOperations([
      "Workspace",
      "SolutionCrawlerLegacy",
      "DiagnosticService",
    ]);
  }

  async symbolLocations(
    file: string,
    position: Position,
    kind: SymbolLocationKind,
  ) {
    const document = await this.syncDocument(file);
    return await this.request(symbolLocationMethods[kind], {
      textDocument: { uri: document.uri },
      position,
    });
  }

  async workspaceSymbols(query: string) {
    await this.ensureStarted();
    await this.waitForProjectLoad();
    await this.waitForRoslynOperations(["Workspace", "SolutionCrawlerLegacy"]);
    const response = await this.request("workspace/symbol", { query });
    return Array.isArray(response) ? (response as WorkspaceSymbol[]) : [];
  }

  async hover(file: string, position: Position) {
    const document = await this.syncDocument(file);
    return await this.request("textDocument/hover", {
      textDocument: { uri: document.uri },
      position,
    });
  }

  async documentSymbols(file: string) {
    const document = await this.syncDocument(file);
    const response = await this.request("textDocument/documentSymbol", {
      textDocument: { uri: document.uri },
    });
    return Array.isArray(response) ? response : [];
  }

  async rename(file: string, position: Position, newName: string) {
    const document = await this.syncDocument(file);
    return await this.request("textDocument/rename", {
      textDocument: { uri: document.uri },
      position,
      newName,
    });
  }

  async codeActions(
    file: string,
    range: Range,
    options: { diagnostics?: Diagnostic[]; only?: string[] } = {},
  ) {
    const document = await this.syncDocument(file);
    return await getStableCodeActions(
      document.uri,
      range,
      (method, params) => this.request(method, params),
      (operations) => this.waitForRoslynOperations(operations),
      options,
    );
  }

  async resolveCodeAction(action: CodeAction) {
    if (action.edit) {
      return action;
    }

    return (await this.request("codeAction/resolve", action)) as CodeAction;
  }

  async syncDocument(file: string) {
    await this.ensureStarted();
    return await this.documents.sync(file);
  }

  async waitForRoslynOperations(operations: string[]) {
    try {
      await this.request("workspace/waitForAsyncOperations", { operations });
    } catch {
      // Internal Roslyn test hook; ignore if unavailable.
    }
  }

  async waitForProjectLoad() {
    await this.ensureStarted();
    const deadline = Date.now() + 15000;
    do {
      if (
        JSON.stringify(this.status().logMessages).includes(
          "Successfully completed load",
        )
      ) {
        return;
      }

      await delay(250);
    } while (Date.now() < deadline);
  }

  async request(method: string, params: unknown) {
    await this.ensureStarted();
    return await this.connection!.request(method, params);
  }

  private notify(method: string, params: unknown) {
    this.connection!.notify(method, params);
  }

  private async ensureStarted() {
    if (!this.initialized) {
      this.initialized = this.start();
    }
    await this.initialized;
  }

  private async start() {
    const command = await getRoslynCommand();
    const args = (
      process.env.OPENCODE_SHARP_ROSLYN_ARGS || "--stdio --autoLoadProjects"
    )
      .split(" ")
      .map((arg) => arg.trim())
      .filter(Boolean);
    this.connection = new RpcConnection(command, args, this.root, (message) =>
      handleServerRequest(this.root, message),
    );
    await this.connection.start();
    this.initializeResult = await this.connection.request(
      "initialize",
      getInitializeParams(this.root),
    );
    this.connection.notify("initialized", {});
  }
}

async function delay(milliseconds: number) {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function getProperty(value: unknown, property: string) {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)[property]
    : undefined;
}
