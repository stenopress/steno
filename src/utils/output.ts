/**
 * Shared terminal output utilities for consistent CLI styling across Steno.
 * @module
 */

function noColorRequested(): boolean {
  try {
    return Deno.env.get("NO_COLOR") !== undefined;
  } catch {
    return false;
  }
}

export function createColors(noColor = noColorRequested()) {
  const color = (code: string): string => noColor ? "" : `\x1b[${code}m`;

  return {
    reset: color("0"),
    bold: color("1"),
    dim: color("2"),
    green: color("38;5;120"),
    yellow: color("38;5;222"),
    red: color("38;5;203"),
    gray: color("38;5;245"),
    cyan: color("38;5;159"),
    cyanBold: color("1;38;5;159"),
    purple: color("38;5;135"),
    purpleBold: color("1;38;5;135"),
    white: color("97"),
    whiteBold: color("1;97"),
  };
}

export const c = createColors();

export function createSymbols(noColor = noColorRequested()) {
  return noColor
    ? { ok: "OK", warn: "WARN", fail: "ERROR", info: "INFO", change: "CHANGE" }
    : { ok: "✔", warn: "⚠", fail: "✖", info: "•", change: "↺" };
}

const symbols = createSymbols();

export function ok(msg: string): void {
  console.log(`  ${c.green}${symbols.ok}${c.reset}  ${msg}`);
}

export function warn(msg: string): void {
  console.warn(`  ${c.yellow}${symbols.warn}${c.reset}  ${msg}`);
}

export function fail(msg: string): void {
  console.error(`  ${c.red}${symbols.fail}${c.reset}  ${msg}`);
}

export function info(msg: string): void {
  console.log(`  ${c.gray}${symbols.info}${c.reset}  ${msg}`);
}

export function success(msg: string): void {
  console.log(`  ${c.green}${c.bold}${msg}${c.reset}`);
}

export function buildComplete(pageCount?: number): void {
  const detail = pageCount !== undefined
    ? `  ${c.gray}(${pageCount} page${pageCount === 1 ? "" : "s"})${c.reset}`
    : "";
  console.log(
    `  ${c.green}${symbols.ok}${c.reset}  ${c.bold}Build complete${c.reset}${detail}`,
  );
}

export function buildError(msg: string): void {
  console.error(
    `  ${c.red}${symbols.fail}${c.reset}  ${c.bold}Build failed${c.reset}  ${c.gray}${msg}${c.reset}`,
  );
}

export function changeDetected(): void {
  console.log(
    `  ${c.gray}${symbols.change}  change detected, rebuilding...${c.reset}`,
  );
}

/**
 * Prints the resolved theme and plugin list for a build. Only ever called
 * behind `--verbose` — this is the "what did steno actually load" answer
 * that was previously invisible short of reading source or stepping
 * through a debugger.
 */
export function debugBuildStart(
  theme: { name: string; version: string } | undefined,
  plugins: Array<{ name: string }>,
): void {
  const themeLabel = theme ? `${theme.name}@${theme.version}` : `${c.gray}(none)${c.reset}`;
  const pluginsLabel = plugins.length
    ? plugins.map((p) => p.name).join(", ")
    : `${c.gray}(none)${c.reset}`;
  console.log(`  ${c.dim}verbose${c.reset}  theme: ${themeLabel}`);
  console.log(`  ${c.dim}verbose${c.reset}  plugins: ${pluginsLabel}`);
}

/**
 * Prints the exact object a page's layout template receives at render
 * time. Only ever called behind `--verbose` — without this, inspecting
 * template context meant temporarily dumping it inside the template
 * itself, which can trip Tau's "unsafe expression" guard.
 */
export function debugPageContext(
  route: string,
  layout: string | undefined,
  context: unknown,
): void {
  console.log(
    `  ${c.dim}verbose${c.reset}  ${c.cyan}${route}${c.reset} ${c.gray}(layout: ${
      layout ?? "none"
    })${c.reset}`,
  );
  console.log(
    Deno.inspect(context, { depth: 6, colors: !noColorRequested() }),
  );
  console.log();
}

export function devServerReady(
  port: number,
  preferredPort: number,
  hostname: string = "127.0.0.1",
): void {
  if (port !== preferredPort) {
    warn(`port ${preferredPort} is in use, switched to ${port}`);
  }
  console.log();
  console.log(`  ${c.green}steno${c.reset}  ${c.gray}dev server${c.reset}`);
  console.log();
  console.log(
    `  ${c.gray}➜${c.reset}  ${c.bold}Local${c.reset}:   ${c.cyan}http://localhost:${port}/${c.reset}`,
  );
  if (hostname === "0.0.0.0") {
    console.log(
      `  ${c.gray}➜${c.reset}  ${c.bold}Network${c.reset}: ${c.cyan}http://0.0.0.0:${port}/${c.reset}`,
    );
  }
  console.log();
}
