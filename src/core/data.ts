import { join, relative } from "@std/path";
import { parse as parseYaml } from "@std/yaml";
import { parse as parseToml } from "@std/toml";
import { DiagnosticBag } from "./diagnostics.ts";
import { errorMessage } from "../utils/text.ts";

export type DataMap = Record<string, unknown>;

function setNestedKey(obj: DataMap, keys: string[], value: unknown): void {
  let current = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (!current[keys[i]] || typeof current[keys[i]] !== "object") {
      current[keys[i]] = {};
    }
    current = current[keys[i]] as DataMap;
  }
  current[keys[keys.length - 1]] = value;
}

function parseDataFile(filePath: string, content: string): unknown {
  if (filePath.endsWith(".json")) {
    return JSON.parse(content);
  } else if (filePath.endsWith(".yaml") || filePath.endsWith(".yml")) {
    return parseYaml(content);
  } else if (filePath.endsWith(".toml")) {
    return parseToml(content);
  }
  return null;
}

async function scanDataDir(
  currentDir: string,
  dataDir: string,
  result: DataMap,
  diagnostics: DiagnosticBag,
): Promise<void> {
  const entries: Deno.DirEntry[] = [];
  try {
    for await (const entry of Deno.readDir(currentDir)) entries.push(entry);
  } catch {
    return;
  }
  entries.sort((left, right) => left.name.localeCompare(right.name));

  for (const entry of entries) {
    const fullPath = join(currentDir, entry.name);

    if (entry.isDirectory) {
      await scanDataDir(fullPath, dataDir, result, diagnostics);
      continue;
    }

    if (!entry.isFile) continue;

    const supported = [".json", ".yaml", ".yml", ".toml"];
    if (!supported.some((ext) => entry.name.endsWith(ext))) continue;

    let content: string;
    try {
      content = await Deno.readTextFile(fullPath);
    } catch (err) {
      diagnostics.add({
        code: "data-file-invalid",
        severity: "error",
        message: `Failed to read data file: ${errorMessage(err)}`,
        file: fullPath,
      });
      continue;
    }

    let parsed: unknown;
    try {
      parsed = parseDataFile(fullPath, content);
    } catch (err) {
      diagnostics.add({
        code: "data-file-invalid",
        severity: "error",
        message: `Failed to parse data file: ${errorMessage(err)}`,
        file: fullPath,
        hint: "Check the file's JSON/YAML/TOML syntax.",
      });
      continue;
    }

    if (parsed === null) continue;

    // Build nested key path from relative path
    // e.g. _data/blog/authors.json → ["blog", "authors"]
    const rel = relative(dataDir, fullPath);
    const keys = rel
      .replace(/\\/g, "/")
      .replace(/\.(json|yaml|yml|toml)$/, "")
      .split("/");

    setNestedKey(result, keys, parsed);
  }
}

/**
 * Loads all data files from `<contentDir>/_data/` and returns them
 * as a nested object keyed by their relative path without extension.
 *
 * @example
 * // content/_data/team.json → data.team
 * // content/_data/blog/authors.yaml → data.blog.authors
 */
export async function loadDataFiles(
  contentDir: string,
  diagnostics: DiagnosticBag = new DiagnosticBag(),
): Promise<DataMap> {
  const dataDir = join(contentDir, "_data");
  const result: DataMap = {};
  await scanDataDir(dataDir, dataDir, result, diagnostics);
  return result;
}

/**
 * Returns the path to the _data directory for a given content directory.
 * Used by the dev server to watch for changes.
 */
export function getDataDir(contentDir: string): string {
  return join(contentDir, "_data");
}
