import { parse as parseYaml } from "@std/yaml";
import { parse as parseToml } from "@std/toml";
import type {
  PluginEntry,
  PluginSourcePolicy,
  SiteConfig,
  StenoPlugin,
} from "../types.ts";
import { isStenoPlugin } from "../plugins/plugins.ts";
import { loadIsolatedPlugin } from "../plugins/isolated_plugin.ts";

type PluginFactory = (
  options: Record<string, unknown>,
) => StenoPlugin | Promise<StenoPlugin>;

type ResolvedPluginSourcePolicy = Required<PluginSourcePolicy>;

function resolvePluginSourcePolicy(
  config: SiteConfig,
): ResolvedPluginSourcePolicy {
  const policy = config.custom?.pluginSourcePolicy ??
    config.custom?.pluginSecurity ??
    {};
  return {
    allowLocal: policy.allowLocal === true,
    allowRemoteHttp: policy.allowRemoteHttp === true,
    allowNodeBuiltins: policy.allowNodeBuiltins === true,
    allowThemePlugins: policy.allowThemePlugins !== false,
  };
}

function getBlockedPluginReason(
  packageName: string,
  policy: ResolvedPluginSourcePolicy,
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
      return policy.allowLocal
        ? null
        : "local `file://` plugin imports are disabled by default. Set `custom.pluginSourcePolicy.allowLocal: true` to allow them.";
    case "http:":
    case "https:":
      return policy.allowRemoteHttp
        ? null
        : "remote `http(s)://` plugin imports are disabled by default. Set `custom.pluginSourcePolicy.allowRemoteHttp: true` to allow them.";
    case "node:":
      return policy.allowNodeBuiltins
        ? null
        : "`node:` builtin plugin imports are disabled by default. Set `custom.pluginSourcePolicy.allowNodeBuiltins: true` to allow them.";
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

  if (
    candidate.options !== undefined &&
    (!candidate.options || typeof candidate.options !== "object" ||
      Array.isArray(candidate.options))
  ) {
    return null;
  }

  if (
    candidate.mode !== undefined &&
    candidate.mode !== "trusted" &&
    candidate.mode !== "isolated"
  ) return null;

  const permissions = candidate.permissions;
  if (
    permissions !== undefined &&
    (!permissions || typeof permissions !== "object" ||
      Array.isArray(permissions) ||
      Object.values(permissions).some((value) =>
        !Array.isArray(value) ||
        value.some((entry) => typeof entry !== "string")
      ))
  ) return null;

  if (
    candidate.timeoutMs !== undefined &&
    (typeof candidate.timeoutMs !== "number" ||
      !Number.isFinite(candidate.timeoutMs) || candidate.timeoutMs <= 0)
  ) return null;
  if (
    candidate.maxOutputBytes !== undefined &&
    (typeof candidate.maxOutputBytes !== "number" ||
      !Number.isInteger(candidate.maxOutputBytes) ||
      candidate.maxOutputBytes <= 0)
  ) return null;
  if (
    candidate.memoryMb !== undefined &&
    (typeof candidate.memoryMb !== "number" ||
      !Number.isInteger(candidate.memoryMb) ||
      candidate.memoryMb < 16)
  ) return null;
  if (
    candidate.integrity !== undefined &&
    typeof candidate.integrity !== "string"
  ) return null;
  if (
    candidate.lockFile !== undefined &&
    typeof candidate.lockFile !== "string"
  ) return null;

  return {
    package: candidate.package,
    options: candidate.options as Record<string, unknown> | undefined,
    mode: candidate.mode as PluginEntry["mode"],
    permissions: permissions as PluginEntry["permissions"],
    timeoutMs: candidate.timeoutMs as number | undefined,
    maxOutputBytes: candidate.maxOutputBytes as number | undefined,
    memoryMb: candidate.memoryMb as number | undefined,
    lockFile: candidate.lockFile as string | undefined,
    integrity: candidate.integrity as string | undefined,
  };
}

function clonePluginOptions(
  options: Record<string, unknown>,
): Record<string, unknown> {
  const cloned = structuredClone(options);
  return Object.freeze(cloned);
}

function isPinnedRegistryPlugin(packageName: string): boolean {
  if (packageName.startsWith("jsr:")) {
    return /^jsr:(?:@[^/]+\/[^@]+|[^@]+)@[^/]+/.test(packageName);
  }
  if (packageName.startsWith("npm:")) {
    return /^npm:(?:@[^/]+\/[^@]+|[^@]+)@[^/]+/.test(packageName);
  }
  return true;
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function verifyPluginIntegrity(entry: PluginEntry): Promise<void> {
  if (!entry.integrity) return;
  if (!entry.integrity.startsWith("sha256-")) {
    throw new Error("Plugin integrity must use the `sha256-<base64>` format.");
  }

  let source: Uint8Array;
  if (entry.package.startsWith("file://")) {
    source = await Deno.readFile(new URL(entry.package));
  } else if (
    entry.package.startsWith("https://") ||
    entry.package.startsWith("http://")
  ) {
    const response = await fetch(entry.package);
    if (!response.ok) {
      throw new Error(
        `Unable to fetch plugin for integrity verification: HTTP ${response.status}.`,
      );
    }
    source = new Uint8Array(await response.arrayBuffer());
  } else {
    throw new Error(
      "Per-plugin integrity currently supports `file://` and HTTP(S) sources. Use a frozen Deno lockfile for JSR/npm plugins.",
    );
  }

  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", source.slice().buffer),
  );
  const actual = `sha256-${encodeBase64(digest)}`;
  if (actual !== entry.integrity) {
    throw new Error(
      `Plugin integrity mismatch: expected "${entry.integrity}", received "${actual}".`,
    );
  }
}

/**
 * Loads trusted plugin factories declared in the site config.
 *
 * The configured source policy filters top-level module specifiers only.
 * Loaded plugins execute in-process with Steno's Deno permissions.
 */
export async function loadPlugins(
  config: SiteConfig,
): Promise<StenoPlugin[]> {
  if (!config.plugins?.length) return [];

  const plugins: StenoPlugin[] = [];
  const sourcePolicy = resolvePluginSourcePolicy(config);

  for (const configuredEntry of config.plugins) {
    const entry = toPluginEntry(configuredEntry);
    if (!entry) {
      console.warn("Skipping invalid plugin entry in config.");
      continue;
    }

    const packageName = entry.package;
    const options = entry.options ?? {};

    const blockedReason = getBlockedPluginReason(packageName, sourcePolicy);
    if (blockedReason) {
      console.error(
        `Blocked plugin source "${packageName}": ${blockedReason}`,
      );
      continue;
    }

    try {
      if (
        entry.mode === "isolated" &&
        !isPinnedRegistryPlugin(packageName)
      ) {
        throw new Error(
          `Isolated registry plugin "${packageName}" must include an explicit version.`,
        );
      }
      if (
        entry.mode === "isolated" &&
        (packageName.startsWith("http://") ||
          packageName.startsWith("https://")) &&
        !entry.integrity
      ) {
        throw new Error(
          `Isolated URL plugin "${packageName}" must include a SHA-256 integrity value.`,
        );
      }
      await verifyPluginIntegrity(entry);

      if (entry.mode === "isolated") {
        plugins.push(await loadIsolatedPlugin(entry));
        continue;
      }

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
      if (entry.mode === "isolated") {
        throw new Error(
          `Failed to load isolated plugin "${packageName}": ${
            err instanceof Error ? err.message : String(err)
          }`,
          { cause: err },
        );
      }
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
