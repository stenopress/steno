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
  parseThemeChoice,
  runOnboarding,
} from "./onboarding.ts";

const flags = parseArgs(Deno.args, {
  boolean: ["force", "help", "advanced", "short-urls"],
  string: [
    "title",
    "description",
    "author",
    "plugins",
    "community-plugins",
    "theme",
    "community-theme",
    "local-theme",
    "theme-version",
    "steno-version",
    "content-dir",
    "output-dir",
    "dev-port",
  ],
  default: {
    force: false,
    advanced: false,
  },
  alias: {
    help: "h",
    f: "force",
    a: "advanced",
  },
});

if (flags.help) {
  console.log(`
@steno/init - scaffold a new Steno static site

Usage:
  deno create jsr:@steno/init [options]

Options:
  --title <text>             Site title (skips prompt)
  --description <text>       Site description (skips prompt)
  --author <text>            Author name (skips prompt)
  --plugins <list>           Comma-separated official plugins:
                              tailwind, shiki, seo, docs, search, og
  --community-plugins <list> Comma-separated community package specifiers,
                              e.g. jsr:@user/plugin-name (installed as mode: isolated)
  --theme <name>             One of the official themes: minimal, docs-minimal, marketing-minimal
  --community-theme <pkg>    A community theme package specifier, e.g. jsr:@user/theme-name
  --force, -f                Overwrite existing files
  --help, -h                 Show this help message

Advanced options (also unlocked interactively with --advanced, -a):
  --advanced, -a              Prompt for the extra settings below instead of using defaults
  --local-theme <path>        Use a theme path inside this project instead of a package, e.g. ./theme
  --theme-version <range>     Version range pinned for an official --theme (default: ^0.10.0)
  --steno-version <range>     Version range for @steno/steno in deno.json (default: ^0.10.0)
  --content-dir <name>        Content directory (default: content)
  --output-dir <name>         Build output directory (default: dist)
  --dev-port <number>         Dev server port (default: 5735)
  --short-urls                Enable short URLs (default: true)

Building a theme or plugin instead of a whole site:
  deno run -A jsr:@steno/init/create-theme <name>
  deno run -A jsr:@steno/init/create-plugin <name>
`);
  Deno.exit(0);
}

const communityPlugins = flags["community-plugins"]
  ?.split(",")
  .map((p) => p.trim())
  .filter((p) => p.length > 0);

const devPort = flags["dev-port"] !== undefined
  ? parseInt(flags["dev-port"], 10)
  : undefined;
if (devPort !== undefined && Number.isNaN(devPort)) {
  console.error(`\n❌  Invalid --dev-port "${flags["dev-port"]}".\n`);
  Deno.exit(1);
}

try {
  await runOnboarding(Deno.cwd(), {
    title: flags.title,
    description: flags.description,
    author: flags.author,
    // Only force plugin selection when the flag is actually passed, so
    // omitting it still triggers the interactive picker.
    plugins: flags.plugins !== undefined
      ? parsePluginChoices(flags.plugins)
      : undefined,
    communityPlugins,
    theme: parseThemeChoice(flags.theme),
    communityTheme: flags["community-theme"],
    localTheme: flags["local-theme"],
    themeVersion: flags["theme-version"],
    stenoVersion: flags["steno-version"],
    contentDir: flags["content-dir"],
    outputDir: flags["output-dir"],
    devPort,
    shortUrls: flags["short-urls"] || undefined,
    force: flags.force,
    advanced: flags.advanced,
  });
} catch (err) {
  if (err instanceof OnboardingError) {
    console.error(`\n❌  ${err.message}\n`);
    Deno.exit(1);
  }
  throw err;
}
