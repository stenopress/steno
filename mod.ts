/**
 * Steno: A fast Deno-powered static site generator.
 *
 * @module
 */

import { printHelp } from "./src/utils/cli.ts";
import { runStenoCli } from "./src/core/steno_cli.ts";
import { buildError } from "./src/utils/output.ts";

/** The main site generator class. */
export { Steno } from "./src/core/steno.ts";
/** Runs the Steno CLI with the provided arguments. */
export { runStenoCli } from "./src/core/steno_cli.ts";
/** A single item within a generated collection. */
export type {
  Collection,
  CollectionItem,
  CollectionMap,
} from "./src/core/collections.ts";
/** Built-in template filters and the template renderer. */
export { filters, render } from "./src/utils/scribe.ts";
/** Options used by the Scribe template renderer. */
export type { ScribeOptions } from "./src/utils/scribe.ts";
/** Core site and theme configuration types. */
export type {
  CollectionConfig,
  NavigationNode,
  PluginEntry,
  PluginSecurityConfig,
  SiteConfig,
  StenoHooks,
  StenoPlugin,
  StenoTheme,
  ThemeConfigField,
} from "./src/types.ts";
/** Loads and renders theme instances. */
export { Theme } from "./src/theme/theme.ts";

if (import.meta.main) {
  try {
    await runStenoCli(Deno.args);
  } catch (error) {
    buildError((error as Error).message);
    printHelp();
    Deno.exit(1);
  }
}
