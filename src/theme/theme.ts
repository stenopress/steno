import { render } from "../utils/tau.ts";
import type { SiteConfig, StenoPlugin, StenoTheme, ThemeConfigField } from "../types.ts";
import type { CollectionMap } from "../core/collections.ts";
import { basename, fromFileUrl, isAbsolute, join, resolve, toFileUrl } from "@std/path";
import { parse as parseYaml } from "@std/yaml";
import { transpile } from "@deno/emit";
import { isRecord } from "../utils/text.ts";
import { copyThemeAssets } from "./assets.ts";
import { loadThemeFunctions, validateThemeFunctions } from "./functions.ts";
import { resolveSchemaDefaults, type ThemeConfig, validateThemeConfig } from "./config.ts";

export type { ThemeConfig } from "./config.ts";

/**
 * Bundled theme specifiers Steno resolves from its own packaged copy,
 * without a network request. Lives here (rather than `steno_theme.ts`,
 * which orchestrates full theme resolution including module imports) so a
 * directory theme's `extends` can resolve the same three names without a
 * circular import - `steno_theme.ts` already imports `Theme` from this file.
 */
export const bundledThemeSources: Record<string, URL> = {
  "jsr:@steno/theme-minimal": new URL("../../packages/theme-minimal", import.meta.url),
  "jsr:@steno/theme-docs-minimal": new URL("../../packages/theme-docs-minimal", import.meta.url),
  "jsr:@steno/theme-marketing-minimal": new URL(
    "../../packages/theme-marketing-minimal",
    import.meta.url,
  ),
};

/** Returns a local bundled-theme path when Steno itself is running from disk. */
export function bundledThemeLocalPath(source: URL): string | undefined {
  return source.protocol === "file:" ? fromFileUrl(source) : undefined;
}

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

interface ThemeDirectoryMetadata {
  name?: string;
  version?: string;
  components?: Record<string, string>;
  defaultConfig?: ThemeConfig;
  configSchema?: Record<string, ThemeConfigField>;
  extends?: string;
  functions?: string;
}

/** A directory theme's own data plus the source paths its layouts/components loaded from. */
interface LoadedDirectoryTheme {
  theme: StenoTheme;
  layoutPaths: Record<string, string>;
  componentPaths: Record<string, string>;
}

/**
 * Merges a base theme with overrides, producing a new `StenoTheme`.
 *
 * `layouts`, `components`, `functions`, `assets`, `configSchema`, and `defaultConfig` are
 * merged shallowly by key (override wins per key, unset base keys survive).
 * `name`, `version`, and `plugins` are replaced wholesale when present in
 * `overrides`. Use this instead of a raw object spread when extending a
 * bundled theme - a plain `{ ...base, layouts: { ...only-the-new-ones } }`
 * silently drops any base layout not re-listed.
 */
