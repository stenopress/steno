/** A plugin package and its optional initialization options. */
export interface PluginEntry {
  package: string;
  options?: Record<string, unknown>;
}

/** Security controls for plugin module loading. */
export interface PluginSecurityConfig {
  /** Allow loading plugins from local `file://` module specifiers. */
  allowLocal?: boolean;
  /** Allow loading plugins from remote `http://` or `https://` URLs. */
  allowRemoteHttp?: boolean;
  /** Allow loading plugins from `node:` built-in module specifiers. */
  allowNodeBuiltins?: boolean;
  /** Allow plugins bundled by the active theme to run. */
  allowThemePlugins?: boolean;
}

/** Configuration for sorting, filtering, and limiting a collection. */
export interface CollectionConfig {
  sortBy?: string;
  order?: "asc" | "desc";
  limit?: number;
  filter?: Record<string, unknown>;
}

/** The top-level site configuration loaded from `content/.steno/config.*`. */
export interface SiteConfig {
  title: string;
  description: string;
  author: string;
  head?: Array<{ name: string; content: string }>;
  contentDir?: string;
  output?: string;
  plugins?: Array<string | PluginEntry>;
  collections?: Record<string, CollectionConfig>;
  custom?: {
    stylesheets?: string[];
    shortUrls?: boolean;
    theme?: string;
    themeConfig?: Record<string, unknown>;
    pluginSecurity?: PluginSecurityConfig;
  };
}

/** A single field definition in a theme configuration schema. */
export interface ThemeConfigField {
  type: "string" | "number" | "boolean";
  default?: unknown;
  description?: string;
}

/** A plugin hook contract used by Steno and themes. */
export interface StenoPlugin {
  name: string;
  transformAst?: (tokens: import("marked").TokensList) =>
    | import("marked").TokensList
    | Promise<import("marked").TokensList>;
  transformHtml?: (html: string) => string | Promise<string>;
  beforeBuild?: (config: SiteConfig) => void | Promise<void>;
  afterPage?: (page: { path: string; html: string }) => void | Promise<void>;
  afterBuild?: (config: SiteConfig) => void | Promise<void>;
}

/** The data contract for a loaded theme. */
export interface StenoTheme {
  name: string;
  version: string;
  layouts: Record<string, string>;
  components?: Record<string, string>;
  assets?: Record<string, string | Uint8Array | URL>;
  configSchema?: Record<string, ThemeConfigField>;
  defaultConfig?: Record<string, unknown>;
  plugins?: StenoPlugin[];
}

/** Lifecycle hooks exposed to Steno callers. */
export interface StenoHooks {
  beforeBuild?: (config: SiteConfig) => void | Promise<void>;
  afterPage?: (page: { path: string; html: string }) => void | Promise<void>;
  afterBuild?: (config: SiteConfig) => void | Promise<void>;
}
