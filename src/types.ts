/**
 * A trusted, in-process plugin package and its optional initialization options.
 *
 * Plugins execute with the permissions granted to the Steno process.
 */
export interface PluginEntry {
  /** Explicit `jsr:`, `npm:`, `file:`, or HTTP module specifier. */
  package: string;
  /** Values passed to the plugin during initialization. */
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
  /** Filesystem paths the plugin may read. */
  read?: string[];
  /** Filesystem paths the plugin may write. */
  write?: string[];
  /** Hosts the plugin may contact. */
  net?: string[];
  /** Environment variables the plugin may access. */
  env?: string[];
  /** Executables the plugin may launch. */
  run?: string[];
  /** Dynamic libraries the plugin may load through FFI. */
  ffi?: string[];
  /** System information categories the plugin may inspect. */
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
  /** Expected frontmatter value type. */
  type: "string" | "number" | "boolean" | "array";
  /** Whether every item must define the field. */
  required?: boolean;
}

/** Configuration for sorting, filtering, and limiting a collection. */
export interface CollectionConfig {
  /** Frontmatter field used to sort items. */
  sortBy?: string;
  /** Sort direction. */
  order?: "asc" | "desc";
  /** Maximum number of items retained after filtering and sorting. */
  limit?: number;
  /** Frontmatter values that collection items must match. */
  filter?: Record<string, unknown>;
  /** Frontmatter fields validated for every collection item. */
  schema?: Record<string, CollectionFieldSchema>;
}

/** A navigation entry exposed to fallback documentation themes. */
export interface NavigationNode {
  /** Visible navigation label. */
  title: string;
  /** Optional destination URL. */
  url?: string;
  /** Nested navigation entries. */
  children?: NavigationNode[];
}

/** Common fields shared by managed document head tags. */
export interface HeadTagBase {
  /** Stable merge identity. Page entries with the same key replace site entries. */
  key?: string;
}

/** A managed `<meta>` tag. Omitting `tag` preserves the original meta syntax. */
export interface MetaHeadTag extends HeadTagBase {
  /** Explicit tag discriminator; omitted values are treated as metadata. */
  tag?: "meta";
  /** Standard metadata name such as `description`. */
  name?: string;
  /** Property metadata name such as `og:title`. */
  property?: string;
  /** HTTP-equivalent directive name. */
  httpEquiv?: string;
  /** Document character encoding. */
  charset?: string;
  /** Metadata value. */
  content?: string;
}

/** A managed `<link>` tag. */
export interface LinkHeadTag extends HeadTagBase {
  /** Link-tag discriminator. */
  tag: "link";
  /** Relationship between the document and resource. */
  rel: string;
  /** Resource URL. */
  href: string;
  /** Resource MIME type. */
  type?: string;
  /** Media query controlling when the resource applies. */
  media?: string;
  /** Icon or image size hint. */
  sizes?: string;
  /** Cross-origin request mode. */
  crossOrigin?: string;
  /** Referrer policy for the request. */
  referrerPolicy?: string;
}

/** A managed external or inline `<script>` tag. */
export interface ScriptHeadTag extends HeadTagBase {
  /** Script-tag discriminator. */
  tag: "script";
  /** External script URL. */
  src?: string;
  /** Inline script source. */
  content?: string;
  /** Script MIME type or module marker. */
  type?: string;
  /** Whether the external script executes asynchronously. */
  async?: boolean;
  /** Whether execution is deferred until parsing completes. */
  defer?: boolean;
  /** Whether the script is excluded from module-capable browsers. */
  noModule?: boolean;
  /** Subresource Integrity digest. */
  integrity?: string;
  /** Cross-origin request mode. */
  crossOrigin?: string;
  /** Referrer policy for the request. */
  referrerPolicy?: string;
}

/** A validated metadata, link, or script entry managed in the document head. */
export type HeadTag = MetaHeadTag | LinkHeadTag | ScriptHeadTag;

/** The top-level site configuration loaded from `content/.steno/config.*`. */
export interface SiteConfig {
  /** Default site and page title. */
  title: string;
  /** Default site and page description. */
  description: string;
  /** Default content author. */
  author: string;
  /** Managed document head entries. */
  head?: HeadTag[];
  /** Content directory override. */
  contentDir?: string;
  /** Build output directory. */
  output?: string;
  /** Plugin module specifiers or detailed plugin entries. */
  plugins?: Array<string | PluginEntry>;
  /** Named collection definitions. */
  collections?: Record<string, CollectionConfig>;
  /** Source-path to destination-path redirect mappings. */
  redirects?: Record<string, string>;
  /** Steno runtime, theme, and project-specific configuration. */
  custom?: {
    /** Stylesheets injected by the fallback theme. */
    stylesheets?: string[];
    /** Whether directory URLs omit `index.html`. */
    shortUrls?: boolean;
    /** Development server port. */
    devPort?: number;
    /** Theme module specifier or local path. */
    theme?: string;
    /** Values supplied to the active theme. */
    themeConfig?: Record<string, unknown>;
    /** Global values exposed to templates. */
    globals?: Record<string, unknown>;
    /** Allowed plugin source and execution modes. */
    pluginSourcePolicy?: PluginSourcePolicy;
    /** @deprecated Use `pluginSourcePolicy`. */
    pluginSecurity?: PluginSecurityConfig;
  };
  /** Site-wide navigation tree. */
  navigation?: NavigationNode[];
}