export function mergeTheme(base: StenoTheme, overrides: Partial<StenoTheme>): StenoTheme {
  return {
    name: overrides.name ?? base.name,
    version: overrides.version ?? base.version,
    layouts: { ...base.layouts, ...overrides.layouts },
    components: { ...base.components, ...overrides.components },
    functions: { ...base.functions, ...overrides.functions },
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
  private readonly functionsSignature?: string;
  private layoutPaths: Record<string, string> = {};
  private componentPaths: Record<string, string> = {};
  /** An array of plugins bundled with this theme. */
  public readonly plugins: StenoPlugin[];

  /**
   * Creates a new Theme instance.
   *
   * @param themeData - The base configuration/templates of the theme.
   * @param userConfig - Optional overrides for the theme defaults.
   * @throws {Error} if `themeData` doesn't have a usable name, version, or
   *   at least one layout. Thrown rather than deferred to render time, since
   *   the alternative is a confusing per-page "Layout not found" error much
   *   later - a theme this incomplete can't render anything at all. Callers
   *   that load a theme (`loadTheme` in `steno_theme.ts`) already wrap
   *   construction in a try/catch that turns this into a proper
   *   `theme-load-failed` diagnostic, so this can stay a plain throw.
   */
  constructor(themeData: StenoTheme, userConfig: ThemeConfig = {}) {
    if (typeof themeData.name !== "string" || !themeData.name.trim()) {
      throw new Error('A theme must have a non-empty "name".');
    }
    if (typeof themeData.version !== "string" || !themeData.version.trim()) {
      throw new Error(`Theme "${themeData.name}" must have a non-empty "version".`);
    }
    if (!isRecord(themeData.layouts) || Object.keys(themeData.layouts).length === 0) {
      throw new Error(`Theme "${themeData.name}" declares no layouts - it needs at least one.`);
    }

    validateThemeFunctions(themeData.functions);
    const functions =
      themeData.functions && Object.keys(themeData.functions).length > 0
        ? { ...themeData.functions }
        : undefined;
    this.themeData = { ...themeData, functions };
    if (functions) {
      // Closures cannot be serialized; never reuse a previous instance's page cache.
      this.functionsSignature = crypto.randomUUID();
    }
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
    // Base config already validated in constructor; skip re-validating when no override.
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
  public static async loadFromDirectory(dir: string, userConfig: ThemeConfig = {}): Promise<Theme> {
    const { theme, layoutPaths, componentPaths } = await Theme.loadDirectoryChain(dir, new Set());

    const themeInstance = new Theme(theme, userConfig);
    themeInstance.layoutPaths = layoutPaths;
    themeInstance.componentPaths = componentPaths;
    return themeInstance;
  }

  /**
   * Loads a single directory theme's own data (no `extends` resolution),
   * then - if its `theme.yaml` declares `extends` - recursively loads and
   * `mergeTheme`s the base theme underneath it, same field-by-field
   * semantics as [extending a bundled theme](../../docs/theme-specification.md)
   * from a module. Source-path maps (used for Tau error messages) merge the
   * same way: a layout/component this theme redeclares points at this
   * theme's file, everything else still points at the base's.
   *
   * `seen` guards against a cycle (`A extends B extends A`) - each
   * directory's resolved absolute path is added before recursing, so a
   * repeat throws instead of recursing forever.
   */
  private static async loadDirectoryChain(
    dir: string,
    seen: Set<string>,
  ): Promise<LoadedDirectoryTheme> {
    const resolvedDir = resolve(dir);
    if (seen.has(resolvedDir)) {
      throw new Error(
        `Circular "extends" chain in theme directory "${dir}" - it already appears earlier in the chain.`,
      );
    }
    seen.add(resolvedDir);

    const metadata = Theme.loadMetadata(dir);
    const name = metadata.name || "unnamed";
    const version = metadata.version || "1.0.0";

    const { layouts, layoutPaths } = Theme.loadLayouts(dir);
    const { components, componentPaths } = Theme.loadComponents(dir, metadata.components);
    const assets = {
      ...Theme.loadAssets(dir),
      ...(await Theme.loadScripts(dir)),
    };

    const own: StenoTheme = {
      name,
      version,
      layouts,
      components,
      assets,
      defaultConfig: metadata.defaultConfig || {},
      configSchema: metadata.configSchema,
      functions: await loadThemeFunctions(dir, metadata.functions),
    };

    if (!metadata.extends) {
      return { theme: own, layoutPaths, componentPaths };
    }

    const baseDir = Theme.resolveExtendsDir(dir, metadata.extends);
    const base = await Theme.loadDirectoryChain(baseDir, seen);
    return {
      theme: mergeTheme(base.theme, own),
      layoutPaths: { ...base.layoutPaths, ...layoutPaths },
      componentPaths: { ...base.componentPaths, ...componentPaths },
    };
  }

  /**
   * Resolves a `theme.yaml` `extends` value to a directory to load. Accepts
   * the same three bundled specifiers `theme:` does (resolved from Steno's
   * own packaged copy, no network request) or a local path - relative paths
   * resolve against `dir` (the extending theme's own directory), not the
   * current working directory, so a theme keeps working regardless of where
   * `steno build` runs from. Unlike top-level `theme:`, arbitrary `jsr:`,
   * `npm:`, or `https:` module specifiers aren't supported here - a
   * directory theme's `extends` always resolves to another `theme.yaml`
   * directory, never an importable `StenoTheme` module.
   */
  private static resolveExtendsDir(dir: string, specifier: string): string {
    const bundledSource = bundledThemeSources[specifier];
    if (bundledSource) {
      const localPath = bundledThemeLocalPath(bundledSource);
      if (!localPath) {
        throw new Error(
          `Theme extends "${specifier}", but its bundled copy isn't available on disk in this environment.`,
        );
      }
      return localPath;
    }

    if (specifier.startsWith("file://")) return fromFileUrl(new URL(specifier));
    if (isAbsolute(specifier)) return specifier;
    if (specifier.startsWith(".")) return resolve(dir, specifier);

    throw new Error(
      `Theme "extends: ${specifier}" is not a recognized bundled theme (jsr:@steno/theme-minimal, ` +
        `jsr:@steno/theme-docs-minimal, jsr:@steno/theme-marketing-minimal) or a local path ` +
        `(starting with ".", "/", or "file://").`,
    );
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
    return parsed && typeof parsed === "object" ? (parsed as ThemeDirectoryMetadata) : {};
  }

  /** Loads layout templates and their source paths from a theme directory. */
  private static loadLayouts(dir: string): {
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
    } catch {
      /* Layouts missing is fine */
    }

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
          console.error(`Failed to load component "${capKey}" from "${fullPath}":`, err);
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
            const relPath = relPrefix ? `${relPrefix}/${entry.name}` : entry.name;
            if (entry.isDirectory) walk(fullPath, relPath);
            else if (entry.isFile) {
              assets[relPath] = toFileUrl(fullPath);
            }
          }
        };
        walk(assetsDir);
      }
    } catch {
      /* Assets missing is fine */
    }

    return assets;
  }

  /**
   * Recursively compiles `scripts/*.ts`/`*.tsx` into JS text, and passes
   * `*.js`/`*.jsx` through unchanged. Output is flattened to a single
   * directory level (`scripts/sub/foo.ts` -> `foo.js`) so themes can
   * reference compiled scripts the same way they reference `assets/*.js`.
   */
  private static async loadScripts(dir: string): Promise<Record<string, string>> {
    const scripts: Record<string, string> = {};
    const scriptsDir = join(dir, "scripts");

    const sourcePaths: string[] = [];
    try {
      if (Deno.statSync(scriptsDir).isDirectory) {
        const walk = (currentDir: string) => {
          for (const entry of Deno.readDirSync(currentDir)) {
            const fullPath = join(currentDir, entry.name);
            if (entry.isDirectory) walk(fullPath);
            else if (entry.isFile && /\.(ts|tsx|js|jsx)$/.test(entry.name)) {
              sourcePaths.push(fullPath);
            }
          }
        };
        walk(scriptsDir);
      }
    } catch {
      /* Scripts directory missing is fine */
    }

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
      functions: this.themeData.functions,
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
        `Layout "${layoutName}" not found in theme "${this.name}". Available layouts: ${Object.keys(
          this.themeData.layouts,
        ).join(", ")}`,
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
      throw new Error(`Component "${componentName}" not found in theme "${this.name}".`);
    }
    return await this.executeRender(template, variables, this.componentPaths[componentName]);
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
    functions?: string;
  } {
    const sortEntries = (obj: Record<string, string> = {}) =>
      Object.entries(obj).sort(([l], [r]) => l.localeCompare(r));

    return {
      name: this.name,
      version: this.version,
      config: this.config,
      layouts: sortEntries(this.themeData.layouts),
      components: sortEntries(this.themeData.components),
      functions: this.functionsSignature,
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
    minifyCssAssets = true,
  ): Promise<Record<string, string>> {
    return await copyThemeAssets(
      this.themeData.assets,
      outputDir,
      occupiedPaths,
      hashAssets,
      minifyCssAssets,
    );
  }
}
