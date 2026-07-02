import { render } from "../utils/scribe.ts";
import type { StenoPlugin, StenoTheme, ThemeConfigField } from "../types.ts";
import { dirname, join } from "@std/path";
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

    const schemaDefaults = this.resolveSchemaDefaults(themeData.configSchema);

    this.config = {
      ...schemaDefaults,
      ...themeData.defaultConfig,
      ...userConfig,
    };
  }

  /**
   * Resolves default values for theme configuration based on the provided schema.
   * @param schema The theme configuration schema.
   * @returns An object containing default values.
   */
  private resolveSchemaDefaults(
    schema?: Record<string, ThemeConfigField>,
  ): ThemeConfig {
    if (!schema) return {};
    const result: ThemeConfig = {};
    for (const [key, field] of Object.entries(schema)) {
      if (field.default !== undefined) {
        result[key] = field.default;
      }
    }
    return result;
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
    let yamlContent = "";
    let yamlPath = join(dir, "theme.yaml");
    try {
      yamlContent = Deno.readTextFileSync(yamlPath);
    } catch {
      yamlPath = join(dir, "theme.yml");
      yamlContent = Deno.readTextFileSync(yamlPath);
    }

    const parsedMetadata = parseYaml(yamlContent);
    const metadata: ThemeDirectoryMetadata =
      parsedMetadata && typeof parsedMetadata === "object"
        ? (parsedMetadata as ThemeDirectoryMetadata)
        : {};
    const name = metadata.name || "unnamed";
    const version = metadata.version || "1.0.0";

    const layouts: Record<string, string> = {};
    const layoutPaths: Record<string, string> = {};
    const layoutsDir = join(dir, "layouts");
    try {
      const layoutsStat = Deno.statSync(layoutsDir);
      if (layoutsStat.isDirectory) {
        for (const entry of Deno.readDirSync(layoutsDir)) {
          if (
            entry.isFile &&
            (entry.name.endsWith(".scr") || entry.name.endsWith(".liquid"))
          ) {
            const key = entry.name.replace(/\.(scr|liquid)$/, "");
            const fullLayoutPath = join(layoutsDir, entry.name);
            layouts[key] = Deno.readTextFileSync(fullLayoutPath);
            layoutPaths[key] = fullLayoutPath;
          }
        }
      }
    } catch {
      // continue
    }

    const components: Record<string, string> = {};
    const componentPaths: Record<string, string> = {};
    if (metadata.components) {
      for (const [key, relPath] of Object.entries(metadata.components)) {
        // Capitalize component name
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

    const assets: Record<string, string | Uint8Array | URL> = {};
    const assetsDir = join(dir, "assets");
    try {
      const assetsStat = Deno.statSync(assetsDir);
      if (assetsStat.isDirectory) {
        const addAssetsRecursively = (currentDir: string, relPrefix = "") => {
          for (const entry of Deno.readDirSync(currentDir)) {
            const fullPath = join(currentDir, entry.name);
            const relPath = relPrefix
              ? `${relPrefix}/${entry.name}`
              : entry.name;
            if (entry.isDirectory) {
              addAssetsRecursively(fullPath, relPath);
            } else if (entry.isFile) {
              assets[relPath] = new URL(`file://${fullPath}`);
            }
          }
        };
        addAssetsRecursively(assetsDir);
      }
    } catch {
      // Assets directory not found, continue
    }

    const themeData: StenoTheme = {
      name,
      version,
      layouts,
      components,
      assets,
      defaultConfig: metadata.defaultConfig || {},
      configSchema: metadata.configSchema,
    };

    const themeInstance = new Theme(themeData, userConfig);
    themeInstance.layoutPaths = layoutPaths;
    themeInstance.componentPaths = componentPaths;
    return themeInstance;
  }

  /**
   * Renders a layout template with content and page variables using Scribe.
   *
   * @param layoutName - The name of the layout to render.
   * @param content - The pre-rendered HTML body content.
   * @param variables - Object containing page-level variables.
   * @returns The rendered layout HTML string.
   * @throws {Error} If the specified layout is not found in the theme.
   */
  public renderLayout(
    layoutName: string,
    content: string,
    variables: Record<string, unknown>,
  ): string {
    const layoutTemplate = this.themeData.layouts[layoutName];
    if (!layoutTemplate) {
      const available = Object.keys(this.themeData.layouts).join(", ");
      throw new Error(
        `Layout "${layoutName}" not found in theme "${this.name}". Available layouts: ${available}`,
      );
    }
    return render({
      template: layoutTemplate,
      context: {
        content,
        ...variables,
      },
      components: this.themeData.components || {},
      filePath: this.layoutPaths[layoutName],
    });
  }

  /**
   * Renders a theme component using Scribe.
   *
   * @param componentName - The name of the component to render.
   * @param variables - Object containing variables for the component.
   * @returns The rendered component HTML string.
   * @throws {Error} If the specified component is not found in the theme.
   */
  public renderComponent(
    componentName: string,
    variables: Record<string, unknown>,
  ): string {
    const componentTemplate = this.themeData.components?.[componentName];
    if (!componentTemplate) {
      throw new Error(
        `Component "${componentName}" not found in theme "${this.name}".`,
      );
    }
    return render({
      template: componentTemplate,
      context: variables,
      components: this.themeData.components || {},
      filePath: this.componentPaths[componentName],
    });
  }

  /**
   * Copies all theme assets to the output directory (e.g., dist/assets/).
   *
   * @param outputDir - The root output/dist directory path.
   * @returns A promise that resolves when copying is finished.
   * @throws {Error} If an asset cannot be fetched or written to disk.
   */
  public async copyAssets(outputDir: string): Promise<void> {
    if (!this.themeData.assets) return;
    const assetsDir = join(outputDir, "assets");

    for (const [relPath, source] of Object.entries(this.themeData.assets)) {
      const destPath = join(assetsDir, relPath);
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
        const buffer = new Uint8Array(await response.arrayBuffer());
        Deno.writeFileSync(destPath, buffer);
      }
    }
  }
}
