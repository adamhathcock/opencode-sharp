import { fileURLToPath } from "node:url";
import type { Location, LocationLink } from "../csharp/types";
import { isRecord } from "../shared/json";

export type LocationKind = "definition" | "declaration" | "typeDefinition";

export type NormalizedLocation = {
  uri: string;
  file?: string;
  range?: unknown;
  targetRange?: unknown;
  targetSelectionRange?: unknown;
};

export function normalizeLocations(response: unknown): NormalizedLocation[] {
  const items = Array.isArray(response) ? response : response === null || response === undefined ? [] : [response];
  return items.flatMap((item) => normalizeLocation(item));
}

function normalizeLocation(item: unknown): NormalizedLocation[] {
  if (!isRecord(item)) {
    return [];
  }

  if (typeof item.uri === "string") {
    const location = item as Location;
    return [{ uri: location.uri, file: uriToFile(location.uri), range: location.range }];
  }

  if (typeof item.targetUri === "string") {
    const location = item as LocationLink;
    return [{
      uri: location.targetUri,
      file: uriToFile(location.targetUri),
      targetRange: location.targetRange,
      targetSelectionRange: location.targetSelectionRange
    }];
  }

  return [];
}

function uriToFile(uri: string) {
  try {
    return fileURLToPath(uri);
  } catch {
    return undefined;
  }
}
