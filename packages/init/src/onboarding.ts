/**
 * @steno/init/onboarding — Core logic for scaffolding new Steno static-site projects.
 *
 * This module contains the interactive prompts and file generation logic
 * for setting up a new Steno project.
 *
 * @module
 */

import { join, relative } from "@std/path";

/** Options that can be passed directly to {@link runOnboarding}. When a field
 * is omitted the user is prompted interactively. */
export interface ProjectOptions {
  title?: string;
  description?: string;
  author?: string;
  /** Which theme to scaffold. Only "starter" is currently available. */
  theme?: "starter";
  /** Skip the overwrite guard and clobber existing files. */
  force?: boolean;
}

/** Thrown when scaffolding fails for an expected reason (e.g. files already
 * exist). Catching this lets callers do `Deno.exit(1)` cleanly. */
export class OnboardingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OnboardingError";
  }
}

// ansi colorrs

const ESC = "\x1b[";

const c = {
  reset: `${ESC}0m`,
  bold: `${ESC}1m`,
  dim: `${ESC}2m`,
  purple: `${ESC}38;5;135m`,
  purpleBold: `${ESC}1;38;5;135m`,
  white: `${ESC}97m`,
  whiteBold: `${ESC}1;97m`,
  gray: `${ESC}38;5;245m`,
  green: `${ESC}38;5;120m`,
  yellow: `${ESC}38;5;222m`,
  cyan: `${ESC}38;5;159m`,
  cyanBold: `${ESC}1;38;5;159m`,
};

function paint(color: string, text: string): string {
  return `${color}${text}${c.reset}`;
}

function printBanner(): void {
  const logo = [
    `   \x1b[32mTTTTT\x1b[0m    \x1b[31mNNNN\x1b[0m`,
    ` \x1b[35mSSS\x1b[0m \x1b[32mT\x1b[0m \x1b[33mEEEE\x1b[0m \x1b[31mN  N\x1b[0m \x1b[34mOOOO\x1b[0m`,
    `\x1b[35mS\x1b[0m    \x1b[32mT\x1b[0m \x1b[33mE\x1b[0m    \x1b[31mN  N\x1b[0m \x1b[34mO  O\x1b[0m`,
    ` \x1b[35mSS\x1b[0m  \x1b[32mT\x1b[0m \x1b[33mEEE\x1b[0m  \x1b[31mN  N\x1b[0m \x1b[34mO  O\x1b[0m`,
    `   \x1b[35mS\x1b[0m \x1b[32mT\x1b[0m \x1b[33mE\x1b[0m    \x1b[31mN  N\x1b[0m \x1b[34mO  O\x1b[0m`,
    `\x1b[35mSSS\x1b[0m    \x1b[33mEEEE\x1b[0m      \x1b[34mOOOO\x1b[0m`,
  ];

  const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "");
  const logoWidth = Math.max(...logo.map((l) => stripAnsi(l).length));

  const tagline = "A fast Deno-powered static site generator";
  const words = tagline.split(" ");
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= logoWidth) {
      current = next;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);

  const termWidth = (() => {
    try {
      return Deno.consoleSize().columns;
    } catch {
      return 80;
    }
  })();
  const leftPad = Math.floor((termWidth - logoWidth) / 2);
  const p = " ".repeat(leftPad);

  for (const line of logo) console.log(p + line);
  console.log();
  for (const line of lines) {
    const pad = Math.floor((logoWidth - line.length) / 2);
    console.log(paint(c.gray, p + " ".repeat(pad) + line));
  }
  console.log();
}

function heading(text: string): void {
  console.log(`\n${paint(c.purpleBold, "◆")} ${paint(c.whiteBold, text)}`);
  console.log(paint(c.gray, "  " + "─".repeat(text.length + 2)));
}

