/**
 * Compile-only compatibility fixture: a realistic trusted `StenoPlugin`
 * implementing every hook, written the way real plugin authors write one
 * against `jsr:@steno/steno`'s public types. Never executed - only
 * type-checked (`deno task check:api-compat`) - so an accidental breaking
 * change to `StenoPlugin`, `MarkdownTokens`, `GeneratedPage`, or
 * `SiteConfig` fails CI here before anyone downstream notices.
 *
 * @module
 */

import type { GeneratedPage, SiteConfig, StenoPlugin } from "../mod.ts";

export interface CompatPluginOptions {
  label?: string;
}

/** Creates a plugin exercising every hook a real one might implement. */
export default function compatPlugin(options: CompatPluginOptions = {}): StenoPlugin {
  const label = options.label ?? "compat";
  let pageCount = 0;

  return {
    name: "compat-fixture-plugin",

    beforeBuild(config: SiteConfig): void {
      // Real plugins read config fields like this before the build starts.
      void config.title;
      void config.contentDir;
      pageCount = 0;
    },

    transformAst(tokens) {
      // The tokens are marked's real lexer output - see MarkdownToken's
      // docs. A real transform narrows on `type` and casts for
      // kind-specific fields; this fixture just proves the shape compiles.
      for (const token of tokens) {
        void token.type;
        void token.raw;
      }
      return tokens;
    },

    transformHtml(html: string): string {
      return html.replaceAll("{{label}}", label);
    },

    afterPage(page: GeneratedPage): void {
      pageCount++;
      void page.html;
      void page.finalPath;
      void page.stagingPath;
    },

    afterBuild(config: SiteConfig): void {
      void config.output;
      void pageCount;
    },
  };
}
