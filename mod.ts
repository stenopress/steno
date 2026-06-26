/**
 * Steno: A fast Deno-powered static site generator.
 *
 * This module exports the main {@link Steno} orchestrator class, the {@link Theme} class for managing theme templates
 * and assets, and Scribe rendering utilities.
 *
 * @example
 * ```ts
 * import { Steno } from "@steno/steno";
 *
 * const steno = new Steno("content/.steno/config.yml");
 * await steno.build();
 * ```
 *
 * @module
 */

import { loadConfig, type SiteConfig } from "./src/config.ts";
import { Theme } from "./src/theme/theme.ts";
import type { StenoTheme } from "./src/theme/types.ts";
import { ensureDirSync } from "./src/fileUtils.ts";
import { parseFrontmatter } from "./src/frontmatter.ts";
import { startDevServer } from "./src/server.ts";
import { parseCliArgs, printHelp } from "./src/cli.ts";
import { marked } from "marked";
import { dirname, isAbsolute, join } from "@std/path";

export { filters, render } from "./src/scribe.ts";
export type { ScribeOptions } from "./src/scribe.ts";
export type { SiteConfig } from "./src/config.ts";
export type { StenoTheme } from "./src/theme/types.ts";
export { Theme } from "./src/theme/theme.ts";

export interface StenoHooks {
  beforeBuild?: (config: SiteConfig) => void | Promise<void>;
  afterPage?: (page: { path: string; html: string }) => void | Promise<void>;
  afterBuild?: (config: SiteConfig) => void | Promise<void>;
}

/**
 * The main orchestrator class for a Steno static site project.
 * It manages configuration loading, theme resolution, building markdown files to HTML, and dev server watching.
 *
 * @example
 * ```ts
 * import { Steno } from "@steno/steno";
 *
 * const steno = new Steno();
 * await steno.build();
 * ```
 */
export class Steno {
  private config: SiteConfig;
  private theme?: Theme;
  private themeLoadingPromise: Promise<void>;
  private autoBuildOnInit: boolean;

  /**
   * Creates a new Steno instance.
   *
   * @param configPath Path to the site config file. Defaults to `"content/.steno/config.yml"`.
   * @param autoBuildOnInit If true, triggers a build immediately on instantiation unless running in dev mode.
   */
  constructor(
      configPath: string = "content/.steno/config.yml",
      autoBuildOnInit = true,
      private hooks: StenoHooks = {},
  ) {
    this.config = loadConfig(configPath);
    this.autoBuildOnInit = autoBuildOnInit;
    this.themeLoadingPromise = this.loadTheme();
    this.init();
  }

  /**
   * Dynamically imports the JSR/NPM theme package, or loads a local
   * filesystem-based theme directory if a theme.yaml configuration file is present.
   */
  private async loadTheme(): Promise<void> {
    const themeName = this.config.custom?.theme;
    if (!themeName) return;

    try {
      const isLocalPath = themeName.startsWith(".") ||
        themeName.startsWith("/") ||
        themeName.startsWith("file://");

      if (isLocalPath) {
        const themeDir = themeName.startsWith("file://")
          ? new URL(themeName).pathname
          : (isAbsolute(themeName) ? themeName : join(Deno.cwd(), themeName));

        // Check if theme.yaml or theme.yml exists inside the directory
        let hasThemeYaml = false;
        try {
          Deno.statSync(join(themeDir, "theme.yaml"));
          hasThemeYaml = true;
        } catch {
          try {
            Deno.statSync(join(themeDir, "theme.yml"));
            hasThemeYaml = true;
          } catch {
            // ignore
          }
        }

        if (hasThemeYaml) {
          // Load filesystem-based theme
          this.theme = Theme.loadFromDirectory(
            themeDir,
            this.config.custom?.themeConfig,
          );
          return;
        }

        // Otherwise, import as a standard Deno file module
        let resolvedPath = themeName.startsWith("file://")
          ? themeName
          : `file://${
            isAbsolute(themeName) ? themeName : join(Deno.cwd(), themeName)
          }`;

        try {
          const stat = Deno.statSync(new URL(resolvedPath));
          if (stat.isDirectory) {
            let found = false;
            for (const entry of ["mod.ts", "theme.ts", "index.ts"]) {
              const testPath = `${resolvedPath.replace(/\/$/, "")}/${entry}`;
              try {
                Deno.statSync(new URL(testPath));
                resolvedPath = testPath;
                found = true;
                break;
              } catch {
                // ignore
              }
            }
            if (!found) {
              throw new Error(
                `Could not find mod.ts, theme.ts, or index.ts in theme directory "${themeName}"`,
              );
            }
          }
        } catch {
          // Stat failed, try importing directly
        }
        const themeModule = await import(resolvedPath);
        const themeData = (themeModule.default || themeModule) as StenoTheme;
        this.theme = new Theme(themeData, this.config.custom?.themeConfig);
      } else {
        // Dynamic import of remote JSR packages, npm packages, or URLs
        const themeModule = await import(themeName);
        const themeData = (themeModule.default || themeModule) as StenoTheme;
        this.theme = new Theme(themeData, this.config.custom?.themeConfig);
      }
    } catch (error) {
      console.error(`Failed to load theme "${themeName}":`, error);
    }
  }

