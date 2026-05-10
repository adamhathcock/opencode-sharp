import type { Diagnostic, Range } from "../csharp/types";

type Request = (method: string, params: unknown) => Promise<unknown>;
type Wait = (operations: string[]) => Promise<void>;

const operations = [
  "Workspace",
  "SolutionCrawlerLegacy",
  "DiagnosticService",
  "LightBulb",
];

export async function getStableCodeActions(
  uri: string,
  range: Range,
  request: Request,
  wait: Wait,
  options: { diagnostics?: Diagnostic[]; only?: string[] } = {},
) {
  await wait(operations);
  let previousSignature: string | undefined;
  let latest: unknown[] = [];
  const stableAfter = Date.now() + 2500;
  const deadline = Date.now() + 5000;

  do {
    await wait(operations);
    latest = await requestCodeActions(uri, range, request, options);
    const signature = getCodeActionSignature(latest);
    if (Date.now() >= stableAfter && signature === previousSignature) {
      return latest;
    }

    previousSignature = signature;
    await delay(250);
  } while (Date.now() < deadline);

  return latest;
}

async function requestCodeActions(
  uri: string,
  range: Range,
  request: Request,
  options: { diagnostics?: Diagnostic[]; only?: string[] },
) {
  const response = await request("textDocument/codeAction", {
    textDocument: { uri },
    range,
    context: {
      diagnostics: options.diagnostics ?? [],
      ...(options.only ? { only: options.only } : {}),
    },
  });

  return Array.isArray(response) ? response : [];
}

function getCodeActionSignature(actions: unknown[]) {
  return JSON.stringify(
    actions.map((action) => {
      if (typeof action !== "object" || action === null) {
        return action;
      }

      const candidate = action as {
        title?: unknown;
        kind?: unknown;
        command?: unknown;
      };
      return {
        title: candidate.title,
        kind: candidate.kind,
        hasCommand: candidate.command !== undefined,
      };
    }),
  );
}

async function delay(milliseconds: number) {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}
