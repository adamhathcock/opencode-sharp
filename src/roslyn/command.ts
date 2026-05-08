import { promises as fs } from "node:fs";
import path from "node:path";

export async function getRoslynCommand() {
  if (process.env.OPENCODE_SHARP_ROSLYN_COMMAND) {
    return process.env.OPENCODE_SHARP_ROSLYN_COMMAND;
  }

  const home = process.env.HOME || process.env.USERPROFILE;
  if (home) {
    const executable = process.platform === "win32" ? "roslyn-language-server.exe" : "roslyn-language-server";
    const candidate = path.join(home, ".dotnet", "tools", executable);
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // Fall through to PATH lookup.
    }
  }

  return "roslyn-language-server";
}