  /**
   * Compiles the Markdown files into the final HTML output directory.
   *
   * @returns A promise that resolves when the build is complete.
   */
    public async build(): Promise<void> {
    await this.themeLoadingPromise;

    await this.hooks.beforeBuild?.(this.config);

    const contentDir = this.config.contentDir || "content";
    const outputDir = this.config.output || "dist";

    ensureDirSync(outputDir);

    const processDirectory = async (currentDir: string, relPath = "") => {
      for (const entry of Deno.readDirSync(currentDir)) {
        const fullPath = join(currentDir, entry.name);
        const entryRelPath = relPath ? join(relPath, entry.name) : entry.name;

        if (entry.isDirectory) {
          if (entry.name !== ".steno") {
            await processDirectory(fullPath, entryRelPath);
          }
        } else if (entry.isFile && entry.name.endsWith(".md")) {
          const fileContents = Deno.readTextFileSync(fullPath);

          // Parse frontmatter and content body
          const { frontmatter, body } = parseFrontmatter(
              fileContents,
              fullPath,
          );

          // Convert Markdown to HTML
          const htmlContent = await marked.parse(body);

          // Determine output file path
          let outputFilePath = join(
              outputDir,
              entryRelPath.replace(/\.md$/, ".html"),
          );
          if (this.config.custom?.shortUrls) {
            if (entryRelPath !== "index.md") {
              const cleanRelPath = entryRelPath.replace(/\.md$/, "");
              outputFilePath = join(outputDir, cleanRelPath);
              ensureDirSync(outputFilePath);
              outputFilePath = join(outputFilePath, "index.html");
            } else {
              outputFilePath = join(outputDir, "index.html");
            }
          } else {
            ensureDirSync(dirname(outputFilePath));
          }

          // Determine layout
          const layoutName = typeof frontmatter.layout === "string"
              ? frontmatter.layout
              : "layout";

          // Render using the theme's layout if available
          const renderedContent = this.theme
              ? await this.theme.renderLayout(layoutName, htmlContent, {
                site: {
                  ...this.config,
                },
                theme: {
                  name: this.theme.name,
                  version: this.theme.version,
                  ...this.theme.config,
                },
                title: frontmatter.title || this.config.title,
                ...frontmatter,
              })
              : htmlContent;

          // Write the rendered content to the output file
          Deno.writeTextFileSync(outputFilePath, renderedContent);

          await this.hooks.afterPage?.({ path: outputFilePath, html: renderedContent });
        }
      }
    };

    await processDirectory(contentDir);

    // Compile and copy theme assets if applicable
    if (this.theme) {
      await this.theme.copyAssets(outputDir);
    }

    console.log("Build complete.");

    await this.hooks.afterBuild?.(this.config);
  }

  /**
   * Starts a development server with automatic file watching and rebuilding on change.
   *
   * @returns A promise that resolves when the dev server starts.
   */
  public async dev(): Promise<void> {
    const contentDir = this.config.contentDir || "content";
    const outputDir = this.config.output || "dist";
    await startDevServer(outputDir, () => this.build(), contentDir);
  }

  /**
   * Initializes the application.
   */
  private async init() {
    if (this.autoBuildOnInit && !Deno.args.includes("dev")) {
      await this.build();
    }
  }
}

if (import.meta.main) {
  try {
    const options = parseCliArgs(Deno.args);

    if (options.command === "help") {
      printHelp();
    } else if (options.command === "dev") {
      const steno = new Steno(options.configPath, false);
      await steno.dev();
    } else {
      const steno = new Steno(options.configPath, false);
      await steno.build();
    }
  } catch (error) {
    console.error((error as Error).message);
    printHelp();
    Deno.exit(1);
  }
}
