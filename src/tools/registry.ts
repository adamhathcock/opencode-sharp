import { csharpApplyCodeActionTool } from "./csharpApplyCodeAction";
import { csharpApplyWorkspaceEditTool } from "./csharpApplyWorkspaceEdit";
import { csharpAddMissingUsingsTool } from "./csharpAddMissingUsings";
import { csharpCodeActionTool } from "./csharpCodeAction";
import { csharpDiagnosticsTool } from "./csharpDiagnostics";
import { csharpFixAllDiagnosticsTool } from "./csharpFixAllDiagnostics";
import { csharpOrganizeImportsTool } from "./csharpOrganizeImports";
import { csharpProjectContextTool } from "./csharpProjectContext";
import { csharpRenameSymbolTool } from "./csharpRenameSymbol";
import { csharpSymbolContextTool } from "./csharpSymbolContext";
import { csharpTypeContextTool } from "./csharpTypeContext";
import { csharpWorkspaceDiagnosticsTool } from "./csharpWorkspaceDiagnostics";
import { csharpWorkspaceSymbolsTool } from "./csharpWorkspaceSymbols";

export const csharpTools: Record<string, any> = {
  csharp_symbol_context: csharpSymbolContextTool,
  csharp_workspace_symbols: csharpWorkspaceSymbolsTool,
  csharp_diagnostics: csharpDiagnosticsTool,
  csharp_workspace_diagnostics: csharpWorkspaceDiagnosticsTool,
  csharp_rename_symbol: csharpRenameSymbolTool,
  csharp_code_action: csharpCodeActionTool,
  csharp_apply_code_action: csharpApplyCodeActionTool,
  csharp_apply_workspace_edit: csharpApplyWorkspaceEditTool,
  csharp_organize_imports: csharpOrganizeImportsTool,
  csharp_add_missing_usings: csharpAddMissingUsingsTool,
  csharp_fix_all_diagnostics: csharpFixAllDiagnosticsTool,
  csharp_project_context: csharpProjectContextTool,
  csharp_type_context: csharpTypeContextTool,
} as const;
