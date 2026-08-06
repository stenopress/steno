import { render } from "../utils/tau.ts";
import type {
  SiteConfig,
  StenoPlugin,
  StenoTheme,
  ThemeConfigField,
} from "../types.ts";
import type { CollectionMap } from "../core/collections.ts";
import { basename, join, resolve, toFileUrl } from "@std/path";
import { parse as parseYaml } from "@std/yaml";
import { transpile } from "@deno/emit";
import { mapWithConcurrency } from "../utils/concurrency.ts";
import { isRecord } from "../utils/text.ts";
import { ensureParentDirSync } from "../utils/fs.ts";

/** Resolved configuration values passed to a theme. */
export type ThemeConfig = Record<string, unknown>;

/**
 * The context object a page's layout template renders against — every
 * field here is reachable in a `.tau` template as `{ field }`. Steno's
 * own build pipeline always sets these; they're typed optional here so a
 * hand-built context (tests, a theme's own render helpers) isn't forced
 * to fabricate every field — Tau templates already guard access with
 * `{#if theme.accent}`-style checks, so treat these the same way. Page
 * frontmatter and public env vars are additionally spread in at the top
 * level, which the index signature covers, since their exact keys vary
 * per project.
 *
 * `content` (the page's rendered HTML body) isn't included here — it's
 * merged in separately by `Theme.renderLayout`, which is also why this
 * type covers `renderLayout`'s `variables` parameter rather than the
 * complete rendered context.
 */
export interface PageRenderContext {
  /** The page's title — frontmatter, inferred from content, or the site title. */
  title?: string;
  /** Resolved site config, with any per-page `steno.*` overrides applied. */
  site?: SiteConfig;
  /** Values from top-level `globals` and any per-page `steno.globals` override, merged. */
  globals?: Record<string, unknown>;
  /** Public (non-secret) environment variables exposed to templates — also spread at the top level. */
  env?: Record<string, string>;
  /** Named collections available to templates — see `docs/content.md`. */
  collections?: CollectionMap;
  /** Parsed `_data/*` files, keyed by file name. */
  data?: Record<string, unknown>;
  /** This theme's name, version, and resolved configuration — `undefined` when the site has no theme. */
  theme?: { name: string; version: string } & ThemeConfig;
  /** Each theme asset's original relative path mapped to its (possibly content-hashed) output path. */
  assets?: Record<string, string>;
  /** Every other page frontmatter field and public env var, spread at the top level. */
  [key: string]: unknown;
}

const ASSET_COPY_CONCURRENCY = 32;
/** Assets matching this pattern get a content hash baked into their output filename. */
const HASHABLE_ASSET_PATTERN = /\.m?js$|\.css$/i;

async function hashContent(content: string | Uint8Array): Promise<string> {
  const bytes = typeof content === "string"
    ? new TextEncoder().encode(content)
    : new Uint8Array(content);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 8);
}

/** Inserts a hash before an asset's file extension: `style.css` -> `style.<hash>.css`. */
function insertAssetHash(relPath: string, hash: string): string {
  const slashIndex = relPath.lastIndexOf("/");
  const dir = slashIndex === -1 ? "" : relPath.slice(0, slashIndex + 1);
  const fileName = slashIndex === -1 ? relPath : relPath.slice(slashIndex + 1);
  const dotIndex = fileName.lastIndexOf(".");
  return dotIndex === -1
    ? `${dir}${fileName}.${hash}`
    : `${dir}${fileName.slice(0, dotIndex)}.${hash}${fileName.slice(dotIndex)}`;
}

function valuesEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (typeof left !== "object" || typeof right !== "object") return false;
  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return false;
  }
}

function configError(themeName: string, path: string, message: string): never {
  throw new Error(
    `Invalid configuration for theme "${themeName}" at "${path}": ${message}`,
  );
}

