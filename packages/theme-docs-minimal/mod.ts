/**
 * This module exports the minimal documentation theme for Steno.
 *
 * @module
 */

import type { StenoTheme } from "steno";

const themeDir: URL = new URL(".", import.meta.url);

/**
 * The minimal documentation Steno theme object.
 */
const theme: StenoTheme = {
    name: "docs-minimal",
    version: "0.5.0",
    layouts: {
        layout: Deno.readTextFileSync(new URL("./layouts/layout.scr", themeDir)),
    },
    assets: {
        "style.css": new URL("./assets/style.css", themeDir),
    },
};

export default theme as StenoTheme;