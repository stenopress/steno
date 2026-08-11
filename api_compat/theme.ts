/**
 * Compile-only compatibility fixture: a realistic module-based third-party
 * theme, written the way real theme authors write one against
 * `jsr:@steno/steno`'s public types. This file is never executed - only
 * type-checked (`deno task check:api-compat`) - so an accidental breaking
 * change to `StenoTheme`, `mergeTheme`, `ThemeConfig`, or
 * `PageRenderContext` fails CI here before anyone downstream notices.
 *
 * @module
 */

import { mergeTheme, Theme } from "../mod.ts";
import type { PageRenderContext, StenoTheme, ThemeConfig } from "../mod.ts";

const layoutTau = `<!doctype html>
<html lang="en">
<head><title>{title} &middot; {site.title}</title></head>
<body>{@html content}</body>
</html>`;

const cardComponentTau = `<div class="card"><h3>{title}</h3>{@children}</div>`;

interface CompatThemeConfig extends ThemeConfig {
  accent?: string;
}

const baseTheme: StenoTheme = {
  name: "compat-fixture-theme",
  version: "1.0.0",
  layouts: { layout: layoutTau },
  components: { Card: cardComponentTau },
  assets: { "style.css": "body { margin: 0; }" },
  defaultConfig: { accent: "indigo" } satisfies CompatThemeConfig,
  configSchema: {
    accent: { type: "string", default: "indigo" },
  },
};

/** Extending a bundled-style theme with `mergeTheme`, the way the docs show. */
export const extended: StenoTheme = mergeTheme(baseTheme, {
  layouts: {
    layout: layoutTau.replace("<body>", '<body class="compat">'),
  },
  defaultConfig: { accent: "purple" } satisfies CompatThemeConfig,
});

/** Constructing a `Theme` instance directly and using its render methods. */
export async function renderCompatLayout(context: PageRenderContext): Promise<string> {
  const theme = new Theme(baseTheme, { accent: "teal" });
  return await theme.renderLayout("layout", "<p>Hello</p>", {
    ...context,
    title: context.title ?? "Untitled",
  });
}

export default baseTheme;
