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
export {
  clearTauCache,
  filters,
  getTauCacheStats,
  render,
} from "./src/utils/tau.ts";
/** Options used by the Tau template renderer. */
export type { TauCacheStats, TauLimits, TauOptions } from "./src/utils/tau.ts";
/** Structured Tau failures and their stable machine-readable codes. */
export { TauError } from "./src/utils/tau_error.ts";
export type { TauErrorCode } from "./src/utils/tau_error.ts";
/** Core site and theme configuration types. */
export type {
  CollectionConfig,
  GeneratedPage,
  HeadTag,
  IsolatedPluginPermissions,
  LinkHeadTag,
  MetaHeadTag,
  NavigationNode,
  PageConfigOverrides,
  PluginEntry,
  PluginSecurityConfig,
  PluginSourcePolicy,
  ScriptHeadTag,
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
