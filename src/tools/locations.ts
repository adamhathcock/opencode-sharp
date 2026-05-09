import { fileURLToPath } from "node:url";
import type {
  Location,
  LocationLink,
  Position,
  Range,
  WorkspaceSymbol,
} from "../csharp/types";
import { isRecord } from "../shared/json";

export type LocationKind = "definition" | "typeDefinition" | "implementation";

export type ToolPosition = {
  line: number;
  column: number;
};

export type NormalizedLocation = {
  uri: string;
  file?: string;
  position?: ToolPosition;
  range?: unknown;
  targetRange?: unknown;
  targetSelectionRange?: unknown;
};

export type NormalizedWorkspaceSymbol = WorkspaceSymbol & {
  file?: string;
  position?: ToolPosition;
};

export function normalizeLocations(response: unknown): NormalizedLocation[] {
  const items = Array.isArray(response)
    ? response
    : response === null || response === undefined
      ? []
      : [response];
  return items.flatMap((item) => normalizeLocation(item));
}

export function normalizeWorkspaceSymbols(
  symbols: WorkspaceSymbol[],
): NormalizedWorkspaceSymbol[] {
  return symbols.map((symbol) => {
    const location: Record<string, unknown> | undefined = isRecord(
      symbol.location,
    )
      ? symbol.location
      : undefined;
    const uri = typeof location?.uri === "string" ? location.uri : undefined;
    const range = location?.["range"];
    return {
      ...symbol,
      file: uri ? uriToFile(uri) : undefined,
      position: rangeStartToToolPosition(range),
    };
  });
}

function normalizeLocation(item: unknown): NormalizedLocation[] {
  if (!isRecord(item)) {
    return [];
  }

  if (typeof item.uri === "string") {
    const location = item as Location;
    return [
      {
        uri: location.uri,
        file: uriToFile(location.uri),
        position: rangeStartToToolPosition(location.range),
        range: location.range,
      },
    ];
  }

  if (typeof item.targetUri === "string") {
    const location = item as LocationLink;
    return [
      {
        uri: location.targetUri,
        file: uriToFile(location.targetUri),
        position: rangeStartToToolPosition(
          location.targetSelectionRange ?? location.targetRange,
        ),
        targetRange: location.targetRange,
        targetSelectionRange: location.targetSelectionRange,
      },
    ];
  }

  return [];
}

export function rangeStartToToolPosition(range: Range | unknown) {
  if (!isRecord(range) || !isPosition(range.start)) {
    return undefined;
  }

  return positionToToolPosition(range.start);
}

export function positionToToolPosition(position: Position): ToolPosition {
  return {
    line: position.line + 1,
    column: position.character + 1,
  };
}

function isPosition(value: unknown): value is Position {
  return (
    isRecord(value) &&
    typeof value.line === "number" &&
    typeof value.character === "number"
  );
}

export function uriToFile(uri: string) {
  try {
    return fileURLToPath(uri);
  } catch {
    return undefined;
  }
}
