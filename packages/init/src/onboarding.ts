/**
 * @steno/init/onboarding - Core logic for scaffolding new Steno static-site projects.
 *
 * This module contains the interactive prompts and file generation logic
 * for setting up a new Steno project.
 *
 * @module
 */

import { join } from "@std/path";

/** Options that can be passed directly to {@link runOnboarding}. When a field
 * is omitted the user is prompted interactively. */
export interface ProjectOptions {
  /** Site title written to configuration and starter content. */
  title?: string;
  /** Site description written to configuration. */
  description?: string;
  /** Default author written to configuration. */
  author?: string;
  /** Official plugins added to the generated configuration. */
  plugins?: PluginChoice[];
  /** Official theme used by the generated project. */
  theme?: ThemeChoice;
  /** Whether existing generated files may be overwritten. */
  force?: boolean;
}

/** Official theme choices supported by the onboarding CLI. */
export type ThemeChoice = "minimal" | "docs-minimal" | "marketing-minimal";

const AVAILABLE_THEMES: Record<ThemeChoice, {
  label: string;
  description: string;
  package: string;
}> = {
  "minimal": {
    label: "Minimal",
    description: "A clean, simple theme for personal sites and blogs",
    package: "jsr:@steno/theme-minimal@^0.10.0",
  },
  "docs-minimal": {
    label: "Docs Minimal",
    description: "A minimal theme optimised for documentation sites",
    package: "jsr:@steno/theme-docs-minimal@^0.10.0",
  },
  "marketing-minimal": {
    label: "Marketing Minimal",
    description: "A polished landing-page theme for products and campaigns",
    package: "jsr:@steno/theme-marketing-minimal@^0.10.0",
  },
};

/** Official plugin choices supported by the onboarding CLI. */
export type PluginChoice = "tailwind" | "shiki";

const OFFICIAL_PLUGINS: Record<PluginChoice, {
  label: string;
  package: string;
}> = {
  tailwind: {
    label: "Tailwind CSS",
    package: "jsr:@steno/plugin-tailwind",
  },
  shiki: {
    label: "Shiki syntax highlighting",
    package: "jsr:@steno/plugin-shiki",
  },
};

/** Thrown when scaffolding fails for an expected reason (e.g. files already
 * exist). Catching this lets callers do `Deno.exit(1)` cleanly. */
export class OnboardingError extends Error {
  /** Creates an expected onboarding failure with a user-facing message. */
  constructor(message: string) {
    super(message);
    this.name = "OnboardingError";
  }
}

const ESC = "\x1b[";

function noColorRequested(): boolean {
  try {
    return Deno.env.get("NO_COLOR") !== undefined;
  } catch {
    return false;
  }
}

const useColor = !noColorRequested();
const color = (code: string): string => useColor ? `${ESC}${code}m` : "";

const c = {
  reset: color("0"),
  bold: color("1"),
  dim: color("2"),
  purple: color("38;5;135"),
  purpleBold: color("1;38;5;135"),
  white: color("97"),
  whiteBold: color("1;97"),
  gray: color("38;5;245"),
  green: color("38;5;120"),
  yellow: color("38;5;222"),
  cyan: color("38;5;159"),
  cyanBold: color("1;38;5;159"),
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

  const stripAnsi = (s: string) =>
    s.replace(new RegExp(`${ESC}[0-9;]*m`, "g"), "");
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

  for (const line of logo) console.log(p + (useColor ? line : stripAnsi(line)));
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

function promptYesNo(label: string, defaultValue = false): boolean {
  const arrow = paint(c.purple, "›");
  const hint = defaultValue ? paint(c.gray, "[Y/n]") : paint(c.gray, "[y/N]");

  while (true) {
    const value = prompt(`  ${arrow} ${label} ${hint}`)?.trim().toLowerCase();
    if (!value) return defaultValue;
    if (value === "y" || value === "yes") return true;
    if (value === "n" || value === "no") return false;
    console.log(paint(c.yellow, "  ⚠  Please answer yes or no."));
  }
}

function selectTheme(): ThemeChoice {
  heading("Choose a Theme");
  console.log();

  const entries = Object.entries(AVAILABLE_THEMES) as [
    ThemeChoice,
    typeof AVAILABLE_THEMES[ThemeChoice],
  ][];

  entries.forEach(([, theme], i) => {
    console.log(
      `  ${paint(c.purple, `${i + 1})`)} ${paint(c.whiteBold, theme.label)}`,
    );
    console.log(
      `     ${paint(c.gray, theme.description)}`,
    );
    console.log(
      `     ${paint(c.gray, theme.package)}`,
    );
    console.log();
  });

  while (true) {
    const arrow = paint(c.purple, "›");
    const selection =
      prompt(`  ${arrow} Select theme ${paint(c.gray, "[1]")}`)?.trim() || "1";

    const index = parseInt(selection) - 1;
    if (index >= 0 && index < entries.length) {
      return entries[index][0];
    }

    console.log(
      paint(
        c.yellow,
        `\n  ⚠  Invalid choice. Enter a number between 1 and ${entries.length}.\n`,
      ),
    );
  }
}

