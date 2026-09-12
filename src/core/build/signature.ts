import type { StenoPlugin } from "../../types.ts";
import type { Theme } from "../../theme/theme.ts";
import type { SiteConfig } from "../../types.ts";
import { getIsolatedPluginSignature } from "../../plugins/isolated_plugin.ts";
import { pluginSourceRevisions } from "../../plugins/source_revision.ts";
import { filters } from "../../utils/tau.ts";

const initialFilters = new Map(Object.entries(filters));
const customFilterIds = new WeakMap<object, string>();

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
  data?: unknown,
  publicEnv?: Record<string, string>,
): string {
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
    config,
    theme: theme ? theme.getBuildSignatureData() : null,
    plugins: pluginSignature,
    filters: Object.entries(filters)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, filter]) => [name, filterSignature(name, filter)]),
    data: data ?? null,
    publicEnv: publicEnv ?? null,
  });
}
