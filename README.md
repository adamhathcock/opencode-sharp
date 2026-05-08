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

Use the TUI sidebar plugin from TUI config:

```json
{
  "$schema": "https://opencode.ai/tui.json",
  "plugin": ["opencode-sharp/tui"]
}
```

The TUI plugin reads the latest status snapshot written by the server plugin and renders it in the session sidebar. The server plugin refreshes that snapshot when `csharp_lsp_status` runs and after each incoming chat message.

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

Override the command:

```bash
OPENCODE_SHARP_ROSLYN_COMMAND=/path/to/roslyn-language-server
```

Override arguments:

```bash
OPENCODE_SHARP_ROSLYN_ARGS="--stdio --autoLoadProjects --logLevel Information"
```

## Tools

`csharp_lsp_status`

Returns sidecar status, including whether the Roslyn process is running, open document count, recent log messages, stderr, last exit info, and recent tool/LSP usage. It also writes the status snapshot consumed by the TUI sidebar plugin.

`csharp_lsp_shutdown`

Shuts down all Roslyn sidecars managed by the plugin and clears cached code actions.

`csharp_diagnostics`

Pulls diagnostics for a C# file from Roslyn. The tool currently queries both public `textDocument/diagnostic` and VS-internal `textdocument/_vs_diagnostic` methods for compiler and analyzer categories.

`csharp_code_actions`

Lists Roslyn code actions for a C# file range. Line and column inputs are one-based for agent friendliness and converted to LSP zero-based positions internally. Returned actions include IDs that can be passed to `csharp_apply_code_action`.

`csharp_apply_code_action`

Resolves and applies a cached code action when Roslyn returns a workspace edit. Command-only actions are reported as unsupported for now.

## Source Layout

- `src/index.ts`: opencode plugin entrypoint and tool registration.
- `src/tui.tsx`: TUI plugin entrypoint for the sidebar status panel.
- `src/roslyn/`: Roslyn sidecar client, JSON-RPC transport, initialization, diagnostics, document sync, and request handling.
- `src/lsp/`: JSON-RPC/LSP wire types.
- `src/csharp/`: C# domain types used by the plugin.
- `src/status/`: status snapshot persistence shared by the server and TUI plugins.
- `src/tools/`: tool helper logic for code actions, ranges, paths, and workspace edits.
- `src/usage/`: in-memory usage tracking for plugin tools and Roslyn LSP methods.
- `src/shared/`: small shared utilities.
- `dist/`: compiled output produced by `bun run build`.

## Notes For Agents

- Keep tool outputs structured and concise.
- Do not add `dotnet build` diagnostics fallbacks unless explicitly requested.
- Prefer surfacing raw Roslyn responses or errors when behavior is unclear.
- Keep files small and split by responsibility using the existing subfolders.
- Run `bun run build` after TypeScript changes.
