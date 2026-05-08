import path from "node:path";

export function isCSharpFile(file: string | undefined): file is string {
  return typeof file === "string" && path.extname(file).toLowerCase() === ".cs";
}

export function resolveRootPath(root: string, file: string) {
  return path.isAbsolute(file) ? file : path.resolve(root, file);
}
