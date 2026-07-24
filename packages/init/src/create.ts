/**
 * @steno/init/create - CLI entrypoint for scaffolding new Steno static-site projects.
 *
 * This module handles command-line argument parsing and initiates the onboarding process.
 *
 * @module
 */

import { parseArgs } from "@std/cli/parse-args";
import {
  OnboardingError,
  parsePluginChoices,
  runOnboarding,
} from "./onboarding.ts";

const flags = parseArgs(Deno.args, {
  boolean: ["force", "help"],
  string: ["title", "description", "author", "plugins"],
  default: {
    force: false,
  },
  alias: {
    help: "h",
    f: "force",
  },
});

if (flags.help) {
  console.log(`
@steno/init - scaffold a new Steno static site

Usage:
  deno run -Ar jsr:@steno/init [options]

Options:
  --title <text>        Site title (skips prompt)
  --description <text>  Site description (skips prompt)
  --author <text>       Author name (skips prompt)
  --plugins <list>      Comma-separated official plugins: tailwind, shiki
  --force, -f           Overwrite existing files
  --help, -h            Show this help message
`);
  Deno.exit(0);
}

try {
  await runOnboarding(Deno.cwd(), {
    title: flags.title,
    description: flags.description,
    author: flags.author,
    plugins: parsePluginChoices(flags.plugins),
    force: flags.force,
  });
} catch (err) {
  if (err instanceof OnboardingError) {
    console.error(`\n❌  ${err.message}\n`);
    Deno.exit(1);
  }
  throw err;
}