function validateThemeConfigField(
  themeName: string,
  field: ThemeConfigField,
  value: unknown,
  path: string,
): void {
  if (
    field.enum && !field.enum.some((candidate) => valuesEqual(candidate, value))
  ) {
    configError(
      themeName,
      path,
      `must be one of ${JSON.stringify(field.enum)}.`,
    );
  }

  const actualType = Array.isArray(value)
    ? "array"
    : value === null
    ? "null"
    : typeof value;
  const validType = field.type === "integer"
    ? typeof value === "number" && Number.isInteger(value)
    : field.type === "object"
    ? isRecord(value)
    : field.type === actualType;
  if (!validType) {
    configError(
      themeName,
      path,
      `expected ${field.type}, received ${actualType}.`,
    );
  }

  if (typeof value === "string") {
    if (field.minLength !== undefined && value.length < field.minLength) {
      configError(
        themeName,
        path,
        `must contain at least ${field.minLength} characters.`,
      );
    }
    if (field.maxLength !== undefined && value.length > field.maxLength) {
      configError(
        themeName,
        path,
        `must contain at most ${field.maxLength} characters.`,
      );
    }
    if (field.pattern !== undefined) {
      let expression: RegExp;
      try {
        expression = new RegExp(field.pattern);
      } catch {
        configError(
          themeName,
          path,
          `schema contains invalid pattern ${JSON.stringify(field.pattern)}.`,
        );
      }
      if (!expression.test(value)) {
        configError(
          themeName,
          path,
          `must match pattern ${JSON.stringify(field.pattern)}.`,
        );
      }
    }
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      configError(themeName, path, "must be finite.");
    }
    if (field.minimum !== undefined && value < field.minimum) {
      configError(themeName, path, `must be at least ${field.minimum}.`);
    }
    if (field.maximum !== undefined && value > field.maximum) {
      configError(themeName, path, `must be at most ${field.maximum}.`);
    }
  }

  if (Array.isArray(value)) {
    if (field.minItems !== undefined && value.length < field.minItems) {
      configError(
        themeName,
        path,
        `must contain at least ${field.minItems} items.`,
      );
    }
    if (field.maxItems !== undefined && value.length > field.maxItems) {
      configError(
        themeName,
        path,
        `must contain at most ${field.maxItems} items.`,
      );
    }
    if (field.items) {
      value.forEach((item, index) =>
        validateThemeConfigField(
          themeName,
          field.items!,
          item,
          `${path}[${index}]`,
        )
      );
    }
  }

  if (isRecord(value)) {
    validateThemeConfig(themeName, field.properties ?? {}, value, path);
    if (field.additionalProperties === false) {
      const properties = field.properties ?? {};
      const extra = Object.keys(value).find((key) => !(key in properties));
      if (extra) {
        configError(
          themeName,
          `${path}.${extra}`,
          "property is not declared by the schema.",
        );
      }
    }
  }
}

function validateThemeConfig(
  themeName: string,
  schema: Record<string, ThemeConfigField>,
  config: ThemeConfig,
  prefix = "themeConfig",
): void {
  for (const [key, field] of Object.entries(schema)) {
    const path = `${prefix}.${key}`;
    const value = config[key];
    if (value === undefined) {
      if (field.required) configError(themeName, path, "is required.");
      continue;
    }
    validateThemeConfigField(themeName, field, value, path);
  }
}

function resolveFieldDefault(field: ThemeConfigField): unknown {
  if (field.default !== undefined) return structuredClone(field.default);
  if (field.type !== "object" || !field.properties) return undefined;
  const nested = resolveSchemaDefaults(field.properties);
  return Object.keys(nested).length ? nested : undefined;
}

function resolveSchemaDefaults(
  schema?: Record<string, ThemeConfigField>,
): ThemeConfig {
  if (!schema) return {};
  const defaults: ThemeConfig = {};
  for (const [key, field] of Object.entries(schema)) {
    const value = resolveFieldDefault(field);
    if (value !== undefined) defaults[key] = value;
  }
  return defaults;
}

interface ThemeDirectoryMetadata {
  name?: string;
  version?: string;
  components?: Record<string, string>;
  defaultConfig?: ThemeConfig;
  configSchema?: Record<string, ThemeConfigField>;
}

/**
 * Merges a base theme with overrides, producing a new `StenoTheme`.
 *
 * `layouts`, `components`, `assets`, `configSchema`, and `defaultConfig` are
 * merged shallowly by key (override wins per key, unset base keys survive).
 * `name`, `version`, and `plugins` are replaced wholesale when present in
 * `overrides`. Use this instead of a raw object spread when extending a
 * bundled theme - a plain `{ ...base, layouts: { ...only-the-new-ones } }`
 * silently drops any base layout not re-listed.
 */
