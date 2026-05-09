import type { CodeAction, Position, Range } from "../csharp/types";
import { getStableCodeActions } from "./codeActionPolling";
import { getRoslynCommand } from "./command";
import { getDiagnostics } from "./diagnostics";
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

  async preloadDocument(file: string) {
    await this.syncDocument(file);
    await this.waitForRoslynOperations([
      "Workspace",
      "SolutionCrawlerLegacy",
      "DiagnosticService",
    ]);
  }

  async workspaceSymbols(query: string) {
    const response = await this.request("workspace/symbol", { query });
    return Array.isArray(response) ? response : [];
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

  async references(
    file: string,
    position: Position,
    includeDeclaration: boolean,
  ) {
    const document = await this.syncDocument(file);
    const response = await this.request("textDocument/references", {
      textDocument: { uri: document.uri },
      position,
      context: { includeDeclaration },
    });
    return Array.isArray(response) ? response : [];
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

  async prepareCallHierarchy(file: string, position: Position) {
    const document = await this.syncDocument(file);
    const response = await this.request("textDocument/prepareCallHierarchy", {
      textDocument: { uri: document.uri },
      position,
    });
    return Array.isArray(response) ? response : [];
  }

  async incomingCalls(item: unknown) {
    const response = await this.request("callHierarchy/incomingCalls", {
      item,
    });
    return Array.isArray(response) ? response : [];
  }

  async outgoingCalls(item: unknown) {
    const response = await this.request("callHierarchy/outgoingCalls", {
      item,
    });
    return Array.isArray(response) ? response : [];
  }

  async prepareTypeHierarchy(file: string, position: Position) {
    const document = await this.syncDocument(file);
    const response = await this.request("textDocument/prepareTypeHierarchy", {
      textDocument: { uri: document.uri },
      position,
    });
    return Array.isArray(response) ? response : [];
  }

  async supertypes(item: unknown) {
    const response = await this.request("typeHierarchy/supertypes", { item });
    return Array.isArray(response) ? response : [];
  }

  async subtypes(item: unknown) {
    const response = await this.request("typeHierarchy/subtypes", { item });
    return Array.isArray(response) ? response : [];
  }

  async semanticTokens(file: string, range: Range | undefined) {
    const document = await this.syncDocument(file);
    if (range) {
      return await this.request("textDocument/semanticTokens/range", {
        textDocument: { uri: document.uri },
        range,
      });
    }

    return await this.request("textDocument/semanticTokens/full", {
      textDocument: { uri: document.uri },
    });
  }

  semanticTokensLegend() {
    const capabilities = getProperty(this.initializeResult, "capabilities");
    const provider = getProperty(capabilities, "semanticTokensProvider");
    return getProperty(provider, "legend");
  }

  async documentHighlights(file: string, position: Position) {
    const document = await this.syncDocument(file);
    const response = await this.request("textDocument/documentHighlight", {
      textDocument: { uri: document.uri },
      position,
    });
    return Array.isArray(response) ? response : [];
  }

  async selectionRanges(file: string, positions: Position[]) {
    const document = await this.syncDocument(file);
    const response = await this.request("textDocument/selectionRange", {
      textDocument: { uri: document.uri },
      positions,
    });
    return Array.isArray(response) ? response : [];
  }

  async signatureHelp(file: string, position: Position) {
    const document = await this.syncDocument(file);
    return await this.request("textDocument/signatureHelp", {
      textDocument: { uri: document.uri },
      position,
    });
  }

  async inlayHints(file: string, range: Range) {
    const document = await this.syncDocument(file);
    const response = await this.request("textDocument/inlayHint", {
      textDocument: { uri: document.uri },
      range,
    });
    return Array.isArray(response) ? response : response;
  }

  async completion(
    file: string,
    position: Position,
    triggerCharacter: string | undefined,
  ) {
    const document = await this.syncDocument(file);
    return await this.request("textDocument/completion", {
      textDocument: { uri: document.uri },
      position,
      context: triggerCharacter
        ? { triggerKind: 2, triggerCharacter }
        : { triggerKind: 1 },
    });
  }

  async resolveCompletionItem(item: unknown) {
    return await this.request("completionItem/resolve", item);
  }

  async resolveInlayHint(hint: unknown) {
    return await this.request("inlayHint/resolve", hint);
  }

  async workspaceDiagnostics() {
    return await this.request("workspace/diagnostic", {
      identifier: "opencode-sharp",
      previousResultIds: [],
    });
  }

  async prepareRename(file: string, position: Position) {
    const document = await this.syncDocument(file);
    return await this.request("textDocument/prepareRename", {
      textDocument: { uri: document.uri },
      position,
    });
  }

  async rename(file: string, position: Position, newName: string) {
    const document = await this.syncDocument(file);
    return await this.request("textDocument/rename", {
      textDocument: { uri: document.uri },
      position,
      newName,
    });
  }

  async codeActions(file: string, range: Range) {
    const document = await this.syncDocument(file);
    return await getStableCodeActions(
      document.uri,
      range,
      (method, params) => this.request(method, params),
      (operations) => this.waitForRoslynOperations(operations),
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

function getProperty(value: unknown, property: string) {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)[property]
    : undefined;
}
