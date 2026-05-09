# opencode-sharp

`opencode-sharp` is an opencode plugin that adds focused C# tools backed by `roslyn-language-server`.

opencode already has built-in C# LSP support. This plugin is intended to expose Roslyn capabilities that are not currently convenient as first-class opencode tools, such as Roslyn diagnostic pulls, workspace symbol search, implementation lookup, and code actions.

## Status

This is an early implementation. The plugin starts its own Roslyn language-server sidecar over stdio and talks to it with JSON-RPC/LSP.

The plugin intentionally does not fall back to `dotnet build` or other CLI commands for semantic results. Tool output should reflect what Roslyn returned.

## Requirements

- Bun
- TypeScript dependencies from `package.json`
- .NET SDK/runtime compatible with `roslyn-language-server`
- `roslyn-language-server` installed as a .NET tool or otherwise available as an executable

Install Roslyn language server if needed:

```bash
dotnet tool install --global roslyn-language-server --prerelease
```

## Setup

Install dependencies:

```bash
bun install
```

Build the plugin:

```bash
bun run build
```

## opencode Configuration

Use the server plugin from opencode config:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["opencode-sharp/server"]
}
```

Run TypeScript in watch mode:

```bash
bun run dev
```

## Configuration

By default, the plugin launches:

```bash
roslyn-language-server --stdio --autoLoadProjects
```

Command resolution order:

1. `OPENCODE_SHARP_ROSLYN_COMMAND`
2. `~/.dotnet/tools/roslyn-language-server`
3. `roslyn-language-server` from `PATH`

The Roslyn sidecar starts lazily when a Roslyn-backed tool first needs it. The plugin shuts down the sidecar for a worktree when opencode emits `server.instance.disposed` for that directory.

Override the command:

```bash
OPENCODE_SHARP_ROSLYN_COMMAND=/path/to/roslyn-language-server
```

Override arguments:

```bash
OPENCODE_SHARP_ROSLYN_ARGS="--stdio --autoLoadProjects --logLevel Information"
```

## Tools

`csharp_diagnostics`

Pulls diagnostics for a C# file from Roslyn. The tool queries Roslyn diagnostic endpoints and returns Roslyn's response without replacing it with `dotnet build` output.

`csharp_workspace_diagnostics`

Pulls solution-wide diagnostics from Roslyn workspace diagnostic endpoints and groups normalized diagnostics by file. If Roslyn returns no workspace diagnostics, the tool returns that response rather than falling back to `dotnet build`.

`csharp_symbol_context`

Returns hover, definition, and document symbols for a C# file position. This is the best first proof tool when inspecting an unknown C# symbol.

`csharp_symbol_locations`

Returns normalized Roslyn symbol locations for a file position. Supported `kind` values are `definition`, `typeDefinition`, and `implementation`; `definition` is the default.

`csharp_workspace_symbols`

Searches C# symbols across the loaded Roslyn workspace using `workspace/symbol` and returns normalized file/position data. The tool does not call `workspaceSymbol/resolve` because the current Roslyn sidecar does not support it.

`csharp_find_references`

Finds references for a symbol position using `textDocument/references`. The `includeDeclaration` argument defaults to `true`.

`csharp_rename_symbol`

Renames a C# symbol through Roslyn semantic rename. By default it returns the Roslyn `WorkspaceEdit`; pass `apply: true` to apply supported edits.

`csharp_code_action`

Lists Roslyn quick fixes and refactorings for a C# file range. Code actions are resolved when possible and include stable IDs for use with `csharp_apply_code_action`.

`csharp_apply_code_action`

Re-fetches Roslyn code actions for a file range, resolves the selected action by ID, applies its workspace edit, and reports changed files. If the selected action is command-only or resolves without an edit, the tool reports that explicitly instead of pretending it applied.

`csharp_apply_workspace_edit`

Applies an LSP `WorkspaceEdit` returned by Roslyn tools and reports changed files plus unsupported operations.

## Known Unsupported Roslyn Methods

The current Roslyn sidecar does not support these LSP methods, so this plugin does not expose tools that depend on them:

- `workspaceSymbol/resolve`
- `textDocument/prepareTypeHierarchy`
- `typeHierarchy/supertypes`
- `typeHierarchy/subtypes`

## What Should Be Implemented

`csharp_format_document`

Format an entire C# file using `textDocument/formatting` and optionally apply the returned text edits.

`csharp_format_range`

Format a selected C# range using `textDocument/rangeFormatting` and optionally apply the returned text edits.

`csharp_folding_ranges`

Return folding ranges using `textDocument/foldingRange` if file-outline workflows need collapsible regions beyond document symbols.
