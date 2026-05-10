import { isRecord } from "../shared/json.js";

export function getConfigurationValue(item: unknown) {
  const section =
    isRecord(item) && typeof item.section === "string" ? item.section : "";

  if (
    section.endsWith("background_analysis.dotnet_analyzer_diagnostics_scope")
  ) {
    return "FullSolution";
  }

  if (
    section.endsWith("background_analysis.dotnet_compiler_diagnostics_scope")
  ) {
    return "FullSolution";
  }

  if (section.endsWith("projects.dotnet_enable_automatic_restore")) {
    return "true";
  }

  return null;
}
