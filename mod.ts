/**
 * Steno: A fast Deno-powered static site generator.
 *
 * @module
 */

import { printHelp } from "./src/utils/cli.ts";
import { runStenoCli } from "./src/core/steno_cli.ts";

export { Steno } from "./src/core/steno.ts";
export { runStenoCli } from "./src/core/steno_cli.ts";
export type {
  Collection,
  CollectionItem,
  CollectionMap,
} from "./src/core/collections.ts";
export { filters, render } from "./src/utils/scribe.ts";
export type { ScribeOptions } from "./src/utils/scribe.ts";
export type {
  CollectionConfig,
  PluginEntry,
  SiteConfig,
  StenoHooks,
  StenoPlugin,
  StenoTheme,
  ThemeConfigField,
} from "./src/types.ts";
export { Theme } from "./src/theme/theme.ts";

if (import.meta.main) {
  try {
    await runStenoCli(Deno.args);
  } catch (error) {
    console.error((error as Error).message);
    printHelp();
    Deno.exit(1);
  }
}
