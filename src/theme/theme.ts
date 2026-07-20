import { render } from "../utils/tau.ts";
import type { StenoPlugin, StenoTheme, ThemeConfigField } from "../types.ts";
import { dirname, join, resolve } from "@std/path";
import { ensureDirSync } from "../utils/fileUtils.ts";
import { parse as parseYaml } from "@std/yaml";

type ThemeConfig = Record<string, unknown>;

interface ThemeDirectoryMetadata {
  name?: string;
  version?: string;
  components?: Record<string, string>;
  defaultConfig?: ThemeConfig;
  configSchema?: Record<string, ThemeConfigField>;
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
      ...this.resolveSchemaDefaults(themeData.configSchema),
      ...themeData.defaultConfig,
      ...userConfig,
    };
  }

  private resolveSchemaDefaults(
    schema?: Record<string, ThemeConfigField>,
  ): ThemeConfig {
    if (!schema) return {};
    return Object.entries(schema).reduce((acc, [key, field]) => {
      if (field.default !== undefined) acc[key] = field.default;
      return acc;
    }, {} as ThemeConfig);
  }

  /**
   * Helper to load a filesystem-based theme directory using a theme.yaml file.
   *
   * @param dir - The path to the theme directory.
   * @param userConfig - Optional overrides for the theme configuration.
   * @returns A new {@link Theme} instance.
   */
  public static loadFromDirectory(
    dir: string,
    userConfig: ThemeConfig = {},
  ): Theme {
    const metadata = Theme.loadMetadata(dir);
    const name = metadata.name || "unnamed";
    const version = metadata.version || "1.0.0";

    const { layouts, layoutPaths } = Theme.loadLayouts(dir);
    const { components, componentPaths } = Theme.loadComponents(
      dir,
      metadata.components,
    );
    const assets = Theme.loadAssets(dir);

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
    let yamlContent = "";
    try {
      yamlContent = Deno.readTextFileSync(join(dir, "theme.yaml"));
    } catch {
      try {
        yamlContent = Deno.readTextFileSync(join(dir, "theme.yml"));
      } catch {
        return {};
      }
    }
    const parsed = parseYaml(yamlContent);
    return parsed && typeof parsed === "object"
      ? (parsed as ThemeDirectoryMetadata)
      : {};
  }

  private static loadLayouts(dir: string) {
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

  private static loadComponents(
    dir: string,
    rawComponents?: Record<string, string>,
  ) {
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
              assets[relPath] = new URL(`file://${fullPath}`);
            }
          }
        };
        walk(assetsDir);
      }
    } catch { /* Assets missing is fine */ }

    return assets;
  }

  /**
   * Internal common renderer wrapper to dry up Tau orchestrations.
   */
  private executeRender(
    template: string,
    context: Record<string, unknown>,
    filePath?: string,
  ): string {
    return render({
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
  public renderLayout(
    layoutName: string,
    content: string,
    variables: Record<string, unknown>,
  ): string {
    const template = this.themeData.layouts[layoutName];
    if (!template) {
      throw new Error(
        `Layout "${layoutName}" not found in theme "${this.name}". Available layouts: ${
          Object.keys(this.themeData.layouts).join(", ")
        }`,
      );
    }
    return this.executeRender(
      template,
      { content, ...variables },
      this.layoutPaths[layoutName],
    );
  }

  /**
   * Renders a theme component using Tau.
   */
  public renderComponent(
    componentName: string,
    variables: Record<string, unknown>,
  ): string {
    const template = this.themeData.components?.[componentName];
    if (!template) {
      throw new Error(
        `Component "${componentName}" not found in theme "${this.name}".`,
      );
    }
    return this.executeRender(
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
   */
  public async copyAssets(
    outputDir: string,
    occupiedPaths: Set<string> = new Set(),
  ): Promise<void> {
    if (!this.themeData.assets) return;
    const assetsDir = join(outputDir, "assets");

    const assets = Object.entries(this.themeData.assets).sort((
      [left],
      [right],
    ) => left.localeCompare(right));
    for (const [relPath, source] of assets) {
      const destPath = join(assetsDir, relPath);
      const normalizedDestPath = resolve(destPath);
      if (occupiedPaths.has(normalizedDestPath)) {
        throw new Error(
          `Output collision: theme asset "${relPath}" would overwrite "${destPath}".`,
        );
      }
      occupiedPaths.add(normalizedDestPath);
      ensureDirSync(dirname(destPath));

      if (typeof source === "string") {
        Deno.writeTextFileSync(destPath, source);
      } else if (source instanceof Uint8Array) {
        Deno.writeFileSync(destPath, source);
      } else if (source instanceof URL) {
        const response = await fetch(source);
        if (!response.ok) {
          throw new Error(`Failed to fetch theme asset: ${source.href}`);
        }
        Deno.writeFileSync(
          destPath,
          new Uint8Array(await response.arrayBuffer()),
        );
      }
    }
  }
}
