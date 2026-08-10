/**
 * A structured problem found while resolving a project's inputs (theme,
 * plugins, data files, redirects, ...), replacing an ad-hoc `console.warn`/
 * `console.error` call. `severity: "error"` on a production build (`steno
 * build`, or a non-dev `steno dev` rebuild's *initial* load) means the
 * declared input could not be honored and the build should fail rather than
 * silently produce a site that doesn't match its own configuration.
 * `steno dev` stays permissive: errors are still printed, but don't stop the
 * dev server, so iterating on a broken theme/plugin doesn't require a clean
 * config first.
 */
export interface Diagnostic {
  /** Stable, kebab-case identifier for this kind of problem, e.g.
   * `"theme-load-failed"`. Intended for tooling/automation, not prose. */
  code: string;
  severity: "warning" | "error";
  /** Human-readable description of what went wrong. */
  message: string;
  /** Path to the file the problem was found in, if applicable. */
  file?: string;
  /** A concrete next step, when there's an obvious one. */
  hint?: string;
}

/** Collects diagnostics found while resolving a project's inputs. */
export class DiagnosticBag {
  private readonly items: Diagnostic[] = [];

  add(diagnostic: Diagnostic): void {
    this.items.push(diagnostic);
  }

  get all(): readonly Diagnostic[] {
    return this.items;
  }

  get errors(): Diagnostic[] {
    return this.items.filter((d) => d.severity === "error");
  }

  get warnings(): Diagnostic[] {
    return this.items.filter((d) => d.severity === "warning");
  }

  get hasErrors(): boolean {
    return this.items.some((d) => d.severity === "error");
  }

  get isEmpty(): boolean {
    return this.items.length === 0;
  }
}

/** Renders one diagnostic as a single-line-plus-hint string for console output. */
export function formatDiagnostic(diagnostic: Diagnostic): string {
  const location = diagnostic.file ? ` (${diagnostic.file})` : "";
  const hint = diagnostic.hint ? `\n  hint: ${diagnostic.hint}` : "";
  return `[${diagnostic.code}] ${diagnostic.message}${location}${hint}`;
}

/** Prints every diagnostic in `bag` to the console - errors via `console.error`,
 * warnings via `console.warn` - regardless of whether the build will fail. */
export function printDiagnostics(bag: DiagnosticBag): void {
  for (const diagnostic of bag.all) {
    const line = `[steno:${diagnostic.severity}] ${formatDiagnostic(diagnostic)}`;
    if (diagnostic.severity === "error") {
      console.error(line);
    } else {
      console.warn(line);
    }
  }
}

/** Thrown when a production build has one or more error-severity diagnostics.
 * `diagnostics` carries every error so a caller (or a future `--json`
 * output) can report all of them, not just the first. */
export class StenoDiagnosticError extends Error {
  readonly diagnostics: Diagnostic[];

  constructor(diagnostics: Diagnostic[]) {
    const summary = diagnostics
      .map((d) => `  - ${formatDiagnostic(d)}`)
      .join("\n");
    super(
      `Build failed: ${diagnostics.length} configured input(s) could not be honored.\n${summary}`,
    );
    this.name = "StenoDiagnosticError";
    this.diagnostics = diagnostics;
  }
}

/**
 * Prints every diagnostic in `bag`, then throws {@link StenoDiagnosticError}
 * if it has any error-severity entries and `dev` is false. In `dev` mode,
 * errors are printed but never thrown - a broken theme/plugin/data file
 * should be visible without stopping the dev server.
 */
export function enforceDiagnostics(bag: DiagnosticBag, dev: boolean): void {
  printDiagnostics(bag);
  if (!dev && bag.hasErrors) {
    throw new StenoDiagnosticError(bag.errors);
  }
}
