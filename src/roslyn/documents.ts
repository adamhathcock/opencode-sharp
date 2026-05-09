import { promises as fs } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { OpenDocument } from "../csharp/types";

type Notify = (method: string, params: unknown) => void;

export class DocumentStore {
  private openDocuments = new Map<string, OpenDocument>();

  constructor(private readonly notify: Notify) {}

  get size() {
    return this.openDocuments.size;
  }

  clear() {
    this.openDocuments.clear();
  }

  async sync(file: string) {
    const absolute = path.resolve(file);
    const uri = pathToFileURL(absolute).toString();
    const text = await fs.readFile(absolute, "utf8");
    const existing = this.openDocuments.get(uri);

    if (!existing) {
      const document = { uri, text, version: 1 };
      this.openDocuments.set(uri, document);
      this.notify("textDocument/didOpen", {
        textDocument: {
          uri,
          languageId: "csharp",
          version: document.version,
          text,
        },
      });
      return document;
    }

    if (existing.text !== text) {
      existing.text = text;
      existing.version += 1;
      this.notify("textDocument/didClose", { textDocument: { uri } });
      this.notify("textDocument/didOpen", {
        textDocument: {
          uri,
          languageId: "csharp",
          version: existing.version,
          text,
        },
      });
    }

    return existing;
  }
}
