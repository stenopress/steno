/**
 * Shared terminal output utilities for consistent CLI styling across Steno.
 * @module
 */

const ESC = "\x1b[";

export const c = {
  reset: `${ESC}0m`,
  bold: `${ESC}1m`,
  dim: `${ESC}2m`,
  green: `${ESC}38;5;120m`,
  yellow: `${ESC}38;5;222m`,
  red: `${ESC}38;5;203m`,
  gray: `${ESC}38;5;245m`,
  cyan: `${ESC}38;5;159m`,
  cyanBold: `${ESC}1;38;5;159m`,
  purple: `${ESC}38;5;135m`,
  purpleBold: `${ESC}1;38;5;135m`,
  white: `${ESC}97m`,
  whiteBold: `${ESC}1;97m`,
};

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
