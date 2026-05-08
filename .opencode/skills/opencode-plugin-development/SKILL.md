---
name: opencode-plugin-development
description: Guidance for developing OpenCode plugins, hooks, tools, events, skills, and C# Roslyn tool routing in this project.
compatibility: opencode
---

## When To Use

Use this skill when changing this repository's OpenCode plugin, adding plugin tools or hooks, updating status/TUI behavior, or deciding how C# requests should route between opencode-sharp and built-in OpenCode features.

## Plugin Shape

- Server plugin entrypoint is `src/index.ts` and exports `CSharpLspPlugin`.
- TUI plugin entrypoint is `src/tui.tsx` and should only read status snapshots; it must not call Roslyn directly.
- Use `@opencode-ai/plugin` and `tool.schema` for custom tool definitions.
- Tool outputs should stay concise and structured, usually through the shared `json` helper.

## Useful Hooks

- Use `event` for OpenCode events such as `file.edited`, `file.watcher.updated`, `message.part.updated`, `lsp.client.diagnostics`, and `server.instance.disposed`.
- Use `chat.message` for lightweight refresh work after incoming messages.
- Use `tool.execute.after` for observing successful built-in tool usage, such as preloading Roslyn after a `.cs` file is read.
- Use `tool.definition` to amend descriptions sent to the model and encourage preferred tools.
- Use `experimental.chat.system.transform` for short system guidance that helps route model behavior.

## C# Routing Rules

- Prefer opencode-sharp Roslyn-backed tools for `.cs` semantic work over built-in or generic LSP tools.
- Use `csharp_diagnostics` for C# diagnostics.
- Use `csharp_symbol_locations` for definitions, declarations, and type definitions.
- Use `csharp_references` for references.
- Use `csharp_workspace_symbols` for C# workspace symbol searches.
- Use `csharp_code_actions` and then `csharp_apply_code_action` for Roslyn fixes and refactorings.
- Do not hard-block built-in tools by default; encourage the plugin through tool descriptions and system guidance.

## Roslyn Constraints

- Keep one Roslyn client per worktree through `src/state.ts`.
- Do not spawn a Roslyn process per tool call.
- Do not add `dotnet build`, `dotnet test`, or CLI fallbacks for semantic results unless explicitly requested.
- If Roslyn returns empty diagnostics, no code actions, or an error, surface that Roslyn response instead of synthesizing results from another source.
- Wait for Roslyn operations when semantic freshness matters, especially `Workspace`, `SolutionCrawlerLegacy`, and `DiagnosticService`.

## Skill Rules

- Project-local skills live at `.opencode/skills/<name>/SKILL.md`.
- Skill names must be lowercase alphanumeric with single hyphen separators and match the directory name.
- Required frontmatter fields are `name` and `description`.
- Keep skill content operational and repo-specific so agents load it only when it helps.

## Verification

- Run `bun run build` after TypeScript changes.
- For Roslyn behavior, test with a temporary C# project outside this repo when practical.
- Check `csharp_lsp_status` or the TUI sidebar to confirm Roslyn initialization, open document count, and usage tracking.
