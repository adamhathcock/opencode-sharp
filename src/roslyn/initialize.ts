import path from "node:path";
import { pathToFileURL } from "node:url";

export function getInitializeParams(root: string) {
  return {
    processId: process.pid,
    _vs_supportsVisualStudioExtensions: true,
    _vs_supportsDiagnosticRequests: true,
    rootUri: pathToFileURL(root).toString(),
    workspaceFolders: [
      { uri: pathToFileURL(root).toString(), name: path.basename(root) },
    ],
    capabilities: {
      workspace: {
        applyEdit: true,
        workspaceFolders: true,
        configuration: true,
        diagnostics: { refreshSupport: true },
        didChangeConfiguration: { dynamicRegistration: true },
      },
      textDocument: {
        synchronization: { didSave: true, dynamicRegistration: false },
        diagnostic: { dynamicRegistration: false },
        definition: { dynamicRegistration: false, linkSupport: true },
        typeDefinition: { dynamicRegistration: false, linkSupport: true },
        implementation: { dynamicRegistration: false, linkSupport: true },
        references: { dynamicRegistration: false },
        hover: {
          dynamicRegistration: false,
          contentFormat: ["markdown", "plaintext"],
        },
        documentSymbol: {
          dynamicRegistration: false,
          hierarchicalDocumentSymbolSupport: true,
        },
        signatureHelp: {
          dynamicRegistration: false,
          signatureInformation: {
            documentationFormat: ["markdown", "plaintext"],
            parameterInformation: { labelOffsetSupport: true },
          },
        },
        inlayHint: {
          dynamicRegistration: false,
          resolveSupport: { properties: ["tooltip", "textEdits", "label"] },
        },
        completion: {
          dynamicRegistration: false,
          completionItem: {
            documentationFormat: ["markdown", "plaintext"],
            snippetSupport: true,
            resolveSupport: {
              properties: ["documentation", "detail", "additionalTextEdits"],
            },
          },
          contextSupport: true,
        },
        rename: {
          dynamicRegistration: false,
          prepareSupport: true,
        },
        codeAction: {
          dynamicRegistration: false,
          codeActionLiteralSupport: {
            codeActionKind: {
              valueSet: [
                "",
                "quickfix",
                "refactor",
                "refactor.extract",
                "refactor.inline",
                "refactor.rewrite",
                "source",
                "source.organizeImports",
              ],
            },
          },
          resolveSupport: { properties: ["edit", "command"] },
        },
      },
    },
  };
}
