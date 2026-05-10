import { csharpApplyCodeActionTool } from "./csharpApplyCodeAction.js";
import { csharpApplyWorkspaceEditTool } from "./csharpApplyWorkspaceEdit.js";
import { csharpAddMissingUsingsTool } from "./csharpAddMissingUsings.js";
import { csharpCodeActionTool } from "./csharpCodeAction.js";
import { csharpDiagnosticsTool } from "./csharpDiagnostics.js";
import { csharpFixAllDiagnosticsTool } from "./csharpFixAllDiagnostics.js";
import { csharpOrganizeImportsTool } from "./csharpOrganizeImports.js";
import { csharpProjectContextTool } from "./csharpProjectContext.js";
import { csharpRenameSymbolTool } from "./csharpRenameSymbol.js";
import { csharpSymbolContextTool } from "./csharpSymbolContext.js";
import { csharpTypeContextTool } from "./csharpTypeContext.js";
import { csharpWorkspaceDiagnosticsTool } from "./csharpWorkspaceDiagnostics.js";
import { csharpWorkspaceSymbolsTool } from "./csharpWorkspaceSymbols.js";

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
