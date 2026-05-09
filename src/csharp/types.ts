export type Position = { line: number; character: number };
export type Range = { start: Position; end: Position };
export type TextEdit = { range: Range; newText: string };

export type WorkspaceEdit = {
  changes?: Record<string, TextEdit[]>;
  documentChanges?: Array<
    | {
        textDocument: { uri: string; version?: number | null };
        edits: TextEdit[];
      }
    | {
        kind: "create" | "rename" | "delete";
        uri?: string;
        oldUri?: string;
        newUri?: string;
      }
  >;
};

export type Diagnostic = {
  range: Range;
  severity?: number;
  code?: string | number;
  source?: string;
  message: string;
};

export type Location = {
  uri: string;
  range: Range;
};

export type LocationLink = {
  targetUri: string;
  targetRange: Range;
  targetSelectionRange: Range;
  originSelectionRange?: Range;
};

export type DocumentSymbol = {
  name: string;
  detail?: string;
  kind: number;
  deprecated?: boolean;
  range: Range;
  selectionRange: Range;
  children?: DocumentSymbol[];
};

export type SymbolInformation = {
  name: string;
  kind: number;
  deprecated?: boolean;
  location: Location;
  containerName?: string;
};

export type WorkspaceSymbol = {
  name: string;
  kind: number;
  tags?: number[];
  containerName?: string;
  location: Location | { uri: string };
  data?: unknown;
};

export type CodeAction = {
  title: string;
  kind?: string;
  diagnostics?: Diagnostic[];
  edit?: WorkspaceEdit;
  command?: unknown;
  data?: unknown;
};

export type CodeActionOrCommand =
  | CodeAction
  | { title: string; command: string; arguments?: unknown[] };

export type OpenDocument = {
  uri: string;
  text: string;
  version: number;
};
