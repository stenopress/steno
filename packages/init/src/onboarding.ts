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
  /** Community plugin package specifiers (e.g. `jsr:@user/plugin-name`)
   * added to the generated configuration in isolated mode. */
  communityPlugins?: string[];
  /** Official theme used by the generated project. */
  theme?: ThemeChoice;
  /** Community theme package specifier (e.g. `jsr:@user/theme-name`),
   * used instead of an official theme when set. */
  communityTheme?: string;
  /** Local theme path (e.g. `./theme`), used instead of an official or
   * community theme when set. */
  localTheme?: string;
  /** Version range applied to the selected official theme's package
   * (default: the theme's default pinned version). Ignored for community
   * and local themes. */
  themeVersion?: string;
  /** Version range applied to `@steno/steno` in the generated `deno.json`
   * (default: `^0.11.2`). */
  stenoVersion?: string;
  /** Content directory written to configuration and scaffolded into
   * (default: `content`). */
  contentDir?: string;
  /** Build output directory written to configuration (default: `dist`). */
  outputDir?: string;
  /** Whether generated redirects/pages use short URLs (default: `true`). */
  shortUrls?: boolean;
  /** Dev server port written to configuration (default: `5735`). */
  devPort?: number;
  /** Whether existing generated files may be overwritten. */
  force?: boolean;
  /** Prompts for extra project settings (content/output dirs, short URLs,
   * dev port, version pinning, local themes) instead of using defaults. */
  advanced?: boolean;
}

/** Official theme choices supported by the onboarding CLI. */
export type ThemeChoice = "minimal" | "docs-minimal" | "marketing-minimal";

const DEFAULT_STENO_VERSION = "^0.11.2";
const DEFAULT_THEME_VERSION = "^0.10.0";

const AVAILABLE_THEMES: Record<
  ThemeChoice,
  {
    label: string;
    description: string;
    packageBase: string;
    version: string;
  }
> = {
  minimal: {
    label: "Minimal",
    description: "A clean, simple theme for personal sites and blogs",
    packageBase: "jsr:@steno/theme-minimal",
    version: DEFAULT_THEME_VERSION,
  },
  "docs-minimal": {
    label: "Docs Minimal",
    description: "A minimal theme optimised for documentation sites",
    packageBase: "jsr:@steno/theme-docs-minimal",
    version: DEFAULT_THEME_VERSION,
  },
  "marketing-minimal": {
    label: "Marketing Minimal",
    description: "A polished landing-page theme for products and campaigns",
    packageBase: "jsr:@steno/theme-marketing-minimal",
    version: DEFAULT_THEME_VERSION,
  },
};

function themePackage(choice: ThemeChoice, version?: string): string {
  const theme = AVAILABLE_THEMES[choice];
  return `${theme.packageBase}@${version ?? theme.version}`;
}

/** Official plugin choices supported by the onboarding CLI. */
export type PluginChoice = "tailwind" | "shiki" | "seo" | "docs" | "search" | "og" | "image";

const OFFICIAL_PLUGINS: Record<
  PluginChoice,
  {
    label: string;
    description: string;
    package: string;
  }
