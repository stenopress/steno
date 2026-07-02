import { Theme } from "../theme/theme.ts";
import type { SiteConfig, StenoHooks, StenoPlugin } from "../types.ts";
import { startDevServer } from "../utils/server.ts";
import { loadConfig, loadPlugins } from "./config.ts";
import { buildSite } from "./steno_build.ts";
import { loadTheme } from "./steno_theme.ts";

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
    this.themeLoadingPromise = loadTheme(this.config).then((theme) => {
      this.theme = theme;
    });
    this.pluginsLoadingPromise = this.loadPlugins();
    this.init();
  }

  private async loadPlugins(): Promise<void> {
    await this.themeLoadingPromise;
    const sitePlugins = await loadPlugins(this.config);
    this.plugins = [...(this.theme?.plugins ?? []), ...sitePlugins];
  }

  public async build(): Promise<void> {
    await this.themeLoadingPromise;
    await this.pluginsLoadingPromise;

    await buildSite({
      config: this.config,
      theme: this.theme,
      plugins: this.plugins,
      hooks: this.hooks,
    });
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
