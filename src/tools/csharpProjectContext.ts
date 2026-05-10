import { tool } from "@opencode-ai/plugin";
import { promises as fs } from "node:fs";
import path from "node:path";
import { json } from "../shared/json.js";
import { resolveWorkspacePath } from "./paths.js";

export const csharpProjectContextTool: any = tool({
  description:
    "Return C# project context including target frameworks, nullable, implicit usings, references, packages, and analyzer config files.",
  args: {
    file: tool.schema.string().optional(),
    project: tool.schema.string().optional(),
  },
  async execute(args, context) {
    const root = context.worktree || context.directory;
    const projectFile = await resolveProjectFile(
      root,
      args.file,
      args.project,
      context,
    );
    const projectText = await fs.readFile(projectFile, "utf8");
    const projectDirectory = path.dirname(projectFile);
    const assets = await readJsonIfExists(
      path.join(projectDirectory, "obj", "project.assets.json"),
    );

    return json({
      ok: true,
      projectFile,
      sdk: getProjectSdk(projectText),
      targetFrameworks: getTargetFrameworks(projectText),
      nullable: getProperty(projectText, "Nullable"),
      implicitUsings: getProperty(projectText, "ImplicitUsings"),
      languageVersion: getProperty(projectText, "LangVersion"),
      packageReferences: getItemReferences(projectText, "PackageReference"),
      projectReferences: getItemReferences(projectText, "ProjectReference").map(
        (reference) => ({
          ...reference,
          file: reference.include
            ? path.resolve(projectDirectory, reference.include)
            : undefined,
        }),
      ),
      analyzerReferences: getItemReferences(projectText, "Analyzer"),
      analyzerConfigFiles: await getAnalyzerConfigFiles(projectDirectory),
      assets: summarizeAssets(assets),
      limitations: [
        "Static project-file inspection only; no full MSBuild evaluation is performed.",
        "Generated obj assets are summarized only when they already exist on disk.",
      ],
    });
  },
});

async function resolveProjectFile(
  root: string,
  file: string | undefined,
  project: string | undefined,
  context: Parameters<typeof resolveWorkspacePath>[0],
) {
  if (project) {
    const resolved = resolveWorkspacePath(context, project);
    const stat = await fs.stat(resolved);
    return stat.isDirectory() ? await findSingleProject(resolved) : resolved;
  }

  if (file) {
    return await findNearestProject(
      path.dirname(resolveWorkspacePath(context, file)),
      root,
    );
  }

  return await findSingleProject(root);
}

async function findSingleProject(directory: string) {
  const projects = await listFiles(directory, (name) =>
    name.endsWith(".csproj"),
  );
  if (projects.length !== 1) {
    throw new Error(
      `Expected exactly one .csproj under ${directory}, found ${projects.length}.`,
    );
  }

  return projects[0];
}

async function findNearestProject(start: string, root: string) {
  let current = start;
  while (current.startsWith(root)) {
    const projects = (await fs.readdir(current)).filter((name) =>
      name.endsWith(".csproj"),
    );
    if (projects.length > 0) {
      return path.join(current, projects[0]);
    }

    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }

  throw new Error(`No .csproj found from ${start} up to ${root}.`);
}

function getProjectSdk(projectText: string) {
  return /<Project\s+[^>]*Sdk="([^"]+)"/i.exec(projectText)?.[1];
}

function getTargetFrameworks(projectText: string) {
  const plural = getProperty(projectText, "TargetFrameworks");
  if (plural) {
    return plural
      .split(";")
      .map((value) => value.trim())
      .filter(Boolean);
  }

  const single = getProperty(projectText, "TargetFramework");
  return single ? [single] : [];
}

function getProperty(projectText: string, name: string) {
  const match = new RegExp(`<${name}>([\\s\\S]*?)</${name}>`, "i").exec(
    projectText,
  );
  return match ? unescapeXml(match[1].trim()) : undefined;
}

function getItemReferences(projectText: string, name: string) {
  const references = [];
  const pattern = new RegExp(
    `<${name}\\s+([^>]*)>(?:[\\s\\S]*?</${name}>)?`,
    "gi",
  );
  for (const match of projectText.matchAll(pattern)) {
    const attributes = getAttributes(match[1]);
    references.push({
      include: attributes.Include,
      version: attributes.Version,
      attributes,
    });
  }

  return references;
}

function getAttributes(text: string) {
  const attributes: Record<string, string> = {};
  for (const match of text.matchAll(/([A-Za-z0-9_.:-]+)="([^"]*)"/g)) {
    attributes[match[1]] = unescapeXml(match[2]);
  }

  return attributes;
}

async function getAnalyzerConfigFiles(projectDirectory: string) {
  const files = await listFiles(
    projectDirectory,
    (name) =>
      name === ".editorconfig" ||
      name.endsWith(".globalconfig") ||
      name.endsWith(".editorconfig"),
  );
  return files.filter((file) => !file.includes(`${path.sep}bin${path.sep}`));
}

async function listFiles(
  directory: string,
  matches: (name: string) => boolean,
): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "bin" || entry.name.startsWith(".")) {
        continue;
      }
      files.push(...(await listFiles(fullPath, matches)));
    } else if (entry.isFile() && matches(entry.name)) {
      files.push(fullPath);
    }
  }

  return files.sort();
}

async function readJsonIfExists(file: string) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as Record<
      string,
      unknown
    >;
  } catch {
    return undefined;
  }
}

function summarizeAssets(assets: Record<string, unknown> | undefined) {
  if (!assets) {
    return undefined;
  }

  return {
    version: assets.version,
    projectFileDependencyGroups: assets.projectFileDependencyGroups,
    packageFolders: assets.packageFolders,
  };
}

function unescapeXml(value: string) {
  return value
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}