export function mergeTheme(
  base: StenoTheme,
  overrides: Partial<StenoTheme>,
): StenoTheme {
  return {
    name: overrides.name ?? base.name,
    version: overrides.version ?? base.version,
    layouts: { ...base.layouts, ...overrides.layouts },
    components: { ...base.components, ...overrides.components },
    assets: { ...base.assets, ...overrides.assets },
    configSchema: { ...base.configSchema, ...overrides.configSchema },
    defaultConfig: { ...base.defaultConfig, ...overrides.defaultConfig },
    plugins: overrides.plugins ?? base.plugins,
  };
}

/**
 * Represents a Steno Theme, providing methods to load, render layouts and components,
 * and copy static assets.
 */
export class Theme {
  /** The theme name. */
  public name: string;
  /** The theme version. */
  public version: string;
  /** The merged configuration options (defaults + user overrides). */
  public config: ThemeConfig;
  private themeData: StenoTheme;
  private layoutPaths: Record<string, string> = {};
  private componentPaths: Record<string, string> = {};
  /** An array of plugins bundled with this theme. */
  public readonly plugins: StenoPlugin[];

  /**
   * Creates a new Theme instance.
   *
   * @param themeData - The base configuration/templates of the theme.
   * @param userConfig - Optional overrides for the theme defaults.
   */
  constructor(themeData: StenoTheme, userConfig: ThemeConfig = {}) {
    this.themeData = themeData;
    this.name = themeData.name;
    this.version = themeData.version;
    this.plugins = themeData.plugins ?? [];

    this.config = {
      ...resolveSchemaDefaults(themeData.configSchema),
      ...themeData.defaultConfig,
      ...userConfig,
    };
    if (themeData.configSchema) {
      validateThemeConfig(this.name, themeData.configSchema, this.config);
    }
  }

  /** Resolves and validates shallow theme overrides for a single page. */
  public resolveConfig(overrides: ThemeConfig = {}): ThemeConfig {
    // The base config is already validated once in the constructor; skip
    // re-validating it on every page when there's no per-page override
    // (the common case) instead of re-walking the whole schema each time.
    if (Object.keys(overrides).length === 0) return this.config;

    const config = { ...this.config, ...overrides };
    if (this.themeData.configSchema) {
      validateThemeConfig(this.name, this.themeData.configSchema, config);
    }
    return config;
  }

  /**
   * Helper to load a filesystem-based theme directory using a theme.yaml file.
   *
   * @param dir - The path to the theme directory.
   * @param userConfig - Optional overrides for the theme configuration.
   * @returns A new {@link Theme} instance.
   */
  public static async loadFromDirectory(
    dir: string,
    userConfig: ThemeConfig = {},
  ): Promise<Theme> {
    const metadata = Theme.loadMetadata(dir);
    const name = metadata.name || "unnamed";
    const version = metadata.version || "1.0.0";

    const { layouts, layoutPaths } = Theme.loadLayouts(dir);
    const { components, componentPaths } = Theme.loadComponents(
      dir,
      metadata.components,
    );
    const assets = {
      ...Theme.loadAssets(dir),
      ...(await Theme.loadScripts(dir)),
    };

    const themeInstance = new Theme({
      name,
      version,
      layouts,
      components,
      assets,
      defaultConfig: metadata.defaultConfig || {},
      configSchema: metadata.configSchema,
    }, userConfig);

    themeInstance.layoutPaths = layoutPaths;
    themeInstance.componentPaths = componentPaths;
    return themeInstance;
  }

  /**
   * Loads the metadata for a theme from its directory.
   *
   * @param dir - The path to the theme directory.
   * @returns The parsed theme metadata.
   */
  private static loadMetadata(dir: string): ThemeDirectoryMetadata {
    let yamlContent: string | undefined;
    for (const fileName of ["theme.yaml", "theme.yml"]) {
      try {
        yamlContent = Deno.readTextFileSync(join(dir, fileName));
        break;
      } catch {
        // Try the next candidate filename.
      }
    }
    if (yamlContent === undefined) return {};
    const parsed = parseYaml(yamlContent);
    return parsed && typeof parsed === "object"
      ? (parsed as ThemeDirectoryMetadata)
      : {};
  }

  /** Loads layout templates and their source paths from a theme directory. */
  private static loadLayouts(
    dir: string,
  ): {
    layouts: Record<string, string>;
    layoutPaths: Record<string, string>;
  } {
    const layouts: Record<string, string> = {};
    const layoutPaths: Record<string, string> = {};
    const layoutsDir = join(dir, "layouts");
    try {
      if (Deno.statSync(layoutsDir).isDirectory) {
        for (const entry of Deno.readDirSync(layoutsDir)) {
          if (entry.isFile && entry.name.endsWith(".tau")) {
            const key = entry.name.slice(0, -".tau".length);
            const fullPath = join(layoutsDir, entry.name);
            layouts[key] = Deno.readTextFileSync(fullPath);
            layoutPaths[key] = fullPath;
          }
        }
      }
    } catch { /* Layouts missing is fine */ }

    return { layouts, layoutPaths };
  }

