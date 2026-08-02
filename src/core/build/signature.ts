import type { StenoPlugin } from "../../types.ts";
import type { Theme } from "../../theme/theme.ts";
import type { SiteConfig } from "../../types.ts";
import { getIsolatedPluginSignature } from "../../plugins/isolated_plugin.ts";

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
    data: data ?? null,
    publicEnv: publicEnv ?? null,
  });
}
