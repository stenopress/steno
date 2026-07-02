/**
 * @steno/init — Interactive scaffolder for new Steno static-site projects.
 *
 * Recommended usage:
 *
 * ```sh
 * deno run -Ar jsr:@steno/init
 * ```
 *
 * @module
 */

import { runOnboarding } from "./src/onboarding.ts";

/** The onboarding error type thrown for expected scaffolding failures. */
export { OnboardingError, runOnboarding } from "./src/onboarding.ts";
/** Options for pre-filling the onboarding prompts. */
export type { ProjectOptions } from "./src/onboarding.ts";

if (import.meta.main) {
  await runOnboarding();
}