/** Presentation-facing site settings that frontmatter may override per page. */
export interface PageConfigOverrides {
  /** Page-specific title. */
  title?: string;
  /** Page-specific description. */
  description?: string;
  /** Page-specific author. */
  author?: string;
  /** Head entries merged with site-wide entries. */
  head?: HeadTag[];
  /** Page-specific navigation tree. */
  navigation?: NavigationNode[];
  /** Shallow overrides for the active theme configuration. */
  themeConfig?: Record<string, unknown>;
  /** Shallow overrides for template globals. */
  globals?: Record<string, unknown>;
}

/**
 * A field in a theme-owned configuration schema.
 *
 * Themes may describe nested objects and arrays, provide defaults, and enforce
 * common value constraints. Undeclared top-level configuration keys remain
 * allowed for backwards compatibility.
 */
export interface ThemeConfigField {
  /** Expected configuration value type. */
  type: "string" | "number" | "integer" | "boolean" | "array" | "object";
  /** Value used when the theme user omits this field. */
  default?: unknown;
  /** Human-readable guidance for theme users. */
  description?: string;
  /** Whether the field must be supplied or defaulted. */
  required?: boolean;
  /** Exact values accepted by the field. */
  enum?: readonly unknown[];
  /** Minimum string length. */
  minLength?: number;
  /** Maximum string length. */
  maxLength?: number;
  /** Regular expression that string values must match. */
  pattern?: string;
  /** Inclusive minimum numeric value. */
  minimum?: number;
  /** Inclusive maximum numeric value. */
  maximum?: number;
  /** Schema applied to every array item. */
  items?: ThemeConfigField;
  /** Minimum array length. */
  minItems?: number;
  /** Maximum array length. */
  maxItems?: number;
  /** Schemas for named object properties. */
  properties?: Record<string, ThemeConfigField>;
  /** Whether undeclared object properties are accepted. */
  additionalProperties?: boolean;
}

/** Markdown token list accepted and returned by AST transformation hooks. */
export type MarkdownTokens = import("marked").TokensList;

/**
 * A trusted plugin hook contract used by Steno and themes.
 *
 * Hooks run in-process with the permissions granted to Steno.
 */
export interface StenoPlugin {
  /** Stable plugin name used in diagnostics. */
  name: string;
  /** Transforms parsed Markdown tokens before HTML rendering. */
  transformAst?: (tokens: MarkdownTokens) =>
    | MarkdownTokens
    | Promise<MarkdownTokens>;
  /** Transforms rendered page HTML. */
  transformHtml?: (html: string) => string | Promise<string>;
  /** Runs once before a site build begins. */
  beforeBuild?: (config: SiteConfig) => void | Promise<void>;
  /** Runs after an individual page is written to staging. */
  afterPage?: (page: GeneratedPage) => void | Promise<void>;
  /** Runs once after a site build completes. */
  afterBuild?: (config: SiteConfig) => void | Promise<void>;
}

/** A generated page passed to build and plugin lifecycle hooks. */
export interface GeneratedPage {
  /** Writable staging path for plugins; final path for caller hooks. */
  path: string;
  /** Generated HTML for the page. */
  html: string;
  /** Final published path when `path` points into staging. */
  finalPath?: string;
  /** Writable staging path when `path` is the final published path. */
  stagingPath?: string;
}

/** The data contract for a loaded theme. */
export interface StenoTheme {
  /** Theme name shown in diagnostics. */
  name: string;
  /** Theme package version. */
  version: string;
  /** Named Tau layout templates. */
  layouts: Record<string, string>;
  /** Named Tau component templates. */
  components?: Record<string, string>;
  /** Static assets keyed by output-relative path. */
  assets?: Record<string, string | Uint8Array | URL>;
  /** Validation and default schema for theme configuration. */
  configSchema?: Record<string, ThemeConfigField>;
  /** Theme configuration values applied before user overrides. */
  defaultConfig?: Record<string, unknown>;
  /** Trusted build plugins bundled by the theme. */
  plugins?: StenoPlugin[];
}

/** Lifecycle hooks exposed to Steno callers. */
export interface StenoHooks {
  /** Runs once before a site build begins. */
  beforeBuild?: (config: SiteConfig) => void | Promise<void>;
  /** Runs after an individual page is generated. */
  afterPage?: (page: GeneratedPage) => void | Promise<void>;
  /** Runs once after a site build completes. */
  afterBuild?: (config: SiteConfig) => void | Promise<void>;
}
