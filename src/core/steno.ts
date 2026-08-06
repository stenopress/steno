import type { Theme } from "../theme/theme.ts";
import type { SiteConfig, StenoHooks, StenoPlugin } from "../types.ts";
import { isStenoPlugin } from "../plugins/plugins.ts";
import { disposeIsolatedPlugins } from "../plugins/isolated_plugin.ts";
import { startDevServer, startPreviewServer } from "../utils/server.ts";
import {
  loadPlugins,
  resolveDevPort,
  resolvePluginSourcePolicy,
} from "./config.ts";
import { buildSite, type BuildState } from "./build/build.ts";
import { resolveCachePath } from "./build/cache.ts";
import { loadTheme, resolveThemeWatchDir } from "./steno_theme.ts";
import { type ResolvedProject, resolveProject } from "./project.ts";
import {
  getEnvironmentFilePaths,
  loadEnvironmentFiles,
} from "./environment.ts";

/** Coordinates config loading, theme setup, and site builds. */
export class Steno {
  private config!: SiteConfig;
  private theme?: Theme;
  private readonly autoBuildOnInit: boolean;
  private plugins: StenoPlugin[] = [];
  private readonly configPath: string;
  private readonly runtimeLoadingPromise: Promise<ResolvedProject>;
  private readonly buildState: BuildState = {
    signature: null,
    pages: new Map(),
    pageCache: new Map(),
  };
  private readonly initPromise: Promise<void>;

  /**
   * Creates a Steno site instance.
   *
   * @param configPath Path to the site configuration file.
   * @param autoBuildOnInit Whether initialization should start a build.
   * @param hooks Optional caller-provided build lifecycle hooks.
   * @param verbose Prints theme/plugin diagnostics and each rendered page's
   *   template context.
   */
  constructor(
    configPath: string = "content/.steno/config.yml",
    autoBuildOnInit = true,
    private hooks: StenoHooks = {},
    private verbose = false,
  ) {
    this.configPath = configPath;
    this.autoBuildOnInit = autoBuildOnInit;
    this.runtimeLoadingPromise = this.loadRuntime();
    this.initPromise = this.init();
  }

  /**
   * Resolves once construction-time work (including the `autoBuildOnInit`
   * build) has settled. Callers that pass `autoBuildOnInit: true` should
   * await this to observe initialization failures instead of relying on an
   * unhandled promise rejection.
   */
  public ready(): Promise<void> {
    return this.initPromise;
  }

  /**
   * Re-reads the config file, reloads the theme it points at, and resolves
   * plugins, updating `config`/`theme`/`plugins` in place. Called once at
   * construction and again before every dev-server rebuild, so editing the
   * config or switching a theme takes effect without restarting `dev`.
   */
  private async loadRuntime(): Promise<ResolvedProject> {
    const project = await resolveProject(
      this.configPath,
      undefined,
      this.buildState.pageCache,
    );
    this.config = project.config;
    this.theme = await loadTheme(project.config);

    const sitePlugins = await loadPlugins(project.config);
    const allowThemePlugins =
      resolvePluginSourcePolicy(project.config).allowThemePlugins;

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
        "Theme plugins are disabled by `pluginSourcePolicy.allowThemePlugins: false`.",
      );
    }

    this.plugins = [...themePlugins, ...sitePlugins];
    return project;
  }

  /** Core execution method for triggering a site build orchestration. */
  private async executeBuild(dev: boolean): Promise<void> {
    const project = dev
      ? await this.loadRuntime()
      : await this.runtimeLoadingPromise;

    try {
      await buildSite({
        config: this.config,
        theme: this.theme,
        plugins: this.plugins,
        hooks: this.hooks,
        state: this.buildState,
        pages: project.pages,
        dev,
        verbose: this.verbose,
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
    const project = await this.runtimeLoadingPromise;
    const contentDir = project.config.contentDir || "content";
    const outputDir = project.config.output || "dist";
    const devPort = resolveDevPort(project.config);
    const envFiles = getEnvironmentFilePaths(Deno.cwd(), "development").filter(
      (path) => {
        try {
          return Deno.statSync(path).isFile;
        } catch {
          return false;
        }
      },
    );
    // A theme loaded from a local path is under active development just
    // like the content — watch it too, so editing a layout or the theme's
    // own mod.ts triggers a rebuild instead of silently doing nothing.
    const themeWatchDir = resolveThemeWatchDir(project.config);
    const watchDirs = themeWatchDir
      ? [contentDir, themeWatchDir, this.configPath, ...envFiles]
      : [contentDir, this.configPath, ...envFiles];
    await startDevServer(
      outputDir,
      () => this.executeBuild(true),
      watchDirs,
      [resolveCachePath(contentDir), outputDir],
      devPort,
    );
  }

  /** Builds the site and serves the production output without file watching. */
  public async preview(port?: number): Promise<void> {
    const project = await this.runtimeLoadingPromise;
    const outputDir = project.config.output ?? "dist";

    await startPreviewServer(outputDir, port);
  }
  /** Triggers the initial build unless dev mode is active. */
  private async init() {
    if (this.autoBuildOnInit && !Deno.args.includes("dev")) {
      await this.build();
    }
  }
}
