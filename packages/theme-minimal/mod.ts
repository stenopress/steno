/**
 * This module exports the minimal theme for Steno.
 *
 * @module
 */

import type { StenoTheme } from "steno";

const themeDir: URL = new URL(".", import.meta.url);

/**
 * The minimal Steno theme object.
 */
const theme: StenoTheme = {
    name: "minimal",
    version: "0.5.0",
    layouts: {
        layout: Deno.readTextFileSync(new URL("./layouts/layout.scr", themeDir)),
    },
    assets: {
        "style.css": new URL("./assets/style.css", themeDir),
    },
};

export default theme as StenoTheme;