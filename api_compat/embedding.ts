/**
 * Compile-only compatibility fixture: realistic code embedding Steno in
 * another tool - constructing `Steno` directly, handling `StenoHooks` and
 * `StenoDiagnosticError`, and calling Tau's `render()` outside a theme.
 * Never executed - only type-checked (`deno task check:api-compat`) - so an
 * accidental breaking change to `Steno`, `StenoHooks`, `Diagnostic`,
 * `StenoDiagnosticError`, `render()`, `TauError`, or their supporting types
 * fails CI here before anyone downstream notices.
 *
 * @module
 */

import {
  clearTauCache,
  filters,
  getTauCacheStats,
  render,
  runStenoCli,
  Steno,
  StenoDiagnosticError,
  TauError,
} from "../mod.ts";
import type { Diagnostic, StenoHooks, TauOptions } from "../mod.ts";

/** Building a `StenoHooks` object the way an embedder would. */
const hooks: StenoHooks = {
  beforeBuild(config) {
    void config.title;
  },
  afterPage(page) {
    void page.html;
  },
  afterBuild(config) {
    void config.pages?.length;
  },
};

/** Constructing and running `Steno` directly, handling a failed build. */
export async function runEmbeddedBuild(configPath: string): Promise<void> {
  const steno = new Steno(configPath, true, hooks, false);
  try {
    await steno.ready();
  } catch (error) {
    if (error instanceof StenoDiagnosticError) {
      const first: Diagnostic | undefined = error.diagnostics[0];
      console.error(first?.code, first?.message, first?.file, first?.hint);
      return;
    }
    throw error;
  }
  await steno.build();
  steno.cancel();
}

/** Running Steno's own CLI programmatically. */
export async function runEmbeddedCli(args: string[]): Promise<void> {
  await runStenoCli(args);
}

/** Calling Tau's `render()` directly, outside a theme. */
export async function renderStandalone(): Promise<string> {
  const options: TauOptions = {
    template: "<p>{name | upper}</p>",
    context: { name: "world" },
    components: {},
  };

  try {
    return await render(options);
  } catch (error) {
    if (error instanceof TauError) {
      return `error: ${error.code}`;
    }
    throw error;
  }
}

/** Tau cache introspection, the advanced-tier exports. */
export function reportTauCache(): void {
  const stats = getTauCacheStats();
  console.log(stats.size, stats.capacity, stats.hits, stats.misses, stats.evictions);
  clearTauCache();
}

/** Registering a custom filter before rendering, as the docs show. */
filters.shout = (value: unknown) => String(value).toUpperCase() + "!";
