export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function json(value: unknown) {
  return JSON.stringify(value, null, 2);
}
