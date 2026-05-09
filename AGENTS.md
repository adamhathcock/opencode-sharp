# opencode-sharp

This repository contains `opencode-sharp`, an opencode plugin that augments opencode's built-in C# LSP support with focused Roslyn-powered tools.

The plugin currently starts its own `roslyn-language-server` sidecar over stdio. It does not use `dotnet build` or CLI fallbacks for semantic results. If Roslyn returns empty diagnostics or no code action, preserve that behavior and make the Roslyn response visible rather than synthesizing results from another source.

## Project Structure

- `src/index.ts` defines the opencode plugin and registers tools.
- `src/roslyn/` contains the Roslyn language-server sidecar client, JSON-RPC connection, initialization, document sync, diagnostics, and server request handling.
- `src/lsp/` contains JSON-RPC/LSP wire types.
- `src/csharp/` contains C# domain types used by tool responses.
- `src/tools/` contains tool-facing helpers for ranges, code actions, paths, and workspace edits.
- `src/shared/` contains small shared utilities.
- `dist/` contains compiled JavaScript and declaration output from TypeScript.
- `package.json` defines the Bun/TypeScript workflow and opencode plugin dependencies.
- `tsconfig.json` compiles TypeScript from `src/` into `dist/` with declarations enabled.

## Plugin Shape

- The main plugin export is `CSharpLspPlugin`.
- The plugin uses `@opencode-ai/plugin` and `tool.schema` for schema-validated tool inputs.
- Tool implementations should return concise JSON strings through the shared `json` helper.
- Tool names should be descriptive and stable once introduced.

## Current Tools

- `csharp_diagnostics`: pulls Roslyn diagnostics for a C# file through public and VS-internal diagnostic LSP requests.
- `csharp_workspace_symbols`: searches Roslyn workspace symbols across loaded C# solutions/projects through `workspace/symbol`.
- `csharp_symbol_locations`: finds definitions, type definitions, and implementations for a C# symbol position.
- `csharp_references`: finds references for a C# symbol position.
- `csharp_hover`: returns hover/type information for a C# file position.
- `csharp_document_symbols`: returns a semantic outline for a C# file.
- `csharp_prepare_rename` and `csharp_rename`: prepare and perform Roslyn semantic rename.
- `csharp_code_actions`: lists Roslyn code actions for a file range and caches returned actions by ID.
- `csharp_apply_code_action`: resolves and applies a cached Roslyn code action when it contains a workspace edit.

## Roslyn Sidecar

- The default command is `roslyn-language-server`.
- If `OPENCODE_SHARP_ROSLYN_COMMAND` is set, use that exact command.
- If no explicit command is set, the plugin first checks `~/.dotnet/tools/roslyn-language-server` before falling back to `PATH` lookup.
- Default arguments are `--stdio --autoLoadProjects`.
- `OPENCODE_SHARP_ROSLYN_ARGS` can override the argument string.
- Keep one Roslyn client per worktree through `src/state.ts`; do not spawn a process per tool call.
- Start Roslyn lazily on first Roslyn-backed tool use and shut down the matching worktree client from the `server.instance.disposed` event hook.

## Development

Default to Bun for JavaScript and TypeScript work in this repository.

- Use `bun install` to install dependencies.
- Use `bun run build` to compile TypeScript.
- Use `bun run dev` to run TypeScript in watch mode.
- Avoid adding Node-specific tooling beyond APIs already used by the plugin unless there is a concrete need.

## Implementation Guidance

- Keep changes small and targeted.
- Preserve the opencode plugin API shape unless the task explicitly requires changing it.
- Prefer adding focused tools over broad, ambiguous tool behavior.
- Keep files under roughly 200 lines when practical; split by responsibility when a file is mixing concerns, not just to satisfy a line count.
- Validate all tool inputs through the plugin schema.
- Return JSON or another predictable structured format from tools when possible.
- Treat this as an augmentation layer for opencode's existing C# LSP support, not a replacement for it.
- Do not add `dotnet build`, `dotnet test`, or other CLI fallbacks to Roslyn-backed tools unless explicitly requested.
- If a Roslyn LSP method is flaky or unavailable, surface the error or raw response instead of hiding it behind a different data source.

## Verification

Run the narrowest relevant check after changes:

- `bun run build` for TypeScript changes.
- For sidecar behavior, use a temporary C# project outside the repo and call the plugin tools directly or through opencode.
- Add or run tests if test coverage is introduced in the future.
