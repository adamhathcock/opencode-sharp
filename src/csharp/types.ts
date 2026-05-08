export type Position = { line: number; character: number };
export type Range = { start: Position; end: Position };
export type TextEdit = { range: Range; newText: string };

export type WorkspaceEdit = {
  changes?: Record<string, TextEdit[]>;
  documentChanges?: Array<
    | { textDocument: { uri: string; version?: number | null }; edits: TextEdit[] }
    | { kind: "create" | "rename" | "delete"; uri?: string; oldUri?: string; newUri?: string }
  >;
};

export type Diagnostic = {
  range: Range;
  severity?: number;
  code?: string | number;
  source?: string;
  message: string;
};

export type CodeAction = {
  title: string;
  kind?: string;
  diagnostics?: Diagnostic[];
  edit?: WorkspaceEdit;
  command?: unknown;
  data?: unknown;
};

export type CodeActionOrCommand = CodeAction | { title: string; command: string; arguments?: unknown[] };

export type OpenDocument = {
  uri: string;
  text: string;
  version: number;
};
