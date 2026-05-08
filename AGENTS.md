# opencode-sharp

This repository contains `opencode-sharp`, an opencode plugin that complements opencode's built-in C# LSP support.

The plugin extends opencode with additional LSP-oriented tools for understanding C# projects more deeply than the default C# language server integration alone. Its goal is to expose focused tool calls that help agents inspect C# symbols, source locations, and related context while working in C# codebases.

## Project Structure

- `src/index.ts` contains the plugin implementation and default export.
- `dist/` contains compiled JavaScript and declaration output from TypeScript.
- `package.json` defines the Bun/TypeScript workflow and opencode plugin dependencies.
- `tsconfig.json` compiles TypeScript from `src/` into `dist/` with declarations enabled.

## Plugin Shape

- The main plugin export is `CSharpLspPlugin`.
- The plugin uses `@opencode-ai/plugin` to define opencode tools.
- Tool arguments should be schema-validated with `tool.schema`.
- Tool implementations should return concise, structured results that are useful to an agent consuming the tool output.

## Development

Default to Bun for JavaScript and TypeScript work in this repository.

- Use `bun install` to install dependencies.
- Use `bun run build` to compile TypeScript.
- Use `bun run dev` to run TypeScript in watch mode.
- Avoid adding Node-specific tooling unless there is a concrete need.

## Implementation Guidance

- Keep changes small and targeted.
- Preserve the opencode plugin API shape unless the task explicitly requires changing it.
- Prefer adding focused tools over broad, ambiguous tool behavior.
- Keep tool names descriptive and stable once introduced.
- Validate all tool inputs through the plugin schema.
- Return JSON or another predictable structured format from tools when possible.
- Treat this as an augmentation layer for opencode's existing C# LSP support, not a replacement for it.

## Verification

Run the narrowest relevant check after changes:

- `bun run build` for TypeScript changes.
- Add or run tests if test coverage is introduced in the future.
