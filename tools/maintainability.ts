import { fromFileUrl, join, relative, resolve } from "@std/path";

const root = resolve(fromFileUrl(new URL("..", import.meta.url)));
const roots = [join(root, "src"), join(root, "packages/init/src")];
const warningLines = 600;
const maximumLines = 900;

async function productionFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  for await (const entry of Deno.readDir(dir)) {
    const path = join(dir, entry.name);
    if (entry.isDirectory) files.push(...(await productionFiles(path)));
    else if (entry.isFile && entry.name.endsWith(".ts") && !entry.name.endsWith("_test.ts")) {
      files.push(path);
    }
  }
  return files;
}

const modules = [];
for (const sourceRoot of roots) {
  for (const file of await productionFiles(sourceRoot)) {
    const lines = (await Deno.readTextFile(file)).split("\n").length;
    modules.push({ file: relative(root, file), lines });
  }
}
modules.sort((left, right) => right.lines - left.lines || left.file.localeCompare(right.file));

console.log("Largest production modules:");
for (const module of modules.slice(0, 10)) {
  const marker = module.lines > warningLines ? " [review]" : "";
  console.log(`${String(module.lines).padStart(4)}  ${module.file}${marker}`);
}

const failures = modules.filter((module) => module.lines > maximumLines);
if (failures.length > 0) {
  console.error(`Production modules must remain at or below ${maximumLines} lines.`);
  Deno.exit(1);
}
