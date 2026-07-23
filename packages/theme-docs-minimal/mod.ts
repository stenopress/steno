/**
 * This module exports the minimal documentation theme for Steno.
 *
 * @module
 */

import type { StenoTheme, ThemeConfigField } from "@steno/steno";

// fetch() works universally: file:// for local/bundled imports,
// https:// for direct JSR imports (jsr:@steno/theme-docs-minimal@x.y.z).
const layout = await fetch(new URL("./layouts/layout.tau", import.meta.url))
  .then((r) => r.text());

const defaultConfig = {
  accent: "#7760a9",
  accentHover: "#5f488f",
  accentFg: "#ffffff",
  accentDark: "#9d86d0",
  accentDarkHover: "#b29ddd",
  accentDarkFg: "#171519",
};

const configSchema = Object.fromEntries(
  Object.entries(defaultConfig).map(([key, value]) => [
    key,
    { type: "string", default: value },
  ]),
) as Record<string, ThemeConfigField>;

const theme: StenoTheme = {
  name: "docs-minimal",
  version: "1.0.0",
  layouts: { layout },
  assets: {
    "style.css": new URL("./assets/style.css", import.meta.url),
  },
  defaultConfig,
  configSchema,
};

export default theme;
