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

export function ok(msg: string): void {
  console.log(`  ${c.green}✔${c.reset}  ${msg}`);
}

export function warn(msg: string): void {
  console.warn(`  ${c.yellow}⚠${c.reset}  ${msg}`);
}

export function fail(msg: string): void {
  console.error(`  ${c.red}✖${c.reset}  ${msg}`);
}

export function info(msg: string): void {
  console.log(`  ${c.gray}•${c.reset}  ${msg}`);
}

export function success(msg: string): void {
  console.log(`  ${c.green}${c.bold}${msg}${c.reset}`);
}

export function buildComplete(pageCount?: number): void {
  const detail = pageCount !== undefined
    ? `  ${c.gray}(${pageCount} page${pageCount === 1 ? "" : "s"})${c.reset}`
    : "";
  console.log(
    `  ${c.green}✔${c.reset}  ${c.bold}Build complete${c.reset}${detail}`,
  );
}

export function buildError(msg: string): void {
  console.error(
    `  ${c.red}✖${c.reset}  ${c.bold}Build failed${c.reset}  ${c.gray}${msg}${c.reset}`,
  );
}

export function changeDetected(): void {
  console.log(`  ${c.gray}↺  change detected, rebuilding...${c.reset}`);
}

export function devServerReady(port: number, preferredPort: number): void {
  if (port !== preferredPort) {
    warn(`port ${preferredPort} is in use, switched to ${port}`);
  }
  console.log();
  console.log(`  ${c.green}steno${c.reset}  ${c.gray}dev server${c.reset}`);
  console.log();
  console.log(
    `  ${c.gray}➜${c.reset}  ${c.bold}Local${c.reset}:   ${c.cyan}http://localhost:${port}/${c.reset}`,
  );
  console.log(
    `  ${c.gray}➜${c.reset}  ${c.bold}Network${c.reset}: ${c.cyan}http://0.0.0.0:${port}/${c.reset}`,
  );
  console.log();
}
