import { Theme } from "../theme/theme.ts";
import type { SiteConfig, StenoHooks, StenoPlugin } from "../types.ts";
import { startDevServer } from "../utils/server.ts";
import { loadConfig, loadPlugins } from "./config.ts";
import { buildSite, type BuildState } from "./steno_build.ts";
import { loadTheme } from "./steno_theme.ts";

/** Coordinates config loading, theme setup, and site builds. */
export class Steno {
  private readonly config: SiteConfig;
  private theme?: Theme;
  private readonly themeLoadingPromise: Promise<void>;
  private readonly autoBuildOnInit: boolean;
  private plugins: StenoPlugin[] = [];
  private readonly pluginsLoadingPromise: Promise<void>;
  private readonly buildState: BuildState = {
    signature: null,
    pages: new Map(),
  };

  constructor(
    configPath: string = "content/.steno/config.yml",
    autoBuildOnInit = true,
    private hooks: StenoHooks = {},
  ) {
    this.config = loadConfig(configPath);
    this.autoBuildOnInit = autoBuildOnInit;
    this.themeLoadingPromise = loadTheme(this.config).then((theme) => {
      this.theme = theme;
    });
    this.pluginsLoadingPromise = this.loadPlugins();
    this.init();
  }

  /** Resolves and loads the configured plugins. */
  private async loadPlugins(): Promise<void> {
    await this.themeLoadingPromise;
    const sitePlugins = await loadPlugins(this.config);
    this.plugins = [...(this.theme?.plugins ?? []), ...sitePlugins];
  }

  /** Builds the site once using the loaded configuration and theme. */
  public async build(): Promise<void> {
    await this.themeLoadingPromise;
    await this.pluginsLoadingPromise;

    await buildSite({
      config: this.config,
      theme: this.theme,
      plugins: this.plugins,
      hooks: this.hooks,
      state: this.buildState,
    });
  }

  /** Starts the development server with live reload. */
  public async dev(): Promise<void> {
    const contentDir = this.config.contentDir || "content";
    const outputDir = this.config.output || "dist";
    await startDevServer(outputDir, () => this.build(), contentDir);
  }

  /** Triggers the initial build unless dev mode is active. */
  private async init() {
    if (this.autoBuildOnInit && !Deno.args.includes("dev")) {
      await this.build();
    }
  }
}