function toYamlString(value: string): string {
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

function promptWithDefault(label: string, defaultValue: string): string {
  const arrow = paint(c.purple, "›");
  const def = paint(c.gray, `(${defaultValue})`);
  const value = prompt(`  ${arrow} ${label} ${def}`)?.trim();
  return value && value.length > 0 ? value : defaultValue;
}

function selectTheme(): "starter" {
  heading("Choose a Theme");
  console.log();
  console.log(
    `  ${paint(c.purple, "1)")} Starter Theme  ${
      paint(c.green, "✔ available")
    }`,
  );
  console.log(
    `  ${paint(c.gray, "2)")} ${paint(c.dim, "More themes    coming soon…")}`,
  );

  while (true) {
    const arrow = paint(c.purple, "›");
    const selection =
      prompt(`\n  ${arrow} Select theme ${paint(c.gray, "[1]")}`)?.trim() ||
      "1";

    if (selection === "1") return "starter";
    if (selection === "2") {
      console.log(
        paint(
          c.yellow,
          "\n  ⚠  That theme isn't available yet — please pick Starter (1).",
        ),
      );
      continue;
    }
    console.log(paint(c.yellow, "\n  ⚠  Invalid choice. Enter 1 to continue."));
  }
}

function ensureDirSync(dirPath: string): void {
  try {
    if (!Deno.statSync(dirPath).isDirectory) {
      Deno.mkdirSync(dirPath, { recursive: true });
    }
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      Deno.mkdirSync(dirPath, { recursive: true });
    } else {
      throw error;
    }
  }
}

function checkOverwrite(paths: string[]): void {
  const existing = paths.filter((p) => {
    try {
      Deno.statSync(p);
      return true;
    } catch (e) {
      if (e instanceof Deno.errors.NotFound) return false;
      throw e;
    }
  });

  if (existing.length > 0) {
    throw new OnboardingError(
      `Aborted: the following files already exist:\n${
        existing.map((p) => `  ${paint(c.purple, "•")} ${p}`).join("\n")
      }\n\nUse ${paint(c.whiteBold, "--force")} to overwrite.`,
    );
  }
}

/**
 * Runs the interactive onboarding process to scaffold a new Steno project.
 *
 * @param projectRoot The root directory where the new project will be created.
 * @param options Optional project configuration to bypass interactive prompts.
 * @returns A promise that resolves when the scaffolding is complete.
 * @throws {OnboardingError} if files already exist and `force` is not true.
 */
