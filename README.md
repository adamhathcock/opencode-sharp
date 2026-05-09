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

Pulls diagnostics for a C# file from Roslyn. The tool currently queries both public `textDocument/diagnostic` and VS-internal `textdocument/_vs_diagnostic` methods for compiler and analyzer categories.

`csharp_workspace_symbols`

Searches symbols across Roslyn's loaded workspace using `workspace/symbol`. Results depend on the sidecar successfully loading the solution/projects through `--autoLoadProjects`; empty Roslyn results are returned as-is.

`csharp_symbol_locations`

Finds definition-like locations for a C# symbol position using Roslyn. The `kind` argument accepts `definition`, `declaration`, `typeDefinition`, or `all`; line and column inputs are one-based and converted to LSP zero-based positions internally.

`csharp_references`

Finds references for a C# symbol position using Roslyn's `textDocument/references`. The `includeDeclaration` argument defaults to `true`; line and column inputs are one-based and converted to LSP zero-based positions internally.

`csharp_code_actions`

Lists Roslyn code actions for a C# file range. Line and column inputs are one-based for agent friendliness and converted to LSP zero-based positions internally. Returned actions include IDs that can be passed to `csharp_apply_code_action`.

`csharp_apply_code_action`

Resolves and applies a cached code action when Roslyn returns a workspace edit. Command-only actions are reported as unsupported for now.

## Roslyn Feature Priorities

The following Roslyn language-server features are candidates for first-class opencode-sharp tools, prioritized by usefulness to C# developers and ease of implementation in this plugin.

| Priority | Feature                                            | Usefulness                                                                  | Implementation fit                                                                                                                       |
| -------- | -------------------------------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 1        | Go to definition, declaration, and type definition | Core navigation for understanding code quickly.                             | Implemented as `csharp_symbol_locations` using `textDocument/definition`, `textDocument/declaration`, and `textDocument/typeDefinition`. |
| 2        | Find references                                    | Essential before changing APIs, renaming symbols, or deleting code.         | Implemented as `csharp_references` using `textDocument/references`.                                                                      |
| 3        | Rename symbol                                      | High-value Roslyn-backed refactoring with semantic correctness.             | Medium-easy: use `textDocument/prepareRename` and `textDocument/rename`, then apply the returned `WorkspaceEdit`.                        |
| 4        | Hover info                                         | Exposes type information, signatures, XML docs, and nullable context.       | Easy: use `textDocument/hover` and return the raw or lightly normalized hover contents.                                                  |
| 5        | Document symbols                                   | Gives a fast outline of classes, methods, properties, and fields in a file. | Easy: use `textDocument/documentSymbol`; complements the existing workspace symbol search.                                               |
| 6        | Signature help                                     | Useful when editing method calls or generating argument lists.              | Easy-medium: use `textDocument/signatureHelp` with a file position.                                                                      |
| 7        | Implementation lookup                              | Valuable for interfaces, abstract members, and inheritance-heavy code.      | Easy: use `textDocument/implementation`.                                                                                                 |
| 8        | Formatting                                         | Practical cleanup after generated edits.                                    | Medium: use `textDocument/formatting` or `textDocument/rangeFormatting`, then apply returned edits.                                      |
| 9        | Organize imports                                   | Common cleanup after adding, moving, or generating code.                    | Medium-low effort: already available through code actions, but useful as a dedicated convenience tool.                                   |
| 10       | Completion                                         | Useful in editors, but can be noisy for agent workflows.                    | Medium: use `textDocument/completion` and optionally `completionItem/resolve`; needs filtering to be useful.                             |
| 11       | Inlay hints                                        | Helps explain inferred types and parameter names.                           | Medium: use `textDocument/inlayHint`; best as a read-only understanding tool.                                                            |
| 12       | Call hierarchy                                     | Useful for impact analysis and tracing execution flow.                      | Medium: use `textDocument/prepareCallHierarchy`, incoming calls, and outgoing calls.                                                     |
| 13       | Semantic tokens                                    | Mostly editor-facing, with limited direct value as a tool response.         | Medium-hard: useful only if converted into higher-level analysis.                                                                        |
| 14       | Folding and selection ranges                       | Editor convenience features.                                                | Easy but low priority for opencode-sharp.                                                                                                |
| 15       | Document highlights                                | Shows local symbol usage near the cursor.                                   | Easy but mostly superseded by find references.                                                                                           |

Recommended implementation order:

1. Add navigation tools first: definition and references are implemented; hover, document symbols, and implementation lookup remain next candidates.
2. Add refactoring and cleanup tools next: rename, formatting, and organize imports.
3. Add richer analysis tools after that: signature help, inlay hints, and call hierarchy.
4. Treat completion, semantic tokens, folding, selection ranges, and document highlights as lower priority unless a concrete opencode workflow needs them.

Implemented priority 1 and 2 notes:

- `src/tools/position.ts` centralizes one-based tool input conversion to LSP zero-based positions.
- `src/tools/locations.ts` normalizes Roslyn `Location` and `LocationLink` responses into tool-friendly URI, file, and range objects.
- `src/roslyn/client.ts` exposes focused wrappers for definition-like symbol location requests and references.
- `src/index.ts` registers `csharp_symbol_locations` and `csharp_references` without changing existing tool names.

## Source Layout

- `src/index.ts`: opencode plugin entrypoint and tool registration.
- `src/roslyn/`: Roslyn sidecar client, JSON-RPC transport, initialization, diagnostics, document sync, and request handling.
- `src/lsp/`: JSON-RPC/LSP wire types.
- `src/csharp/`: C# domain types used by the plugin.
- `src/tools/`: tool helper logic for code actions, ranges, paths, and workspace edits.
- `src/shared/`: small shared utilities.
- `dist/`: compiled output produced by `bun run build`.

## Notes For Agents

- Keep tool outputs structured and concise.
- Do not add `dotnet build` diagnostics fallbacks unless explicitly requested.
- Prefer surfacing raw Roslyn responses or errors when behavior is unclear.
- Keep files small and split by responsibility using the existing subfolders.
- Run `bun run build` after TypeScript changes.
