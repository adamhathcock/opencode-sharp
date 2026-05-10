import { csharpApplyCodeActionTool } from "./csharpApplyCodeAction";
import { csharpApplyWorkspaceEditTool } from "./csharpApplyWorkspaceEdit";
import { csharpCodeActionTool } from "./csharpCodeAction";
import { csharpDiagnosticsTool } from "./csharpDiagnostics";
import { csharpFindReferencesTool } from "./csharpFindReferences";
import { csharpRenameSymbolTool } from "./csharpRenameSymbol";
import { csharpSymbolContextTool } from "./csharpSymbolContext";
import { csharpSymbolLocationsTool } from "./csharpSymbolLocations";
import { csharpWorkspaceDiagnosticsTool } from "./csharpWorkspaceDiagnostics";
import { csharpWorkspaceSymbolsTool } from "./csharpWorkspaceSymbols";

export const csharpTools: Record<string, any> = {
  csharp_symbol_context: csharpSymbolContextTool,
  csharp_symbol_locations: csharpSymbolLocationsTool,
  csharp_workspace_symbols: csharpWorkspaceSymbolsTool,
  csharp_find_references: csharpFindReferencesTool,
  csharp_diagnostics: csharpDiagnosticsTool,
  csharp_workspace_diagnostics: csharpWorkspaceDiagnosticsTool,
  csharp_rename_symbol: csharpRenameSymbolTool,
  csharp_code_action: csharpCodeActionTool,
  csharp_apply_code_action: csharpApplyCodeActionTool,
  csharp_apply_workspace_edit: csharpApplyWorkspaceEditTool,
} as const;
