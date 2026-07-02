import { loadConfig, loadPlugins } from "./config.ts";
import { Theme } from "../theme/theme.ts";
import type { StenoTheme, SiteConfig, StenoPlugin } from "../types.ts";
import { ensureDirSync } from "../utils/fileUtils.ts";
import { parseFrontmatter } from "../utils/frontmatter.ts";
import { startDevServer } from "../utils/server.ts";
import { parseCliArgs, printHelp } from "../utils/cli.ts";
import { runAstTransforms, runHtmlTransforms } from "../plugins/plugins.ts";
import { buildCollections, type CollectionMap } from "./collections.ts";
import { marked } from "marked";
import { dirname, isAbsolute, join } from "@std/path";

export interface StenoHooks {
  beforeBuild?: (config: SiteConfig) => void | Promise<void>;
  afterPage?: (page: { path: string; html: string }) => void | Promise<void>;
  afterBuild?: (config: SiteConfig) => void | Promise<void>;
}

export class Steno {
  private readonly config: SiteConfig;
  private theme?: Theme;
  private readonly themeLoadingPromise: Promise<void>;
  private readonly autoBuildOnInit: boolean;
  private plugins: StenoPlugin[] = [];
  private readonly pluginsLoadingPromise: Promise<void>;

  constructor(
    configPath: string = "content/.steno/config.yml",
    autoBuildOnInit = true,
    private hooks: StenoHooks = {},
  ) {
    this.config = loadConfig(configPath);
    this.autoBuildOnInit = autoBuildOnInit;
    this.themeLoadingPromise = this.loadTheme();
    this.pluginsLoadingPromise = this.loadPlugins();
    this.init();
  }

  private async loadPlugins(): Promise<void> {
    await this.themeLoadingPromise;
    const sitePlugins = await loadPlugins(this.config);
    this.plugins = [...(this.theme?.plugins ?? []), ...sitePlugins];
  }

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
          this.theme = Theme.loadFromDirectory(
            themeDir,
            this.config.custom?.themeConfig,
          );
          return;
        }

        let resolvedPath = themeName.startsWith("file://")
          ? themeName
          : `file://${
            isAbsolute(themeName) ? themeName : join(Deno.cwd(), themeName)
          }`;

        let stat: Deno.FileInfo | undefined;
        try {
          stat = Deno.statSync(new URL(resolvedPath));
        } catch {
          // Stat failed, try importing directly.
        }

        if (stat?.isDirectory) {
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
            console.error(
              `Failed to load theme "${themeName}": Could not find mod.ts, theme.ts, or index.ts in theme directory "${themeName}"`,
            );
            return;
          }
        }

        const themeModule = await import(resolvedPath);
        const themeData = (themeModule.default || themeModule) as StenoTheme;
        this.theme = new Theme(themeData, this.config.custom?.themeConfig);
      } else {
        const themeModule = await import(themeName);
        const themeData = (themeModule.default || themeModule) as StenoTheme;
        this.theme = new Theme(themeData, this.config.custom?.themeConfig);
      }
    } catch (error) {
      console.error(`Failed to load theme "${themeName}":`, error);
    }
  }

  public async build(): Promise<void> {
    await this.themeLoadingPromise;
    await this.pluginsLoadingPromise;

    for (const plugin of this.plugins) {
      await plugin.beforeBuild?.(this.config);
    }
    await this.hooks.beforeBuild?.(this.config);

    const contentDir = this.config.contentDir || "content";
    const outputDir = this.config.output || "dist";

    ensureDirSync(outputDir);

    const collections: CollectionMap = await buildCollections(
      contentDir,
      this.config,
      this.plugins,
    );

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

          const { frontmatter, body } = parseFrontmatter(
            fileContents,
            fullPath,
          );

          let tokens = marked.lexer(body);
          tokens = await runAstTransforms(tokens, this.plugins);
          let htmlContent = marked.parser(tokens);
          htmlContent = await runHtmlTransforms(htmlContent, this.plugins);

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

          const layoutName = typeof frontmatter.layout === "string"
            ? frontmatter.layout
            : "layout";

          const renderedContent = this.theme
            ? this.theme.renderLayout(layoutName, htmlContent, {
              site: { ...this.config },
              theme: {
                name: this.theme.name,
                version: this.theme.version,
                ...this.theme.config,
              },
              collections,
              title: frontmatter.title || this.config.title,
              ...frontmatter,
            })
            : htmlContent;

          Deno.writeTextFileSync(outputFilePath, renderedContent);

          await this.hooks.afterPage?.({
            path: outputFilePath,
            html: renderedContent,
          });
          for (const plugin of this.plugins) {
            await plugin.afterPage?.({
              path: outputFilePath,
              html: renderedContent,
            });
          }
        }
      }
    };

    await processDirectory(contentDir);

    if (this.theme) {
      await this.theme.copyAssets(outputDir);
    }

    for (const plugin of this.plugins) {
      await plugin.afterBuild?.(this.config);
    }

    await this.hooks.afterBuild?.(this.config);

    console.log("Build complete.");
  }

  public async dev(): Promise<void> {
    const contentDir = this.config.contentDir || "content";
    const outputDir = this.config.output || "dist";
    await startDevServer(outputDir, () => this.build(), contentDir);
  }

  private async init() {
    if (this.autoBuildOnInit && !Deno.args.includes("dev")) {
      await this.build();
    }
  }
}

export function runStenoCli(args: string[]): Promise<void> | void {
  const options = parseCliArgs(args);

  if (options.command === "help") {
    printHelp();
    return;
  }

  const steno = new Steno(options.configPath, false);
  return options.command === "dev" ? steno.dev() : steno.build();
}
