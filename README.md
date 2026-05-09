# opencode-sharp

`opencode-sharp` is an opencode plugin that adds focused C# tools backed by `roslyn-language-server`.

opencode already has built-in C# LSP support. This plugin is intended to expose Roslyn capabilities that are not currently convenient as first-class opencode tools, such as Roslyn diagnostic pulls and code actions.

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

Requests workspace diagnostics through `workspace/diagnostic` when Roslyn supports it. Unsupported-method errors are returned as tool errors.

`csharp_workspace_symbols`

Searches symbols across Roslyn's loaded workspace using `workspace/symbol`. Results depend on the sidecar successfully loading the solution or projects.

`csharp_symbol_locations`

Finds symbol locations from a C# file position. The `kind` argument accepts `definition`, `typeDefinition`, `implementation`, or `all`.

`csharp_references`

Finds references for a symbol position using `textDocument/references`. The `includeDeclaration` argument defaults to `true`.

`csharp_hover`

Returns hover/type information for a C# file position, including the Roslyn hover payload.

`csharp_document_symbols`

Returns a semantic outline for a C# file using `textDocument/documentSymbol`.

`csharp_prepare_rename`

Checks whether Roslyn can rename the symbol at a C# file position.

`csharp_rename`

Renames a C# symbol through Roslyn semantic rename. By default it returns the Roslyn `WorkspaceEdit`; pass `apply: true` to apply supported edits.

`csharp_code_actions`

Lists Roslyn quick fixes and refactorings for a C# file range. Returned actions include IDs for `csharp_apply_code_action`.

`csharp_apply_code_action`

Resolves and applies a cached code action when Roslyn returns a workspace edit. Command-only actions are reported as unsupported.

`csharp_organize_imports`

Finds Roslyn's `source.organizeImports` code action for a C# file. By default it returns the matching action summary; pass `apply: true` to apply it.

`csharp_signature_help`

Returns Roslyn signature help at a C# file position, including active signature and parameter information when available.

`csharp_inlay_hints`

Returns Roslyn inlay hints for a C# file or optional range, including inferred type and parameter-name hints when available.

`csharp_completion`

Returns compact Roslyn completion results at a C# file position. Use `maxResults` to limit output size and `triggerCharacter` for trigger-character completion.

## What Should Be Implemented

`csharp_format_document`

Format an entire C# file using `textDocument/formatting` and optionally apply the returned text edits.

`csharp_format_range`

Format a selected C# range using `textDocument/rangeFormatting` and optionally apply the returned text edits.

`csharp_document_highlights`

Return local symbol highlights near a C# file position using `textDocument/documentHighlight`. This is lower priority than references but useful for local reasoning.

`csharp_selection_ranges`

Return syntax-aware selection ranges using `textDocument/selectionRange` if a concrete opencode workflow needs structured expansion around a cursor position.

`csharp_folding_ranges`

Return folding ranges using `textDocument/foldingRange` if file-outline workflows need collapsible regions beyond document symbols.

`csharp_semantic_tokens`

Expose semantic token data only if it is converted into higher-level, tool-friendly analysis. Raw semantic tokens are mostly editor-facing.

`csharp_call_hierarchy`

Revisit call hierarchy if the Roslyn server exposes `textDocument/prepareCallHierarchy`. It has not been available in the tested server behavior.
