import type { StenoHooks, StenoPlugin } from "../../types.ts";
import type { Theme } from "../../theme/theme.ts";
import type { SiteConfig } from "../../types.ts";
import { getIsolatedPluginSignature } from "../../plugins/isolated_plugin.ts";
import { pluginSourceRevisions } from "../../plugins/source_revision.ts";
import { filters } from "../../utils/tau.ts";

const initialFilters = new Map(Object.entries(filters));
const customFilterIds = new WeakMap<object, string>();

function containsFunction(value: unknown, seen = new Set<object>()): boolean {
  if (typeof value === "function") return true;
  if (!value || typeof value !== "object" || seen.has(value)) return false;
  seen.add(value);
  return Object.values(value).some((entry) => containsFunction(entry, seen));
}

/** Opaque callbacks can read inputs outside the dependency graph. */
export function hasOpaqueBuildInputs(
  config: SiteConfig,
  theme: Theme | undefined,
  plugins: StenoPlugin[],
  hooks: StenoHooks,
): boolean {
  return (
    plugins.length > 0 ||
    containsFunction(config) ||
    Object.values(hooks).some((hook) => typeof hook === "function") ||
    theme?.getBuildSignatureData().functions !== undefined ||
    Object.entries(filters).some(([name, filter]) => initialFilters.get(name) !== filter)
  );
}

function filterSignature(
  name: string,
  filter: (value: unknown, ...args: unknown[]) => unknown,
): string {
  if (initialFilters.get(name) === filter) return filter.toString();
  let id = customFilterIds.get(filter);
  if (!id) {
    // Closures cannot be serialized safely; custom filters invalidate disk caches between runs.
    id = crypto.randomUUID();
    customFilterIds.set(filter, id);
  }
  return id;
}

export function createBuildSignature(
  config: SiteConfig,
  theme?: Theme,
  plugins: StenoPlugin[] = [],
  publicEnv?: Record<string, string>,
  opaqueInputs = false,
): string {
  const themeSignature = theme?.getBuildSignatureData();
  const pluginSignature = plugins.map((plugin) => {
    const isolatedSignature = getIsolatedPluginSignature(plugin);
    if (isolatedSignature !== undefined) {
      return { name: plugin.name, isolated: isolatedSignature };
    }
    return {
      name: plugin.name,
      sourceRevision: pluginSourceRevisions.get(plugin),
      transformAst: plugin.transformAst?.toString() ?? null,
      transformHtml: plugin.transformHtml?.toString() ?? null,
      beforeBuild: plugin.beforeBuild?.toString() ?? null,
      afterPage: plugin.afterPage?.toString() ?? null,
      afterBuild: plugin.afterBuild?.toString() ?? null,
    };
  });

  return JSON.stringify({
    opaqueInputs,
    config,
    theme: themeSignature
      ? {
          name: themeSignature.name,
          version: themeSignature.version,
          config: themeSignature.config,
          functions: themeSignature.functions,
        }
      : null,
    plugins: pluginSignature,
    filters: Object.entries(filters)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, filter]) => [name, filterSignature(name, filter)]),
    publicEnv: publicEnv ?? null,
  });
}