  /** Loads configured component templates and their source paths. */
  private static loadComponents(
    dir: string,
    rawComponents?: Record<string, string>,
  ): {
    components: Record<string, string>;
    componentPaths: Record<string, string>;
  } {
    const components: Record<string, string> = {};
    const componentPaths: Record<string, string> = {};

    if (rawComponents) {
      for (const [key, relPath] of Object.entries(rawComponents)) {
        const capKey = key.charAt(0).toUpperCase() + key.slice(1);
        const fullPath = join(dir, relPath);
        try {
          components[capKey] = Deno.readTextFileSync(fullPath);
          componentPaths[capKey] = fullPath;
        } catch (err) {
          console.error(
            `Failed to load component "${capKey}" from "${fullPath}":`,
            err,
          );
        }
      }
    }
    return { components, componentPaths };
  }

  /** Recursively indexes static assets in a theme directory. */
  private static loadAssets(dir: string): Record<string, URL> {
    const assets: Record<string, URL> = {};
    const assetsDir = join(dir, "assets");

    try {
      if (Deno.statSync(assetsDir).isDirectory) {
        const walk = (currentDir: string, relPrefix = "") => {
          for (const entry of Deno.readDirSync(currentDir)) {
            const fullPath = join(currentDir, entry.name);
            const relPath = relPrefix
              ? `${relPrefix}/${entry.name}`
              : entry.name;
            if (entry.isDirectory) walk(fullPath, relPath);
            else if (entry.isFile) {
              assets[relPath] = toFileUrl(fullPath);
            }
          }
        };
        walk(assetsDir);
      }
    } catch { /* Assets missing is fine */ }

    return assets;
  }

  /**
   * Recursively compiles `scripts/*.ts`/`*.tsx` into JS text, and passes
   * `*.js`/`*.jsx` through unchanged. Output is flattened to a single
   * directory level (`scripts/sub/foo.ts` -> `foo.js`) so themes can
   * reference compiled scripts the same way they reference `assets/*.js`.
   */
  private static async loadScripts(
    dir: string,
  ): Promise<Record<string, string>> {
    const scripts: Record<string, string> = {};
    const scriptsDir = join(dir, "scripts");

    const sourcePaths: string[] = [];
    try {
      if (Deno.statSync(scriptsDir).isDirectory) {
        const walk = (currentDir: string) => {
          for (const entry of Deno.readDirSync(currentDir)) {
            const fullPath = join(currentDir, entry.name);
            if (entry.isDirectory) walk(fullPath);
            else if (
              entry.isFile &&
              /\.(ts|tsx|js|jsx)$/.test(entry.name)
            ) {
              sourcePaths.push(fullPath);
            }
          }
        };
        walk(scriptsDir);
      }
    } catch { /* Scripts directory missing is fine */ }

    for (const fullPath of sourcePaths) {
      const outName = basename(fullPath).replace(/\.(ts|tsx)$/, ".js");
      if (/\.(js|jsx)$/.test(fullPath)) {
        scripts[outName] = Deno.readTextFileSync(fullPath);
        continue;
      }

      const sourceUrl = toFileUrl(fullPath);
      const result = await transpile(sourceUrl);
      const code = result.get(sourceUrl.href);
      if (!code) {
        throw new Error(`Failed to transpile theme script "${fullPath}".`);
      }
      scripts[outName] = code;
    }

    return scripts;
  }

  /**
   * Internal common renderer wrapper to dry up Tau orchestrations.
   */
  private async executeRender(
    template: string,
    context: Record<string, unknown>,
    filePath?: string,
  ): Promise<string> {
    return await render({
      template,
      context,
      components: this.themeData.components || {},
      filePath,
      includeResolver: (path) => {
        const component = this.themeData.components?.[path];
        if (component) return component;
        throw new Error(`Include "${path}" not found in theme "${this.name}".`);
      },
    });
  }

