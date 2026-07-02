import { parse as parseYaml } from "@std/yaml";
import { parse as parseToml } from "@std/toml";
import type { SiteConfig, StenoPlugin } from "../types.ts";

/** Loads plugin factories declared in the site config. */
export async function loadPlugins(
  config: SiteConfig,
): Promise<StenoPlugin[]> {
  if (!config.plugins?.length) return [];

  const plugins: StenoPlugin[] = [];

  for (const entry of config.plugins) {
    const packageName = typeof entry === "string" ? entry : entry.package;
    const options = typeof entry === "string" ? {} : (entry.options ?? {});

    try {
      const mod = await import(packageName);
      const factory = mod.default ?? mod;

      if (typeof factory !== "function") {
        console.warn(
          `Plugin "${packageName}" does not export a default function, skipping.`,
        );
        continue;
      }

      plugins.push(factory(options));
    } catch (err) {
      console.error(`Failed to load plugin "${packageName}":`, err);
    }
  }

  return plugins;
}

/** Reads and parses a Steno site configuration file. */
export function loadConfig(configPath: string): SiteConfig {
  const fileContents = Deno.readTextFileSync(configPath);
  if (configPath.endsWith(".yaml") || configPath.endsWith(".yml")) {
    return parseYaml(fileContents) as SiteConfig;
  } else if (configPath.endsWith(".toml")) {
    return parseToml(fileContents) as unknown as SiteConfig;
  } else {
    throw new Error(
      `Unsupported config file format at "${configPath}". Please use .yaml, .yml, or .toml.`,
    );
  }
}
