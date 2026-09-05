import { assertEquals } from "@std/assert";
import { dirname, fromFileUrl, join, normalize, relative, resolve } from "@std/path";

const root = resolve(fromFileUrl(new URL("..", import.meta.url)));
const sourceRoot = join(root, "src");
const importPattern = /\b(?:import|export)\s+(?:type\s+)?(?:[^"']*?\s+from\s+)?["']([^"']+)["']/g;

async function sourceFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  for await (const entry of Deno.readDir(dir)) {
    const path = join(dir, entry.name);
    if (entry.isDirectory) files.push(...(await sourceFiles(path)));
    else if (entry.isFile && entry.name.endsWith(".ts") && !entry.name.endsWith("_test.ts")) {
      files.push(path);
    }
  }
  return files.sort();
}

function localImports(file: string, source: string): string[] {
  return [...source.matchAll(importPattern)]
    .map((match) => match[1])
    .filter((specifier) => specifier.startsWith("."))
    .map((specifier) => normalize(resolve(dirname(file), specifier)));
}

Deno.test("architecture: internal dependencies follow layer boundaries", async () => {
  const violations: string[] = [];
  for (const file of await sourceFiles(sourceRoot)) {
    const from = relative(sourceRoot, file);
    const imports = localImports(file, await Deno.readTextFile(file));
    for (const target of imports) {
      const to = relative(sourceRoot, target);
      if (from.startsWith("utils/") && /^(core|theme|plugins)\//.test(to)) {
        violations.push(`${from} -> ${to}`);
      }
      if (from.startsWith("plugins/") && /^(core|theme)\//.test(to)) {
        violations.push(`${from} -> ${to}`);
      }
    }
  }
  assertEquals(violations, []);
});

Deno.test("architecture: production module graph has no cycles", async () => {
  const files = await sourceFiles(sourceRoot);
  const fileSet = new Set(files.map(normalize));
  const graph = new Map<string, string[]>();
  for (const file of files) {
    const imports = localImports(file, await Deno.readTextFile(file)).filter((target) =>
      fileSet.has(target),
    );
    graph.set(normalize(file), imports);
  }

  const active = new Set<string>();
  const visited = new Set<string>();
  const cycles: string[] = [];
  const visit = (file: string, path: string[]): void => {
    if (active.has(file)) {
      const start = path.indexOf(file);
      cycles.push(
        [...path.slice(start), file].map((item) => relative(sourceRoot, item)).join(" -> "),
      );
      return;
    }
    if (visited.has(file)) return;
    active.add(file);
    for (const target of graph.get(file) ?? []) visit(target, [...path, file]);
    active.delete(file);
    visited.add(file);
  };
  for (const file of files) visit(file, []);
  assertEquals(cycles, []);
});
