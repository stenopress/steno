import { render } from "../utils/tau.ts";
import type { StenoPlugin, StenoTheme, ThemeConfigField } from "../types.ts";
import { dirname, join, resolve, toFileUrl } from "@std/path";
import { ensureDirSync } from "../utils/fileUtils.ts";
import { parse as parseYaml } from "@std/yaml";

type ThemeConfig = Record<string, unknown>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
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
