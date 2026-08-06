/**
 * @steno/init/create-theme - CLI entrypoint for scaffolding a new Steno theme package.
 *
 * @module
 */

import { parseArgs } from "@std/cli/parse-args";
import { OnboardingError } from "./onboarding.ts";
import { scaffoldTheme } from "./scaffold_theme.ts";

const flags = parseArgs(Deno.args, {
  boolean: ["force", "help"],
  string: ["dir"],
  default: { force: false },
  alias: { help: "h", f: "force" },
});

if (flags.help || flags._.length === 0) {
  console.log(`
@steno/init/create-theme - scaffold a new Steno theme

Usage:
  deno run -A jsr:@steno/init/create-theme <name> [options]

Options:
  --dir <path>    Directory to create the theme in (default: ./<name>)
  --force, -f     Overwrite existing files
  --help, -h      Show this help message
`);
  Deno.exit(flags.help ? 0 : 1);
}

const name = String(flags._[0]);

try {
  scaffoldTheme(name, { targetDir: flags.dir, force: flags.force });
} catch (err) {
  if (err instanceof OnboardingError) {
    console.error(`\n❌  ${err.message}\n`);
    Deno.exit(1);
  }
  throw err;
}