> = {
  tailwind: {
    label: "Tailwind CSS",
    description:
      "Compiles Tailwind utility classes used in your content and templates during the build",
    package: "jsr:@steno/plugin-tailwind",
  },
  shiki: {
    label: "Shiki syntax highlighting",
    description: "Highlights fenced code blocks with the same grammars and themes as VS Code",
    package: "jsr:@steno/plugin-shiki",
  },
  seo: {
    label: "SEO",
    description: "Generates a sitemap, RSS and Atom feeds, and robots.txt from your site's pages",
    package: "jsr:@steno/plugin-seo",
  },
  docs: {
    label: "Docs sync",
    description: "Mirrors markdown from an external directory into contentDir before each build",
    package: "jsr:@steno/plugin-docs",
  },
  search: {
    label: "Search index",
    description: "Generates a JSON search index from your site's rendered HTML",
    package: "jsr:@steno/plugin-search",
  },
  og: {
    label: "OG image generation",
    description:
      "Auto-generates an SVG Open Graph preview image per page and injects og:image tags",
    package: "jsr:@steno/plugin-og",
  },
  image: {
    label: "Image optimization",
    description: "Resizes and optimizes images referenced by your theme's assets",
    package: "jsr:@steno/plugin-image",
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
const color = (code: string): string => (useColor ? `${ESC}${code}m` : "");

/** Shared color codes, exported so other scaffolders (theme/plugin) match this CLI's look. */
export const c = {
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

/** Wraps `text` in `color`, resetting afterward. */
export function paint(color: string, text: string): string {
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

  const stripAnsi = (s: string) => s.replace(new RegExp(`${ESC}[0-9;]*m`, "g"), "");
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

/** Prints a section header matching this CLI's onboarding output. */
export function heading(text: string): void {
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

const COMMUNITY_THEME_LABEL = "Community theme";
const LOCAL_THEME_LABEL = "Local theme";

/** Prompts for a theme and returns its resolved value, either an official
 * theme's package specifier, a community package, or a local path. In
 * `advanced` mode also offers a local-theme row and lets the pinned
 * version of an official theme be overridden. */
function selectTheme(advanced: boolean): string {
  heading("Choose a Theme");
  console.log();

  const entries = Object.entries(AVAILABLE_THEMES) as [
    ThemeChoice,
    (typeof AVAILABLE_THEMES)[ThemeChoice],
  ][];

  entries.forEach(([choice, theme], i) => {
    console.log(`  ${paint(c.purple, `${i + 1})`)} ${paint(c.whiteBold, theme.label)}`);
    console.log(`     ${paint(c.gray, theme.description)}`);
    console.log(`     ${paint(c.gray, themePackage(choice))}`);
    console.log();
  });

  type ExtraRow = {
    label: string;
    hint: string;
    handle: () => string | undefined;
  };
  const extraRows: ExtraRow[] = [];

  if (advanced) {
    extraRows.push({
      label: LOCAL_THEME_LABEL,
      hint: "Use a theme path inside this project (e.g. ./theme)",
      handle: () => promptWithDefault("Local theme path", "./theme"),
    });
  }

  extraRows.push({
    label: COMMUNITY_THEME_LABEL,
    hint: "Use your own theme package specifier",
    handle: () => promptPackageSpecifier(),
  });

  extraRows.forEach((row, i) => {
    console.log(
      `  ${paint(c.purple, `${entries.length + i + 1})`)} ${paint(c.whiteBold, row.label)}`,
    );
    console.log(`     ${paint(c.gray, row.hint)}`);
    console.log();
  });

  const maxIndex = entries.length + extraRows.length;

  while (true) {
    const arrow = paint(c.purple, "›");
    const selection = prompt(`  ${arrow} Select theme ${paint(c.gray, "[1]")}`)?.trim() || "1";

    const index = parseInt(selection) - 1;
    if (index >= 0 && index < entries.length) {
      const [choice, theme] = entries[index];
      if (!advanced) return themePackage(choice);
      const version = promptWithDefault(`${theme.label} version`, theme.version);
      return themePackage(choice, version);
    }

    if (index >= entries.length && index < maxIndex) {
      const row = extraRows[index - entries.length];
      const value = row.handle();
      if (value) return value;
      console.log(paint(c.yellow, "\n  ⚠  A value is required.\n"));
      continue;
    }

    console.log(
      paint(c.yellow, `\n  ⚠  Invalid choice. Enter a number between 1 and ${maxIndex}.\n`),
    );
  }
}

function isInteractiveTerminal(): boolean {
  try {
    return Deno.stdin.isTerminal() && Deno.stdout.isTerminal();
  } catch {
    return false;
  }
}

function setRawMode(enabled: boolean): void {
  try {
    Deno.stdin.setRaw(enabled);
  } catch {
    // stdin is not a tty; caller should have already checked isInteractiveTerminal.
  }
}

const encoder = new TextEncoder();
const write = (text: string): void => {
  Deno.stdout.writeSync(encoder.encode(text));
};

type Key = "up" | "down" | "space" | "enter" | "cancel" | "unknown";

function readKey(): Key {
  const buf = new Uint8Array(8);
  const n = Deno.stdin.readSync(buf);
  if (n === null || n === 0) return "unknown";
  const bytes = buf.subarray(0, n);

  if (bytes.length === 1) {
    switch (bytes[0]) {
      case 3: // Ctrl+C
        return "cancel";
      case 13: // Enter
      case 10:
        return "enter";
      case 32: // Space
        return "space";
    }
  }

  if (bytes.length >= 3 && bytes[0] === 27 && bytes[1] === 91) {
    if (bytes[2] === 65) return "up"; // ESC [ A
    if (bytes[2] === 66) return "down"; // ESC [ B
  }

  if (bytes[0] === 27) return "cancel"; // plain Escape

  return "unknown";
}

function truncate(text: string, maxLength: number): string {
  if (maxLength <= 1 || text.length <= maxLength) return text;
  return text.slice(0, Math.max(0, maxLength - 1)).trimEnd() + "…";
}

function promptPackageSpecifier(): string | undefined {
  const arrow = paint(c.purple, "›");
  const value = prompt(
    `  ${arrow} Package specifier ${paint(c.gray, "(e.g. jsr:@user/plugin-name)")}`,
  )?.trim();
  return value && value.length > 0 ? value : undefined;
}

type PluginSelection = { plugins: PluginChoice[]; community: string[] };

const ADD_COMMUNITY_LABEL = "Add a community plugin";

/** Interactive arrow-key/space checkbox list of official plugins, plus a
 * row that opens a text prompt for a custom community package specifier. */
function selectPluginsInteractive(): PluginSelection {
  const officialItems = (Object.keys(OFFICIAL_PLUGINS) as PluginChoice[]).map((key) => ({
    key,
    label: OFFICIAL_PLUGINS[key].label,
    description: OFFICIAL_PLUGINS[key].description,
  }));

  const selectedOfficial = new Set<number>();
  const communityPackages: string[] = [];
  const selectedCommunity = new Set<number>();
  let cursor = 0;

  type Row =
    | { type: "official"; index: number }
    | { type: "add-community" }
    | { type: "community"; index: number };

  const buildRows = (): Row[] => [
    ...officialItems.map((_, index): Row => ({ type: "official", index })),
    { type: "add-community" },
    ...communityPackages.map((_, index): Row => ({ type: "community", index })),
  ];

  const maxLabelWidth = Math.max(
    ...officialItems.map((item) => item.label.length),
    ADD_COMMUNITY_LABEL.length,
  );

  const descWidth = (): number => {
    const termWidth = (() => {
      try {
        return Deno.consoleSize().columns;
      } catch {
        return 80;
      }
    })();
    const prefixLen = 2 + 1 + 1 + 3 + 1 + maxLabelWidth + 2;
    return Math.max(20, termWidth - prefixLen);
  };

  const renderRow = (row: Row, active: boolean): string => {
    const pointer = active ? paint(c.purple, "❯") : " ";
    const paintLabel = (label: string) =>
      paint(active ? c.whiteBold : c.white, label.padEnd(maxLabelWidth));

    if (row.type === "official") {
      const item = officialItems[row.index];
      const box = selectedOfficial.has(row.index) ? paint(c.green, "[x]") : paint(c.gray, "[ ]");
      const desc = truncate(item.description, descWidth());
      return `  ${pointer} ${box} ${paintLabel(item.label)}  ${paint(c.gray, desc)}`;
    }

    if (row.type === "add-community") {
      const desc = truncate("type a package specifier of your own", descWidth());
      return `  ${pointer} ${paint(c.cyan, "[+]")} ${paintLabel(ADD_COMMUNITY_LABEL)}  ${paint(
        c.gray,
        desc,
      )}`;
    }

    const pkg = communityPackages[row.index];
    const box = selectedCommunity.has(row.index) ? paint(c.green, "[x]") : paint(c.gray, "[ ]");
    return `  ${pointer} ${box} ${paint(active ? c.whiteBold : c.white, pkg)}  ${paint(
      c.gray,
      "community plugin",
    )}`;
  };

  let lastRowCount = 0;
  const render = (first: boolean): void => {
    const rows = buildRows();
    if (!first) write(`${ESC}${lastRowCount}A`);
    for (let i = 0; i < rows.length; i++) {
      write(`\r${ESC}2K${renderRow(rows[i], i === cursor)}\n`);
    }
    lastRowCount = rows.length;
  };

  write(`${ESC}?25l`); // hide cursor
  setRawMode(true);

  try {
    let first = true;
    while (true) {
      render(first);
      first = false;

      const rows = buildRows();
      const key = readKey();

      if (key === "up") {
        cursor = (cursor - 1 + rows.length) % rows.length;
      } else if (key === "down") {
        cursor = (cursor + 1) % rows.length;
      } else if (key === "space") {
        const row = rows[cursor];
        if (row.type === "official") {
          selectedOfficial.has(row.index)
            ? selectedOfficial.delete(row.index)
            : selectedOfficial.add(row.index);
        } else if (row.type === "community") {
          selectedCommunity.has(row.index)
            ? selectedCommunity.delete(row.index)
            : selectedCommunity.add(row.index);
        }
      } else if (key === "enter") {
        const row = rows[cursor];
        if (row.type === "add-community") {
          setRawMode(false);
          write(`${ESC}?25h`);
          const pkg = promptPackageSpecifier();
          setRawMode(true);
          write(`${ESC}?25l`);
          if (pkg) {
            communityPackages.push(pkg);
            selectedCommunity.add(communityPackages.length - 1);
            cursor = officialItems.length + 1 + (communityPackages.length - 1);
          }
          first = true;
        } else {
          break;
        }
      } else if (key === "cancel") {
        setRawMode(false);
        write(`${ESC}?25h`);
        console.log();
        Deno.exit(130);
      }
    }
  } finally {
    setRawMode(false);
    write(`${ESC}?25h`);
  }

  console.log();

  return {
    plugins: officialItems.filter((_, i) => selectedOfficial.has(i)).map((item) => item.key),
    community: communityPackages.filter((_, i) => selectedCommunity.has(i)),
  };
}

function selectPlugins(): PluginSelection {
  heading("Choose Plugins");
  console.log();

  const items = (Object.keys(OFFICIAL_PLUGINS) as PluginChoice[]).map((key) => ({
    key,
    label: OFFICIAL_PLUGINS[key].label,
    description: OFFICIAL_PLUGINS[key].description,
  }));

  if (!isInteractiveTerminal()) {
    console.log(`  ${paint(c.gray, "Official plugins available in this starter:")}`);
    for (const item of items) {
      console.log(
        `  ${paint(c.purple, "•")} ${item.label}  ${paint(
          c.gray,
          `(${OFFICIAL_PLUGINS[item.key].package})`,
        )}`,
      );
    }
    console.log();

    const plugins: PluginChoice[] = [];
    for (const item of items) {
      if (promptYesNo(`Add ${item.label}?`, false)) {
        plugins.push(item.key);
      }
    }

    const community: string[] = [];
    while (promptYesNo("Add a community plugin?", false)) {
      const pkg = promptPackageSpecifier();
      if (pkg) community.push(pkg);
    }

    return { plugins, community };
  }

  console.log(paint(c.gray, "  ↑/↓ move   space toggle   enter select/confirm"));
  console.log();

  return selectPluginsInteractive();
}

function toPluginList(plugins: PluginChoice[], community: string[]): string {
  if (plugins.length === 0 && community.length === 0) return "";

  return [
    "plugins:",
    ...plugins.flatMap((plugin) => [
      `  - package: ${toYamlString(OFFICIAL_PLUGINS[plugin].package)}`,
      "    mode: trusted",
    ]),
    ...community.flatMap((pkg) => [`  - package: ${toYamlString(pkg)}`, "    mode: isolated"]),
    "",
  ].join("\n");
}

export function parsePluginChoices(value?: string): PluginChoice[] {
  if (!value) return [];

  const choices = new Set<PluginChoice>();
  for (const rawChoice of value.split(",")) {
    const choice = rawChoice.trim().toLowerCase();
    if (!choice) continue;
    if (Object.hasOwn(OFFICIAL_PLUGINS, choice)) {
      choices.add(choice as PluginChoice);
      continue;
    }
    throw new OnboardingError(
      `Unknown plugin "${rawChoice.trim()}". Available plugins: ${Object.keys(
        OFFICIAL_PLUGINS,
      ).join(", ")}.`,
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
    `Unknown theme "${value.trim()}". Available themes: ${Object.keys(AVAILABLE_THEMES).join(
      ", ",
    )}.`,
  );
}

/**
 * Throws {@link OnboardingError} naming any of `paths` that already exist,
 * so a scaffolder can fail loudly instead of silently overwriting a file —
 * unless the caller already checked its own `force` flag.
 */
export function checkOverwrite(paths: string[]): void {
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
      `Aborted: the following files already exist:\n${existing
        .map((p) => `  ${paint(c.purple, "•")} ${p}`)
        .join("\n")}\n\nUse ${paint(c.whiteBold, "--force")} to overwrite.`,
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

  const title = options?.title ?? promptWithDefault("Site title", "My Steno Site");
  const description =
    options?.description ?? promptWithDefault("Site description", "A site built with Steno");
  const author = options?.author ?? promptWithDefault("Author", "Your Name");
  let plugins = options?.plugins;
  let communityPlugins = options?.communityPlugins;
  if (plugins === undefined && communityPlugins === undefined) {
    const selection = selectPlugins();
    plugins = selection.plugins;
    communityPlugins = selection.community;
  }
  plugins ??= [];
  communityPlugins ??= [];

  const advanced = options?.advanced ?? false;
  if (advanced) {
    heading("Advanced Options");
    console.log(paint(c.gray, "  Press Enter to accept the defaults.\n"));
  }

  const contentDirName =
    options?.contentDir ??
    (advanced ? promptWithDefault("Content directory", "content") : "content");
  const outputDirName =
    options?.outputDir ?? (advanced ? promptWithDefault("Output directory", "dist") : "dist");
  const shortUrls =
    options?.shortUrls ?? (advanced ? promptYesNo("Enable short URLs?", true) : true);
  const devPort =
    options?.devPort ??
    (advanced ? parseInt(promptWithDefault("Dev server port", "5735"), 10) || 5735 : 5735);
  const stenoVersion =
    options?.stenoVersion ??
    (advanced
      ? promptWithDefault("@steno/steno version", DEFAULT_STENO_VERSION)
      : DEFAULT_STENO_VERSION);

  const contentDirPath = join(projectRoot, contentDirName);
  const stenoConfigDir = join(contentDirPath, ".steno");
  const configPath = join(stenoConfigDir, "config.yml");
  const homePagePath = join(contentDirPath, "index.md");
  const denoJsonPath = join(projectRoot, "deno.json");

  if (!options?.force) {
    checkOverwrite([configPath, homePagePath]);
  }

  heading("Scaffolding");
  console.log();

  for (const dir of [stenoConfigDir]) {
    Deno.mkdirSync(dir, { recursive: true });
  }

  // config.yml
  const resolvedTheme = options?.theme
    ? themePackage(options.theme, options.themeVersion)
    : (options?.communityTheme ?? options?.localTheme ?? selectTheme(advanced));

  Deno.writeTextFileSync(
    configPath,
    `title: ${toYamlString(title)}
description: ${toYamlString(description)}
author: ${toYamlString(author)}
${toPluginList(plugins, communityPlugins)}contentDir: ${toYamlString(contentDirName)}
output: ${toYamlString(outputDirName)}
devPort: ${devPort}

custom:
  shortUrls: ${shortUrls}
  theme: ${toYamlString(resolvedTheme)}
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

Your Steno site is ready. Edit this page at \`${contentDirName}/index.md\`.
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
    "@steno/steno": "jsr:@steno/steno@${stenoVersion}"
  }
}
`,
    );
  }

  // success

  console.log(`  ${paint(c.green, "✔")} Config   → ${paint(c.gray, configPath)}`);
  console.log(`  ${paint(c.green, "✔")} Content  → ${paint(c.gray, homePagePath)}`);
  console.log(`  ${paint(c.green, "✔")} Theme    → ${paint(c.gray, resolvedTheme)}`);

  console.log();
  console.log(`${paint(c.purpleBold, "◆")} ${paint(c.whiteBold, "You're all set!")}`);
  console.log();
  console.log(
    `  ${paint(c.cyanBold, "deno task build")}   ${paint(c.gray, "# build the site into dist/")}`,
  );
  console.log(
    `  ${paint(c.cyanBold, "deno task dev")}     ${paint(
      c.gray,
      "# start live-reload dev server",
    )}`,
  );
  console.log();

  await Promise.resolve();
}
