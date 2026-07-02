import type { TokensList } from "marked";
import type { StenoPlugin } from "../types.ts";
export type { StenoPlugin } from "../types.ts";

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
