import { Theme } from "../theme/theme.ts";
import type { SiteConfig, StenoHooks, StenoPlugin } from "../types.ts";
import { isStenoPlugin } from "../plugins/plugins.ts";
import { startDevServer } from "../utils/server.ts";
import { loadPlugins } from "./config.ts";
import { buildSite, type BuildState } from "./steno_build.ts";
import { loadTheme } from "./steno_theme.ts";
import { resolveProject, type ResolvedProject } from "./project.ts";
import { join } from "@std/path";

/** Coordinates config loading, theme setup, and site builds. */
export class Steno {
  private config!: SiteConfig;
  private theme?: Theme;
  private readonly themeLoadingPromise: Promise<void>;
  private readonly autoBuildOnInit: boolean;
  private plugins: StenoPlugin[] = [];
  private readonly pluginsLoadingPromise: Promise<void>;
  private readonly projectPromise: Promise<ResolvedProject>;
  private readonly buildState: BuildState = {
    signature: null,
    pages: new Map(),
  };

  constructor(
    configPath: string = "content/.steno/config.yml",
    autoBuildOnInit = true,
    private hooks: StenoHooks = {},
  ) {
    this.autoBuildOnInit = autoBuildOnInit;
    this.projectPromise = resolveProject(configPath);
    this.themeLoadingPromise = this.projectPromise.then(async (project) => {
      this.config = project.config;
      this.theme = await loadTheme(project.config);
    });
    this.pluginsLoadingPromise = this.loadPlugins();
    this.init();
  }

  /** Resolves and loads the configured plugins. */
  private async loadPlugins(): Promise<void> {
    const project = await this.projectPromise;
    await this.themeLoadingPromise;
    const sitePlugins = await loadPlugins(project.config);
    const allowThemePlugins = project.config.custom?.pluginSecurity
      ?.allowThemePlugins !== false;
    const themePlugins = allowThemePlugins
      ? (this.theme?.plugins ?? []).filter((plugin, index) => {
        if (!isStenoPlugin(plugin)) {
          console.warn(
            `Theme plugin at index ${index} is invalid and will be skipped.`,
          );
          return false;
        }
        return true;
      })
      : [];

    if (!allowThemePlugins && (this.theme?.plugins?.length ?? 0) > 0) {
      console.warn(
        "Theme plugins are disabled by `custom.pluginSecurity.allowThemePlugins: false`.",
      );
    }

    this.plugins = [...themePlugins, ...sitePlugins];
  }

  /** Builds the site once using the loaded configuration and theme. */
  public async build(): Promise<void> {
    const project = await this.projectPromise;
    await this.themeLoadingPromise;
    await this.pluginsLoadingPromise;

    await buildSite({
      config: project.config,
      theme: this.theme,
      plugins: this.plugins,
      hooks: this.hooks,
      state: this.buildState,
      pages: project.pages,
    });
  }

  /** Starts the development server with live reload. */
  public async dev(): Promise<void> {
    const project = await this.projectPromise;
    const contentDir = project.config.contentDir || "content";
    const outputDir = project.config.output || "dist";
    await startDevServer(
      outputDir,
      () => this.build(),
      contentDir,
      [join(contentDir, ".steno"), outputDir],
    );
  }

  /** Triggers the initial build unless dev mode is active. */
  private async init() {
    if (this.autoBuildOnInit && !Deno.args.includes("dev")) {
      await this.build();
    }
  }
}