  /**
   * Renders a layout template with content and page variables using Tau.
   */
  public async renderLayout(
    layoutName: string,
    content: string,
    variables: PageRenderContext,
  ): Promise<string> {
    const template = this.themeData.layouts[layoutName];
    if (!template) {
      throw new Error(
        `Layout "${layoutName}" not found in theme "${this.name}". Available layouts: ${
          Object.keys(this.themeData.layouts).join(", ")
        }`,
      );
    }
    return await this.executeRender(
      template,
      { assets: {}, content, ...variables },
      this.layoutPaths[layoutName],
    );
  }

  /**
   * Renders a theme component using Tau.
   */
  public async renderComponent(
    componentName: string,
    variables: Record<string, unknown>,
  ): Promise<string> {
    const template = this.themeData.components?.[componentName];
    if (!template) {
      throw new Error(
        `Component "${componentName}" not found in theme "${this.name}".`,
      );
    }
    return await this.executeRender(
      template,
      variables,
      this.componentPaths[componentName],
    );
  }

  /**
   * Returns deterministic theme data used in build cache signatures.
   */
  public getBuildSignatureData(): {
    name: string;
    version: string;
    config: ThemeConfig;
    layouts: [string, string][];
    components: [string, string][];
  } {
    const sortEntries = (obj: Record<string, string> = {}) =>
      Object.entries(obj).sort(([l], [r]) => l.localeCompare(r));

    return {
      name: this.name,
      version: this.version,
      config: this.config,
      layouts: sortEntries(this.themeData.layouts),
      components: sortEntries(this.themeData.components),
    };
  }

  /**
   * Copies all theme assets to the output directory (e.g., dist/assets/).
   *
   * CSS and JS assets are written under a content-hashed filename (e.g.
   * `style.css` -> `style.a1b2c3d4.css`) so redeploys don't need a manual
   * CDN cache purge - the returned manifest maps the original relative path
   * to the hashed one, ready to expose to templates.
   */
  public async copyAssets(
    outputDir: string,
    occupiedPaths: Set<string> = new Set(),
    hashAssets = true,
  ): Promise<Record<string, string>> {
    const manifest: Record<string, string> = {};
    if (!this.themeData.assets) return manifest;
    const assetsDir = join(outputDir, "assets");

    const assets = Object.entries(this.themeData.assets).sort((
      [left],
      [right],
    ) => left.localeCompare(right));

    const resolved = new Array<
      { relPath: string; destRelPath: string; content: string | Uint8Array }
    >(assets.length);

    await mapWithConcurrency(
      assets.map((entry, index) => ({ entry, index })),
      ASSET_COPY_CONCURRENCY,
      async ({ entry: [relPath, source], index }) => {
        const content = await Theme.resolveAssetContent(relPath, source);
        const destRelPath = hashAssets && HASHABLE_ASSET_PATTERN.test(relPath)
          ? insertAssetHash(relPath, await hashContent(content))
          : relPath;
        resolved[index] = { relPath, destRelPath, content };
      },
    );

    const writeJobs: Array<
      { destPath: string; content: string | Uint8Array }
    > = [];
    for (const { relPath, destRelPath, content } of resolved) {
      const destPath = join(assetsDir, destRelPath);
      const normalizedDestPath = resolve(destPath);
      if (occupiedPaths.has(normalizedDestPath)) {
        throw new Error(
          `Output collision: theme asset "${relPath}" would overwrite "${destPath}".`,
        );
      }
      occupiedPaths.add(normalizedDestPath);
      ensureParentDirSync(destPath);
      manifest[relPath] = destRelPath;
      writeJobs.push({ destPath, content });
    }

    await mapWithConcurrency(
      writeJobs,
      ASSET_COPY_CONCURRENCY,
      async ({ destPath, content }) => {
        if (typeof content === "string") {
          await Deno.writeTextFile(destPath, content);
        } else {
          await Deno.writeFile(destPath, content);
        }
      },
    );

    return manifest;
  }

  /** Resolves a theme asset's raw source to bytes/text, fetching URL sources. */
  private static async resolveAssetContent(
    relPath: string,
    source: string | Uint8Array | URL,
  ): Promise<string | Uint8Array> {
    if (typeof source === "string" || source instanceof Uint8Array) {
      return source;
    }
    const response = await fetch(source);
    if (!response.ok) {
      throw new Error(
        `Failed to fetch theme asset "${relPath}": ${source.href}`,
      );
    }
    return new Uint8Array(await response.arrayBuffer());
  }
}
