/**
 * A trusted, in-process plugin package and its optional initialization options.
 *
 * Plugins execute with the permissions granted to the Steno process.
 */
export interface PluginEntry {
  package: string;
  options?: Record<string, unknown>;
  /** Execute in-process (`trusted`) or in a restricted subprocess (`isolated`). */
  mode?: "trusted" | "isolated";
  /** Capability grants for an isolated plugin. All capabilities default to denied. */
  permissions?: IsolatedPluginPermissions;
  /** Maximum time for initialization or an individual hook call. */
  timeoutMs?: number;
  /** Maximum serialized response size for an individual worker message. */
  maxOutputBytes?: number;
  /** Maximum V8 heap size for the isolated worker. */
  memoryMb?: number;
  /** Frozen Deno lockfile used for the isolated plugin's remote module graph. */
  lockFile?: string;
  /** Optional SHA-256 integrity value for supported plugin sources. */
  integrity?: string;
}

/** Explicit capabilities that may be granted to an isolated plugin process. */
export interface IsolatedPluginPermissions {
  read?: string[];
  write?: string[];
  net?: string[];
  env?: string[];
  run?: string[];
  ffi?: string[];
  sys?: string[];
  /** Hosts from which the plugin module graph may be imported. */
  import?: string[];
}

/**
 * Source-policy controls for top-level plugin module specifiers.
 *
 * This policy is not an execution sandbox. It does not inspect transitive
 * imports or reduce the permissions available to plugin code.
 */
export interface PluginSourcePolicy {
  /** Allow top-level plugin specifiers using `file://`. */
  allowLocal?: boolean;
  /** Allow top-level plugin specifiers using `http://` or `https://`. */
  allowRemoteHttp?: boolean;
  /**
   * Allow top-level plugin specifiers using `node:`.
   *
   * This does not block Node built-ins imported transitively by another
   * allowed plugin.
   */
  allowNodeBuiltins?: boolean;
  /**
   * Allow trusted plugins bundled by the active theme to run in-process.
   *
   * Theme plugins inherit the permissions granted to Steno.
   */
  allowThemePlugins?: boolean;
}

/** @deprecated Use {@link PluginSourcePolicy}; this policy is not a sandbox. */
export type PluginSecurityConfig = PluginSourcePolicy;

/** A single field definition in a collection frontmatter schema. */
export interface CollectionFieldSchema {
  type: "string" | "number" | "boolean" | "array";
  required?: boolean;
}

/** Configuration for sorting, filtering, and limiting a collection. */
export interface CollectionConfig {
  sortBy?: string;
  order?: "asc" | "desc";
  limit?: number;
  filter?: Record<string, unknown>;
  schema?: Record<string, CollectionFieldSchema>;
}

/** A navigation entry exposed to fallback documentation themes. */
export interface NavigationNode {
  title: string;
  url?: string;
  children?: NavigationNode[];
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
  redirects?: Record<string, string>;
  custom?: {
    stylesheets?: string[];
    shortUrls?: boolean;
    devPort?: number;
    theme?: string;
    themeConfig?: Record<string, unknown>;
    globals?: Record<string, unknown>;
    pluginSourcePolicy?: PluginSourcePolicy;
    /** @deprecated Use `pluginSourcePolicy`. */
    pluginSecurity?: PluginSecurityConfig;
  };
  navigation?: NavigationNode[];
}

/** A single field definition in a theme configuration schema. */
export interface ThemeConfigField {
  type: "string" | "number" | "boolean";
  default?: unknown;
  description?: string;
}

/**
 * A trusted plugin hook contract used by Steno and themes.
 *
 * Hooks run in-process with the permissions granted to Steno.
 */
export interface StenoPlugin {
  name: string;
  transformAst?: (tokens: import("marked").TokensList) =>
    | import("marked").TokensList
    | Promise<import("marked").TokensList>;
  transformHtml?: (html: string) => string | Promise<string>;
  beforeBuild?: (config: SiteConfig) => void | Promise<void>;
  afterPage?: (page: GeneratedPage) => void | Promise<void>;
  afterBuild?: (config: SiteConfig) => void | Promise<void>;
}

/** A generated page passed to build and plugin lifecycle hooks. */
export interface GeneratedPage {
  /** Writable staging path for plugins; final path for caller hooks. */
  path: string;
  html: string;
  /** Final published path when `path` points into staging. */
  finalPath?: string;
  /** Writable staging path when `path` is the final published path. */
  stagingPath?: string;
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
  afterPage?: (page: GeneratedPage) => void | Promise<void>;
  afterBuild?: (config: SiteConfig) => void | Promise<void>;
}
