import { join, relative } from "@std/path";
import { parse as parseYaml } from "@std/yaml";
import { parse as parseToml } from "@std/toml";

export type DataMap = Record<string, unknown>;

function setNestedKey(
  obj: DataMap,
  keys: string[],
  value: unknown,
): void {
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

function scanDataDir(
  currentDir: string,
  dataDir: string,
  result: DataMap,
): void {
  let entries: Deno.DirEntry[];
  try {
    entries = [...Deno.readDirSync(currentDir)];
  } catch {
    return;
  }

  for (const entry of entries) {
    const fullPath = join(currentDir, entry.name);

    if (entry.isDirectory) {
      scanDataDir(fullPath, dataDir, result);
      continue;
    }

    if (!entry.isFile) continue;

    const supported = [".json", ".yaml", ".yml", ".toml"];
    if (!supported.some((ext) => entry.name.endsWith(ext))) continue;

    let content: string;
    try {
      content = Deno.readTextFileSync(fullPath);
    } catch (err) {
      console.warn(`[data] Failed to read "${fullPath}":`, err);
      continue;
    }

    let parsed: unknown;
    try {
      parsed = parseDataFile(fullPath, content);
    } catch (err) {
      console.warn(`[data] Failed to parse "${fullPath}":`, err);
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
export function loadDataFiles(contentDir: string): DataMap {
  const dataDir = join(contentDir, "_data");
  const result: DataMap = {};
  scanDataDir(dataDir, dataDir, result);
  return result;
}

/**
 * Returns the path to the _data directory for a given content directory.
 * Used by the dev server to watch for changes.
 */
export function getDataDir(contentDir: string): string {
  return join(contentDir, "_data");
}
