import type { StenoPlugin } from "../../types.ts";
import type { Theme } from "../../theme/theme.ts";
import type { SiteConfig } from "../../types.ts";

export function createBuildSignature(
  config: SiteConfig,
  theme?: Theme,
  plugins: StenoPlugin[] = [],
): string {
  const pluginSignature = plugins.map((plugin) => ({
    name: plugin.name,
    transformAst: plugin.transformAst?.toString() ?? null,
    transformHtml: plugin.transformHtml?.toString() ?? null,
    beforeBuild: plugin.beforeBuild?.toString() ?? null,
    afterPage: plugin.afterPage?.toString() ?? null,
    afterBuild: plugin.afterBuild?.toString() ?? null,
  }));

  return JSON.stringify({
    config,
    theme: theme ? theme.getBuildSignatureData() : null,
    plugins: pluginSignature,
  });
}
