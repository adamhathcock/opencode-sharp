import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";

export type StatusSnapshot = {
  updatedAt: string;
  root: string;
  status: unknown;
};

export async function writeStatusSnapshot(root: string, status: unknown) {
  const file = snapshotPath(root);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify({ updatedAt: new Date().toISOString(), root, status }, null, 2), "utf8");
}

export async function readStatusSnapshot(root: string) {
  try {
    return JSON.parse(await fs.readFile(snapshotPath(root), "utf8")) as StatusSnapshot;
  } catch {
    return undefined;
  }
}

function snapshotPath(root: string) {
  const hash = createHash("sha256").update(path.resolve(root)).digest("hex").slice(0, 16);
  return path.join(os.tmpdir(), "opencode-sharp", `${hash}.json`);
}
