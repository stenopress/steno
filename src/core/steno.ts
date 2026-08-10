import { disposeIsolatedPlugins } from "../plugins/isolated_plugin.ts";
import { isStenoPlugin } from "../plugins/plugins.ts";
import type { Theme } from "../theme/theme.ts";
import type { SiteConfig, StenoHooks, StenoPlugin } from "../types.ts";
import { startDevServer, startPreviewServer } from "../utils/server.ts";
import { buildSite, type BuildState } from "./build/build.ts";
import { resolveCachePath } from "./build/cache.ts";
import { loadPlugins, resolveDevPort, resolvePluginSourcePolicy } from "./config.ts";
import { DiagnosticBag, enforceDiagnostics } from "./diagnostics.ts";
import { getEnvironmentFilePaths, loadEnvironmentFiles } from "./environment.ts";
import { type ResolvedProject, resolveProject } from "./project.ts";
import { loadTheme, resolveThemeWatchDir } from "./steno_theme.ts";

/** Coordinates config loading, theme setup, and site builds. */
export class Steno {
  private config!: SiteConfig;
  private theme?: Theme;
  private readonly autoBuildOnInit: boolean;
  private plugins: StenoPlugin[] = [];
  private sitePlugins: StenoPlugin[] = [];
  private sitePluginsSignature: string | null = null;
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
   *
   * Trusted site plugins are re-instantiated only when `config.plugins`
   * actually changed since the last call - re-running every trusted
   * plugin's factory (which can do real work, like Shiki loading its
   * grammars) on every dev-server rebuild was pure waste when nothing
   * about the plugin config changed. Isolated plugins are exempt: their
   * worker is intentionally disposed at the end of every build (see
   * `executeBuild`'s `finally`), so reusing a stale isolated plugin object
   * would mean talking to an already-terminated subprocess. Any isolated
   * entry in the config falls back to reloading every plugin, unchanged
   * from prior behavior.
   *
   * A theme or trusted plugin that fails to load is fatal outside `dev`
   * (`steno build`, and the constructor's initial load when the process
   * isn't running `steno dev`): a build that silently drops its configured
   * theme or plugins doesn't match its own config, which is worse than
   * failing loudly. `dev` stays permissive - every failure is still printed,
   * it just doesn't stop the dev server, so iterating on a broken theme or
   * plugin doesn't require getting it right first. `dev` defaults to
   * whether the running process is actually the `dev` command, since the
   * constructor can't otherwise know which command will call `build()`/
   * `dev()` next; `executeBuild` always passes its own `dev` explicitly.
   */
  private async loadRuntime(
    dev: boolean = Deno.args.includes("dev"),
  ): Promise<ResolvedProject> {
    const project = await resolveProject(
      this.configPath,
      undefined,
      this.buildState.pageCache,
    );
    this.config = project.config;
    const diagnostics = new DiagnosticBag();
    this.theme = await loadTheme(project.config, diagnostics);

    const configuredPlugins = project.config.plugins ?? [];
    const hasIsolatedPlugin = configuredPlugins.some(
      (entry) =>
        typeof entry === "object" &&
        entry !== null &&
        (entry as { mode?: string }).mode === "isolated",
    );
    const sourcePolicy = resolvePluginSourcePolicy(project.config);
    const pluginsSignature = JSON.stringify({
      plugins: configuredPlugins,
      allowLocal: sourcePolicy.allowLocal,
      allowRemoteHttp: sourcePolicy.allowRemoteHttp,
      allowNodeBuiltins: sourcePolicy.allowNodeBuiltins,
    });

    let sitePlugins: StenoPlugin[];
    if (!hasIsolatedPlugin && this.sitePluginsSignature === pluginsSignature) {
      sitePlugins = this.sitePlugins;
    } else {
      sitePlugins = await loadPlugins(project.config, diagnostics);
      this.sitePlugins = sitePlugins;
      this.sitePluginsSignature = hasIsolatedPlugin ? null : pluginsSignature;
    }

    const allowThemePlugins = resolvePluginSourcePolicy(project.config).allowThemePlugins;

    const themePlugins = allowThemePlugins
      ? (this.theme?.plugins ?? []).filter((plugin, index) => {
        if (!isStenoPlugin(plugin)) {
          diagnostics.add({
            code: "theme-plugin-invalid",
            severity: "error",
            message: `Theme plugin at index ${index} is invalid.`,
            hint: 'It must be an object with at least a "name".',
          });
          return false;
        }
        return true;
      })
      : [];

    if (!allowThemePlugins && (this.theme?.plugins?.length ?? 0) > 0) {
      diagnostics.add({
        code: "theme-plugins-disabled",
        severity: "warning",
        message: "Theme plugins are disabled by `pluginSourcePolicy.allowThemePlugins: false`.",
      });
    }

    this.plugins = [...themePlugins, ...sitePlugins];

    // A plugin's name is what every diagnostic and error message identifies
    // it by ("Plugin \"X\" failed to load ..."), so two plugins sharing one
    // silently make those messages ambiguous - which "X" broke? - without
    // anything else going wrong. Not build-breaking on its own, so a
    // warning, not an error.
    const seenPluginNames = new Set<string>();
    for (const plugin of this.plugins) {
      if (seenPluginNames.has(plugin.name)) {
        diagnostics.add({
          code: "plugin-name-duplicate",
          severity: "warning",
          message:
            `More than one plugin is named "${plugin.name}" - diagnostics naming this plugin won't say which one they mean.`,
          hint:
            "Give each plugin a distinct name, even if it's the same package loaded twice with different options.",
        });
        continue;
      }
      seenPluginNames.add(plugin.name);
    }

    enforceDiagnostics(diagnostics, dev);
    return project;
  }

  /** Core execution method for triggering a site build orchestration. */
  private async executeBuild(dev: boolean): Promise<void> {
    const project = dev ? await this.loadRuntime(true) : await this.runtimeLoadingPromise;

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
