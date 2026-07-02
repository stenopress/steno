export interface PluginEntry {
  package: string;
  options?: Record<string, unknown>;
}

export interface CollectionConfig {
  sortBy?: string;
  order?: "asc" | "desc";
  limit?: number;
  filter?: Record<string, unknown>;
}

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
  };
}

export interface ThemeConfigField {
  type: "string" | "number" | "boolean";
  default?: unknown;
  description?: string;
}

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

export interface StenoHooks {
  beforeBuild?: (config: SiteConfig) => void | Promise<void>;
  afterPage?: (page: { path: string; html: string }) => void | Promise<void>;
  afterBuild?: (config: SiteConfig) => void | Promise<void>;
}
