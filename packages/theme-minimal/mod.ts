/**
 * This module exports the minimal theme for Steno.
 *
 * @module
 */

import type { StenoTheme } from "@steno/steno";

// fetch() works universally: file:// for local/bundled imports,
// https:// for direct JSR imports (jsr:@steno/theme-minimal@x.y.z).
const layout = await fetch(new URL("./layouts/layout.tau", import.meta.url))
  .then((r) => r.text());

const theme: StenoTheme = {
  name: "minimal",
  version: "0.9.0",
  layouts: { layout },
  assets: {
    "style.css": new URL("./assets/style.css", import.meta.url),
  },
};

export default theme;
