import { isAbsolute, relative, resolve, toFileUrl } from "@std/path";
import type { StenoTheme } from "../types.ts";
import { BLOCKED_EXPRESSION_NAMES, parseTauExpression } from "../utils/tau_expr.ts";
import { isRecord } from "../utils/text.ts";

export function validateThemeFunctions(
  functions: unknown,
): asserts functions is StenoTheme["functions"] {
  if (functions === undefined) return;
  if (!isRecord(functions)) throw new Error("Theme functions must be a map of named functions.");
  for (const [name, fn] of Object.entries(functions)) {
    let validName = false;
    try {
      const expression = parseTauExpression(name);
      validName =
        expression.type === "Identifier" &&
        expression.name === name &&
        !BLOCKED_EXPRESSION_NAMES.has(name);
    } catch {
      // Report the registration name instead of a template parse error.
    }
    if (!validName || typeof fn !== "function") {
      throw new Error(
        `Invalid theme function "${name}": expected a callable with a Tau identifier name.`,
      );
    }
  }
}

export async function loadThemeFunctions(
  dir: string,
  modulePath: unknown,
): Promise<StenoTheme["functions"]> {
  if (modulePath === undefined) return undefined;
  if (typeof modulePath !== "string" || !modulePath.startsWith("./")) {
    throw new Error('Theme "functions" must be a local module path starting with "./".');
  }
  const root = await Deno.realPath(dir);
  const path = await Deno.realPath(resolve(dir, modulePath));
  const within = relative(root, path);
  if (within === ".." || within.startsWith("../") || isAbsolute(within)) {
    throw new Error('Theme "functions" module must be inside its theme directory.');
  }
  const url = toFileUrl(path);
  url.searchParams.set("steno", crypto.randomUUID());
  const module = await import(url.href);
  validateThemeFunctions(module.default);
  if (module.default === undefined) {
    throw new Error(`Theme functions module "${modulePath}" must default-export a function map.`);
  }
  return module.default;
}
