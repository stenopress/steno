import { parse as parseYaml } from "@std/yaml";
import { parse as parseToml } from "@std/toml";
import type {
  PluginEntry,
  PluginSecurityConfig,
  SiteConfig,
  StenoPlugin,
} from "../types.ts";
import { isStenoPlugin } from "../plugins/plugins.ts";

type PluginFactory = (
  options: Record<string, unknown>,
) => StenoPlugin | Promise<StenoPlugin>;

type ResolvedPluginSecurityConfig = Required<PluginSecurityConfig>;

function resolvePluginSecurityConfig(
  config: SiteConfig,
): ResolvedPluginSecurityConfig {
  const security = config.custom?.pluginSecurity ?? {};
  return {
    allowLocal: security.allowLocal === true,
    allowRemoteHttp: security.allowRemoteHttp === true,
    allowNodeBuiltins: security.allowNodeBuiltins === true,
    allowThemePlugins: security.allowThemePlugins !== false,
  };
}

function getBlockedPluginReason(
  packageName: string,
  security: ResolvedPluginSecurityConfig,
): string | null {
  if (!packageName.trim()) {
    return "plugin package specifier cannot be empty.";
  }

  if (
    packageName.startsWith("./") || packageName.startsWith("../") ||
    packageName.startsWith("/")
  ) {
    return "path-based specifiers are not allowed. Use a registry package specifier (for example `jsr:` or `npm:`), or enable local plugins and use a `file://` URL.";
  }

  let url: URL | null = null;
  try {
    url = new URL(packageName);
  } catch {
    return "plugin specifier must use an explicit protocol (for example `jsr:`, `npm:`, `file://`, or `https://`).";
  }

  switch (url.protocol) {
    case "jsr:":
    case "npm:":
      return null;
    case "file:":
      return security.allowLocal
        ? null
        : "local `file://` plugin imports are disabled by default. Set `custom.pluginSecurity.allowLocal: true` to allow them.";
    case "http:":
    case "https:":
      return security.allowRemoteHttp
        ? null
        : "remote `http(s)://` plugin imports are disabled by default. Set `custom.pluginSecurity.allowRemoteHttp: true` to allow them.";
    case "node:":
      return security.allowNodeBuiltins
        ? null
        : "`node:` builtin plugin imports are disabled by default. Set `custom.pluginSecurity.allowNodeBuiltins: true` to allow them.";
    case "data:":
    case "blob:":
      return `\`${url.protocol}\` plugin imports are not allowed.`;
    default:
      return `unsupported plugin protocol "${url.protocol}".`;
  }
}

function toPluginEntry(input: unknown): PluginEntry | null {
  if (typeof input === "string") {
    return { package: input };
  }
  if (!input || typeof input !== "object") {
    return null;
  }

  const candidate = input as Record<string, unknown>;
  if (typeof candidate.package !== "string") {
    return null;
  }

  if (candidate.options === undefined) {
    return { package: candidate.package };
  }
  if (
    !candidate.options || typeof candidate.options !== "object" ||
    Array.isArray(candidate.options)
  ) {
    return null;
  }

  return {
    package: candidate.package,
    options: candidate.options as Record<string, unknown>,
  };
}

function clonePluginOptions(
  options: Record<string, unknown>,
): Record<string, unknown> {
  const cloned = structuredClone(options);
  return Object.freeze(cloned);
}

/** Loads plugin factories declared in the site config. */
export async function loadPlugins(
  config: SiteConfig,
): Promise<StenoPlugin[]> {
  if (!config.plugins?.length) return [];

  const plugins: StenoPlugin[] = [];
  const security = resolvePluginSecurityConfig(config);

  for (const configuredEntry of config.plugins) {
    const entry = toPluginEntry(configuredEntry);
    if (!entry) {
      console.warn("Skipping invalid plugin entry in config.");
      continue;
    }

    const packageName = entry.package;
    const options = entry.options ?? {};

    const blockedReason = getBlockedPluginReason(packageName, security);
    if (blockedReason) {
      console.error(
        `Blocked plugin "${packageName}": ${blockedReason}`,
      );
      continue;
    }

    try {
      const mod = await import(packageName);
      const factory = mod.default ?? mod;

      if (typeof factory !== "function") {
        console.warn(
          `Plugin "${packageName}" does not export a default function, skipping.`,
        );
        continue;
      }

      const plugin = await (factory as PluginFactory)(
        clonePluginOptions(options),
      );
      if (!isStenoPlugin(plugin)) {
        console.warn(
          `Plugin "${packageName}" returned an invalid plugin object, skipping.`,
        );
        continue;
      }

      plugins.push(plugin);
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
