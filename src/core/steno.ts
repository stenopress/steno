import type { Theme } from "../theme/theme.ts";
import type { SiteConfig, StenoHooks, StenoPlugin } from "../types.ts";
import { isStenoPlugin } from "../plugins/plugins.ts";
import { disposeIsolatedPlugins } from "../plugins/isolated_plugin.ts";
import { DEFAULT_DEV_PORT, startDevServer } from "../utils/server.ts";
import { loadPlugins } from "./config.ts";
import { buildSite, type BuildState } from "./build/build.ts";
import { loadTheme } from "./steno_theme.ts";
import { type ResolvedProject, resolveProject } from "./project.ts";
import { join } from "@std/path";
import {
  getEnvironmentFilePaths,
  loadEnvironmentFiles,
} from "./environment.ts";

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

  /**
   * Creates a Steno site instance.
   *
   * @param configPath Path to the site configuration file.
   * @param autoBuildOnInit Whether initialization should start a build.
   * @param hooks Optional caller-provided build lifecycle hooks.
   */
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
    const sourcePolicy = project.config.custom?.pluginSourcePolicy ??
      project.config.custom?.pluginSecurity;
    const allowThemePlugins = sourcePolicy?.allowThemePlugins !== false;

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
        "Theme plugins are disabled by `custom.pluginSourcePolicy.allowThemePlugins: false`.",
      );
    }

    this.plugins = [...themePlugins, ...sitePlugins];
  }

  /** Core execution method for triggering a site build orchestration. */
  private async executeBuild(dev: boolean): Promise<void> {
    const project = await this.projectPromise;
    await this.themeLoadingPromise;
    await this.pluginsLoadingPromise;

    try {
      await buildSite({
        config: project.config,
        theme: this.theme,
        plugins: this.plugins,
        hooks: this.hooks,
        state: this.buildState,
        pages: project.pages,
        dev,
        environment: loadEnvironmentFiles(
          Deno.cwd(),
          dev ? "development" : "production",
        ),
      });
    } finally {
      disposeIsolatedPlugins(this.plugins);
    }
  }

  /** Builds the site once using the loaded configuration and theme. */
  public build(): Promise<void> {
    return this.executeBuild(false);
  }

  /** Cancels active isolated-plugin work by terminating its worker processes. */
  public cancel(): void {
    disposeIsolatedPlugins(this.plugins);
  }

  /** Starts the development server with live reload. */
  public async dev(): Promise<void> {
    const project = await this.projectPromise;
    const contentDir = project.config.contentDir || "content";
    const outputDir = project.config.output || "dist";
    const devPort = project.config.custom?.devPort ?? DEFAULT_DEV_PORT;
    const envFiles = getEnvironmentFilePaths(Deno.cwd(), "development").filter(
      (path) => {
        try {
          return Deno.statSync(path).isFile;
        } catch {
          return false;
        }
      },
    );
    await startDevServer(
      outputDir,
      () => this.executeBuild(true),
      [contentDir, ...envFiles],
      [join(contentDir, ".steno"), outputDir],
      devPort,
    );
  }

  /** Triggers the initial build unless dev mode is active. */
  private async init() {
    if (this.autoBuildOnInit && !Deno.args.includes("dev")) {
      await this.build();
    }
  }
}