export async function runOnboarding(
  projectRoot: string = Deno.cwd(),
  options: ProjectOptions = {},
): Promise<void> {
  printBanner();

  heading("Project Details");
  console.log(paint(c.gray, "  Press Enter to accept the defaults.\n"));

  const title = options.title ??
    promptWithDefault("Site title", "My Steno Site");
  const description = options.description ??
    promptWithDefault("Site description", "A site built with Steno");
  const author = options.author ?? promptWithDefault("Author", "Your Name");
  const _theme = options.theme ?? selectTheme();

  const contentDir = join(projectRoot, "content");
  const stenoConfigDir = join(contentDir, ".steno");
  const configPath = join(stenoConfigDir, "config.yml");
  const homePagePath = join(contentDir, "index.md");
  const themeDir = join(projectRoot, "themes", "starter");
  const themeLayoutsDir = join(themeDir, "layouts");
  const themeComponentsDir = join(themeDir, "components");
  const themeAssetsDir = join(themeDir, "assets");
  const themeConfigPath = join(themeDir, "theme.yaml");
  const layoutPath = join(themeLayoutsDir, "layout.scr");
  const headerPath = join(themeComponentsDir, "header.scr");
  const footerPath = join(themeComponentsDir, "footer.scr");
  const stylesheetPath = join(themeAssetsDir, "style.css");
  const entryPath = join(projectRoot, "mod.ts");
  const denoJsonPath = join(projectRoot, "deno.json");

  if (!options.force) {
    checkOverwrite([
      configPath,
      homePagePath,
      themeConfigPath,
      layoutPath,
      headerPath,
      footerPath,
      stylesheetPath,
    ]);
  }

  heading("Scaffolding");
  console.log();

  for (
    const dir of [
      stenoConfigDir,
      themeLayoutsDir,
      themeComponentsDir,
      themeAssetsDir,
    ]
  ) {
    ensureDirSync(dir);
  }

  const themeRelativePath = `./${relative(projectRoot, themeDir)}`;

  // config.yml
  Deno.writeTextFileSync(
    configPath,
    `title: ${toYamlString(title)}
description: ${toYamlString(description)}
author: ${toYamlString(author)}
contentDir: "content"
output: "dist"

custom:
  shortUrls: true
  theme: ${toYamlString(themeRelativePath)}
  themeConfig:
    author: ${toYamlString(author)}
`,
  );

  // content/index.md
  Deno.writeTextFileSync(
    homePagePath,
    `---
title: Home
layout: layout
---

# Welcome to ${title}

Your Steno site is ready. Edit this page at \`content/index.md\`.
`,
  );

  // theme.yaml
  Deno.writeTextFileSync(
    themeConfigPath,
    `name: "Starter Theme"
version: "1.0.0"
components:
  header: "components/header.scr"
  footer: "components/footer.scr"
defaultConfig:
  author: ${toYamlString(author)}
`,
  );

  // layouts/layout.scr
  Deno.writeTextFileSync(
    layoutPath,
    `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{title}</title>
    <link rel="stylesheet" href="/assets/style.css" />
  </head>
  <body>
    <Header />
    <main>
      {@html content}
    </main>
    <Footer />
  </body>
</html>
`,
  );

  // components/header.scr
  Deno.writeTextFileSync(
    headerPath,
    `<header>
  <h1>{site.title}</h1>
  <p>{site.description}</p>
</header>
`,
  );

  // components/footer.scr
  Deno.writeTextFileSync(
    footerPath,
    `<footer>
  <small>Built with <a href="https://jsr.io/@steno/steno">Steno</a> by {theme.author}</small>
</footer>
`,
  );

  // assets/style.css
  Deno.writeTextFileSync(
    stylesheetPath,
    `:root {
  color-scheme: light dark;
  font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

body {
  margin: 0;
  padding: 2rem;
  max-width: 800px;
  margin-inline: auto;
  line-height: 1.6;
}

header,
footer {
  margin-block: 1.5rem;
}

main {
  margin-block: 2rem;
}
`,
  );

  // mod.ts — only when not already present
  try {
    Deno.statSync(entryPath);
  } catch {
    Deno.writeTextFileSync(
      entryPath,
      `import { Steno } from "jsr:@steno/steno";
new Steno();
`,
    );
  }

  // deno.json — only when not already present
  try {
    Deno.statSync(denoJsonPath);
  } catch {
    Deno.writeTextFileSync(
      denoJsonPath,
      `{
  "tasks": {
    "build": "deno run -A jsr:@steno/steno build",
    "dev": "deno run -A jsr:@steno/steno dev"
  },
  "imports": {
    "@steno/steno": "jsr:@steno/steno"
  }
}
`,
    );
  }

  // success

  console.log(
    `  ${paint(c.green, "✔")} Config   → ${paint(c.gray, configPath)}`,
  );
  console.log(
    `  ${paint(c.green, "✔")} Content  → ${paint(c.gray, homePagePath)}`,
  );
  console.log(`  ${paint(c.green, "✔")} Theme    → ${paint(c.gray, themeDir)}`);

  console.log();
  console.log(
    `${paint(c.purpleBold, "◆")} ${paint(c.whiteBold, "You're all set!")}`,
  );
  console.log();
  console.log(
    `  ${paint(c.cyanBold, "deno task build")}   ${
      paint(c.gray, "# build the site into dist/")
    }`,
  );
  console.log(
    `  ${paint(c.cyanBold, "deno task dev")}     ${
      paint(c.gray, "# start live-reload dev server")
    }`,
  );
  console.log();

  await Promise.resolve();
}
