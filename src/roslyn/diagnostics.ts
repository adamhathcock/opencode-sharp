import type { Diagnostic } from "../csharp/types";
import { isRecord } from "../shared/json";
import type { RoslynLspClient } from "./client";

export const diagnosticCategories = [
  "syntax",
  "DocumentCompilerSemantic",
  "DocumentAnalyzerSyntax",
  "DocumentAnalyzerSemantic"
];

export async function getDiagnostics(client: RoslynLspClient, file: string) {
  const document = await client.syncDocument(file);
  await client.waitForRoslynOperations(["Workspace", "SolutionCrawlerLegacy", "DiagnosticService"]);

  const reports = [];
  const vsReports = [];
  const diagnostics = [];

  for (const category of diagnosticCategories) {
    const publicReport = await requestPublicDiagnostics(client, document.uri, category);
    reports.push(publicReport.report);
    diagnostics.push(...publicReport.diagnostics);

    const vsReport = await requestVsDiagnostics(client, document.uri, category);
    vsReports.push(vsReport.report);
    diagnostics.push(...vsReport.diagnostics);
  }

  return { reports, vsReports, diagnostics };
}

async function requestPublicDiagnostics(client: RoslynLspClient, uri: string, category: string) {
  try {
    const response = await client.request("textDocument/diagnostic", {
      textDocument: { uri },
      identifier: category
    });
    const items = isRecord(response) && Array.isArray(response.items) ? response.items : [];
    return { report: { category, response }, diagnostics: items.map((diagnostic) => withCategory(category, diagnostic)) };
  } catch (error) {
    return { report: { category, error: getErrorMessage(error) }, diagnostics: [] };
  }
}

async function requestVsDiagnostics(client: RoslynLspClient, uri: string, category: string) {
  try {
    const response = await client.request("textdocument/_vs_diagnostic", {
      _vs_textDocument: { uri },
      _vs_queryingDiagnosticKind: category
    });
    const diagnostics = getReportDiagnostics(response).map((diagnostic) => withCategory(category, diagnostic));
    return { report: { category, response }, diagnostics };
  } catch (error) {
    return { report: { category, error: getErrorMessage(error) }, diagnostics: [] };
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

function withCategory(category: string, diagnostic: unknown) {
  return { category, ...diagnostic as Diagnostic };
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
