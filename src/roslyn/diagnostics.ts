import type { Diagnostic } from "../csharp/types.js";
import { fileURLToPath } from "node:url";
import { isRecord } from "../shared/json.js";
import type { RoslynLspClient } from "./client.js";

export const diagnosticCategories = [
  "syntax",
  "DocumentCompilerSemantic",
  "DocumentAnalyzerSyntax",
  "DocumentAnalyzerSemantic",
];

export async function getDiagnostics(client: RoslynLspClient, file: string) {
  await client.waitForProjectLoad();
  const document = await client.syncDocument(file);
  await client.waitForRoslynOperations([
    "Workspace",
    "SolutionCrawlerLegacy",
    "DiagnosticService",
  ]);

  const reports = [];
  const vsReports = [];
  const diagnostics = [];

  for (const category of diagnosticCategories) {
    const publicReport = await requestPublicDiagnostics(
      client,
      document.uri,
      category,
    );
    reports.push(publicReport.report);
    diagnostics.push(...publicReport.diagnostics);

    const vsReport = await requestVsDiagnostics(client, document.uri, category);
    vsReports.push(vsReport.report);
    diagnostics.push(...vsReport.diagnostics);
  }

  return { reports, vsReports, diagnostics };
}

export async function getWorkspaceDiagnostics(client: RoslynLspClient) {
  await client.waitForProjectLoad();
  await client.waitForRoslynOperations([
    "Workspace",
    "SolutionCrawlerLegacy",
    "DiagnosticService",
  ]);

  const reports = [];
  const vsReports = [];
  const diagnostics = [];

  for (const category of diagnosticCategories) {
    const publicReport = await requestPublicWorkspaceDiagnostics(
      client,
      category,
    );
    reports.push(publicReport.report);
    diagnostics.push(...publicReport.diagnostics);

    const vsReport = await requestVsWorkspaceDiagnostics(client, category);
    vsReports.push(vsReport.report);
    diagnostics.push(...vsReport.diagnostics);
  }

  return {
    reports,
    vsReports,
    diagnostics,
    diagnosticsByFile: groupDiagnosticsByFile(diagnostics),
  };
}

async function requestPublicDiagnostics(
  client: RoslynLspClient,
  uri: string,
  category: string,
) {
  try {
    const response = await client.request("textDocument/diagnostic", {
      textDocument: { uri },
      identifier: category,
    });
    const items =
      isRecord(response) && Array.isArray(response.items) ? response.items : [];
    return {
      report: { category, response },
      diagnostics: items.map((diagnostic) =>
        withCategory(category, diagnostic),
      ),
    };
  } catch (error) {
    return {
      report: { category, error: getErrorMessage(error) },
      diagnostics: [],
    };
  }
}

async function requestVsDiagnostics(
  client: RoslynLspClient,
  uri: string,
  category: string,
) {
  try {
    const response = await client.request("textdocument/_vs_diagnostic", {
      _vs_textDocument: { uri },
      _vs_queryingDiagnosticKind: category,
    });
    const diagnostics = getReportDiagnostics(response).map((diagnostic) =>
      withCategory(category, diagnostic),
    );
    return { report: { category, response }, diagnostics };
  } catch (error) {
    return {
      report: { category, error: getErrorMessage(error) },
      diagnostics: [],
    };
  }
}

async function requestPublicWorkspaceDiagnostics(
  client: RoslynLspClient,
  category: string,
) {
  try {
    const response = await client.request("workspace/diagnostic", {
      identifier: category,
      previousResultIds: [],
    });
    return {
      report: { category, response },
      diagnostics: getWorkspaceReportDiagnostics(response).map((diagnostic) =>
        withWorkspaceCategory(category, diagnostic.uri, diagnostic.item),
      ),
    };
  } catch (error) {
    return {
      report: { category, error: getErrorMessage(error) },
      diagnostics: [],
    };
  }
}

async function requestVsWorkspaceDiagnostics(
  client: RoslynLspClient,
  category: string,
) {
  try {
    const response = await client.request("workspace/_vs_diagnostic", {
      _vs_queryingDiagnosticKind: category,
    });
    return {
      report: { category, response },
      diagnostics: getVsWorkspaceReportDiagnostics(response).map((diagnostic) =>
        withWorkspaceCategory(category, diagnostic.uri, diagnostic.item),
      ),
    };
  } catch (error) {
    return {
      report: { category, error: getErrorMessage(error) },
      diagnostics: [],
    };
  }
}

function getReportDiagnostics(response: unknown) {
  if (!Array.isArray(response)) {
    return [];
  }

  return response.flatMap((report) => {
    if (!isRecord(report)) {
      return [];
    }

    if (Array.isArray(report.diagnostics)) {
      return report.diagnostics;
    }

    return Array.isArray(report._vs_diagnostics) ? report._vs_diagnostics : [];
  });
}

function getWorkspaceReportDiagnostics(response: unknown) {
  if (!isRecord(response) || !Array.isArray(response.items)) {
    return [];
  }

  return response.items.flatMap((report) => {
    if (!isRecord(report) || typeof report.uri !== "string") {
      return [];
    }

    const items = Array.isArray(report.items) ? report.items : [];
    return items.map((item) => ({ uri: report.uri as string, item }));
  });
}

function getVsWorkspaceReportDiagnostics(response: unknown) {
  if (!Array.isArray(response)) {
    return [];
  }

  return response.flatMap((report) => {
    if (!isRecord(report)) {
      return [];
    }

    const uri = getReportUri(report);
    if (!uri) {
      return [];
    }

    const diagnostics = Array.isArray(report.diagnostics)
      ? report.diagnostics
      : Array.isArray(report._vs_diagnostics)
        ? report._vs_diagnostics
        : [];
    return diagnostics.map((item) => ({ uri, item }));
  });
}

function getReportUri(report: Record<string, unknown>) {
  if (typeof report.uri === "string") {
    return report.uri;
  }

  if (
    isRecord(report.textDocument) &&
    typeof report.textDocument.uri === "string"
  ) {
    return report.textDocument.uri;
  }

  if (
    isRecord(report._vs_textDocument) &&
    typeof report._vs_textDocument.uri === "string"
  ) {
    return report._vs_textDocument.uri;
  }

  return undefined;
}

function withCategory(category: string, diagnostic: unknown) {
  return { category, ...(diagnostic as Diagnostic) };
}

function withWorkspaceCategory(
  category: string,
  uri: string,
  diagnostic: unknown,
) {
  return {
    uri,
    file: uriToFile(uri),
    category,
    ...(diagnostic as Diagnostic),
  };
}

function groupDiagnosticsByFile(
  diagnostics: Array<
    { file?: string; uri: string; category: string } & Diagnostic
  >,
) {
  const byFile: Record<string, typeof diagnostics> = {};
  for (const diagnostic of diagnostics) {
    const key = diagnostic.file ?? diagnostic.uri;
    byFile[key] = byFile[key] ?? [];
    byFile[key].push(diagnostic);
  }

  return byFile;
}

function uriToFile(uri: string) {
  try {
    return fileURLToPath(uri);
  } catch {
    return undefined;
  }
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
