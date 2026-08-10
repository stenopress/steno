/**
 * Steno: A fast Deno-powered static site generator.
 *
 * @module
 */

import { runStenoCli } from "./src/core/steno_cli.ts";
import { printHelp } from "./src/utils/cli.ts";
import { buildError } from "./src/utils/output.ts";
import { formatTauError, TauError } from "./src/utils/tau_error.ts";

/** The main site generator class. */
export { Steno } from "./src/core/steno.ts";
/** Runs the Steno CLI with the provided arguments. */
export { runStenoCli } from "./src/core/steno_cli.ts";
/** A single item within a generated collection. */
export type { Collection, CollectionItem, CollectionMap } from "./src/core/collections.ts";
/** Built-in template filters and the template renderer. */
export { clearTauCache, filters, getTauCacheStats, render } from "./src/utils/tau.ts";
/** Types used to configure and extend the Tau template renderer. */
export type { FilterFunction, TauCacheStats, TauLimits, TauOptions } from "./src/utils/tau.ts";
/** Structured Tau failures and their stable machine-readable codes. */
export { TauError } from "./src/utils/tau_error.ts";
export type { TauErrorCode, TauErrorLocation } from "./src/utils/tau_error.ts";
/** Core site and theme configuration types. */
export type {
  CollectionConfig,
  CollectionFieldSchema,
  GeneratedPage,
  HeadTag,
  HeadTagBase,
  IsolatedPluginPermissions,
  LinkHeadTag,
  MarkdownToken,
  MarkdownTokens,
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
export { mergeTheme, Theme } from "./src/theme/theme.ts";
export type { PageRenderContext, ThemeConfig } from "./src/theme/theme.ts";
/** Structured problems found while resolving a project's theme, plugins,
 * data files, or redirects - and the error thrown when a production build
 * has any of error severity. */
export { StenoDiagnosticError } from "./src/core/diagnostics.ts";
export type { Diagnostic } from "./src/core/diagnostics.ts";

// Deliberately not `await`-ed at the top level: a top-level await here would
// keep this module's own evaluation pending for as long as the build runs.
// A theme loaded mid-build that imports a *value* (not just a type) from
// this same module - `Theme`, `mergeTheme`, etc. - would then dynamically
// re-import a module whose evaluation can never finish until this very
// `await` resolves, deadlocking the build. Firing it without awaiting lets
// this module finish evaluating immediately; the process still stays alive
// on the pending work underneath, and still exits non-zero on failure.
async function runCli(): Promise<void> {
  try {
    await runStenoCli(Deno.args);
  } catch (error) {
    buildError(
      error instanceof TauError
        ? formatTauError(error)
        : error instanceof Error
          ? error.message
          : String(error),
    );
    printHelp();
    Deno.exit(1);
  }
}

if (import.meta.main) {
  runCli();
}

// my face i