function selectPlugins(): PluginChoice[] {
  heading("Choose Plugins");
  console.log();
  console.log(
    `  ${paint(c.gray, "Official plugins available in this starter:")}`,
  );
  console.log(
    `  ${paint(c.purple, "•")} ${OFFICIAL_PLUGINS.tailwind.label}  ${
      paint(c.gray, `(${OFFICIAL_PLUGINS.tailwind.package})`)
    }`,
  );
  console.log(
    `  ${paint(c.purple, "•")} ${OFFICIAL_PLUGINS.shiki.label}  ${
      paint(c.gray, `(${OFFICIAL_PLUGINS.shiki.package})`)
    }`,
  );
  console.log();

  const selected: PluginChoice[] = [];
  for (const choice of ["tailwind", "shiki"] as const) {
    if (promptYesNo(`Add ${OFFICIAL_PLUGINS[choice].label}?`, false)) {
      selected.push(choice);
    }
  }

  return selected;
}

function toPluginList(plugins: PluginChoice[]): string {
  if (plugins.length === 0) return "";

  return [
    "plugins:",
    ...plugins.flatMap((plugin) => [
      `  - package: ${toYamlString(OFFICIAL_PLUGINS[plugin].package)}`,
      "    mode: trusted",
    ]),
    "",
  ].join("\n");
}

export function parsePluginChoices(value?: string): PluginChoice[] {
  if (!value) return [];

  const choices = new Set<PluginChoice>();
  for (const rawChoice of value.split(",")) {
    const choice = rawChoice.trim().toLowerCase();
    if (!choice) continue;
    if (choice === "tailwind" || choice === "shiki") {
      choices.add(choice);
      continue;
    }
    throw new OnboardingError(
      `Unknown plugin "${rawChoice.trim()}". Available plugins: tailwind, shiki.`,
    );
  }

  return [...choices];
}

export function parseThemeChoice(value?: string): ThemeChoice | undefined {
  if (!value) return undefined;

  const choice = value.trim().toLowerCase();
  if (Object.hasOwn(AVAILABLE_THEMES, choice)) {
    return choice as ThemeChoice;
  }
  throw new OnboardingError(
    `Unknown theme "${value.trim()}". Available themes: ${
      Object.keys(AVAILABLE_THEMES).join(", ")
    }.`,
  );
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
  options?: ProjectOptions,
): Promise<void> {
  printBanner();
  heading("Project Details");
  console.log(paint(c.gray, "  Press Enter to accept the defaults.\n"));

  const title = options?.title ??
    promptWithDefault("Site title", "My Steno Site");
  const description = options?.description ??
    promptWithDefault("Site description", "A site built with Steno");
  const author = options?.author ?? promptWithDefault("Author", "Your Name");
  const plugins = options?.plugins ?? selectPlugins();

  const contentDir = join(projectRoot, "content");
  const stenoConfigDir = join(contentDir, ".steno");
  const configPath = join(stenoConfigDir, "config.yml");
  const homePagePath = join(contentDir, "index.md");
  const denoJsonPath = join(projectRoot, "deno.json");

  if (!options?.force) {
    checkOverwrite([
      configPath,
      homePagePath,
    ]);
  }

  heading("Scaffolding");
  console.log();

  for (
    const dir of [
      stenoConfigDir,
    ]
  ) {
    Deno.mkdirSync(dir, { recursive: true });
  }

  // config.yml
  const selectedTheme = options?.theme ?? selectTheme();
  const themePackage = AVAILABLE_THEMES[selectedTheme].package;

  Deno.writeTextFileSync(
    configPath,
    `title: ${toYamlString(title)}
description: ${toYamlString(description)}
author: ${toYamlString(author)}
${toPluginList(plugins)}contentDir: "content"
output: "dist"

custom:
  shortUrls: true
  theme: ${toYamlString(themePackage)}
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

  // deno.json - only when not already present
  try {
    Deno.statSync(denoJsonPath);
  } catch {
    Deno.writeTextFileSync(
      denoJsonPath,
      `{
  "tasks": {
    "build": "deno run --allow-read=. --allow-write=. --allow-net=jsr.io --allow-env @steno/steno build",
    "dev": "deno run --allow-read=. --allow-write=. --allow-net=127.0.0.1,0.0.0.0,jsr.io --allow-env @steno/steno dev"
  },
  "imports": {
    "@steno/steno": "jsr:@steno/steno@^0.10.0"
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
  console.log(
    `  ${paint(c.green, "✔")} Theme    → ${paint(c.gray, themePackage)}`,
  );

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
