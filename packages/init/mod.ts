/**
 * @steno/init - Interactive scaffolder for new Steno static-site projects.
 *
 * Recommended usage:
 *
 * ```sh
 * deno create jsr:@steno/init
 * ```
 *
 * @module
 */

import { runOnboarding } from "./src/onboarding.ts";

/** The onboarding error type thrown for expected scaffolding failures. */
export { OnboardingError, runOnboarding } from "./src/onboarding.ts";
/** Options for pre-filling the onboarding prompts. */
export type { PluginChoice, ProjectOptions, ThemeChoice } from "./src/onboarding.ts";
/** Scaffolds a standalone starter theme package (`jsr:@steno/init/create-theme`). */
export { scaffoldTheme, type ThemeScaffoldOptions } from "./src/scaffold_theme.ts";
/** Scaffolds a standalone starter plugin package (`jsr:@steno/init/create-plugin`). */
export { type PluginScaffoldOptions, scaffoldPlugin } from "./src/scaffold_plugin.ts";

if (import.meta.main) {
  await runOnboarding();
}
