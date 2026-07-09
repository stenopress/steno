import type { TokensList } from "marked";
import type { StenoPlugin } from "../types.ts";
/** Shared plugin contract used throughout the build pipeline. */
export type { StenoPlugin } from "../types.ts";

function isHookFunction(value: unknown): value is (...args: unknown[]) => unknown {
  return typeof value === "function";
}

/** Returns true when a value satisfies the Steno plugin contract. */
export function isStenoPlugin(plugin: unknown): plugin is StenoPlugin {
  if (!plugin || typeof plugin !== "object") {
    return false;
  }

  const candidate = plugin as Record<string, unknown>;
  if (typeof candidate.name !== "string" || !candidate.name.trim()) {
    return false;
  }

  const hookKeys = [
    "transformAst",
    "transformHtml",
    "beforeBuild",
    "afterPage",
    "afterBuild",
  ] as const;

  return hookKeys.every((key) =>
    candidate[key] === undefined || isHookFunction(candidate[key])
  );
}

/**
 * Runs all registered AST transformation plugins on the given Markdown tokens.
 *
 * @param tokens The Markdown tokens to transform.
 * @param plugins An array of Steno plugins.
 * @returns A promise that resolves to the transformed Markdown tokens.
 */
export async function runAstTransforms(
  tokens: TokensList,
  plugins: StenoPlugin[],
): Promise<TokensList> {
  for (const plugin of plugins) {
    if (plugin.transformAst) {
      tokens = await plugin.transformAst(tokens);
    }
  }
  return tokens;
}

/**
 * Runs all registered HTML transformation plugins on the given HTML string.
 *
 * @param html The HTML string to transform.
 * @param plugins An array of Steno plugins.
 * @returns A promise that resolves to the transformed HTML string.
 */
export async function runHtmlTransforms(
  html: string,
  plugins: StenoPlugin[],
): Promise<string> {
  for (const plugin of plugins) {
    if (plugin.transformHtml) {
      html = await plugin.transformHtml(html);
    }
  }
  return html;
}
