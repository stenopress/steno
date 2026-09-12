import { marked } from "marked";
import { runAstTransforms, runHtmlTransforms } from "./plugins.ts";
import type { StenoPlugin } from "./types.ts";

/** Processes Markdown with the same ordered transforms for pages and collections. */
export async function renderMarkdown(body: string, plugins: StenoPlugin[]): Promise<string> {
  const tokens = await runAstTransforms(marked.lexer(body), plugins);
  return await runHtmlTransforms(marked.parser(tokens), plugins);
}
