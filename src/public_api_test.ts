import { assertEquals } from "@std/assert";
import { filters, render, runStenoCli, Steno, Theme } from "../mod.ts";
import type {
  MarkdownTokens,
  PluginEntry,
  PluginSourcePolicy,
  SiteConfig,
  StenoHooks,
  StenoPlugin,
  StenoTheme,
} from "./types.ts";
import type { StenoTheme as LegacyStenoTheme } from "./theme/types.ts";

export function registerPublicApiTests(): void {
  Deno.test("public api: Steno export contract is intentional", async () => {
    const manifest = JSON.parse(
      await Deno.readTextFile(new URL("../deno.json", import.meta.url)),
    ) as { exports: string };
    const output = await new Deno.Command(Deno.execPath(), {
      args: ["doc", "--json", new URL("../mod.ts", import.meta.url).pathname],
    }).output();

    assertEquals(manifest.exports, "./mod.ts");
    assertEquals(output.success, true);

    const document = JSON.parse(new TextDecoder().decode(output.stdout)) as {
      nodes: Record<string, { symbols: { name: string }[] }>;
    };
    const module = Object.values(document.nodes)[0];

    assertEquals(module.symbols.map(({ name }) => name).sort(), [
      "Collection",
      "CollectionConfig",
      "CollectionFieldSchema",
      "CollectionItem",
      "CollectionMap",
      "CoreTheme",
      "Diagnostic",
      "FilterFunction",
      "GeneratedPage",
      "HeadTag",
      "HeadTagBase",
      "IsolatedPluginPermissions",
      "LinkHeadTag",
      "MarkdownToken",
      "MarkdownTokens",
      "MetaHeadTag",
      "NavigationNode",
      "PageConfigOverrides",
      "PageRenderContext",
      "PluginEntry",
      "PluginSecurityConfig",
      "PluginSourcePolicy",
      "ScriptHeadTag",
      "SiteConfig",
      "Steno",
      "StenoDiagnosticError",
      "StenoHooks",
      "StenoPlugin",
      "StenoTheme",
      "TauCacheStats",
      "TauError",
      "TauErrorCode",
      "TauErrorLocation",
      "TauLimits",
      "TauOptions",
      "Theme",
      "ThemeConfig",
      "ThemeConfigField",
      "clearTauCache",
      "filters",
      "getTauCacheStats",
      "mergeTheme",
      "render",
      "runStenoCli",
    ]);
  });

  Deno.test("public api: root exports are available", () => {
    assertEquals(typeof Steno, "function");
    assertEquals(typeof Theme, "function");
    assertEquals(typeof render, "function");
    assertEquals(typeof filters.date, "function");
    assertEquals(typeof runStenoCli, "function");
  });

  Deno.test("public api: shared types remain compatible with legacy shims", () => {
    const theme: StenoTheme = { name: "demo", version: "1.0.0", layouts: {} };
    const legacyTheme: LegacyStenoTheme = theme;
    const plugin: StenoPlugin = { name: "plugin" };
    const pluginEntry: PluginEntry = { package: "demo-plugin" };
    const pluginSourcePolicy: PluginSourcePolicy = { allowLocal: false };
    const hooks: StenoHooks = {};
    const tokens: MarkdownTokens = Object.assign(
      [{ type: "paragraph", raw: "Demo", text: "Demo" }],
      { links: {} },
    );
    const config: SiteConfig = {
      title: "Demo",
      description: "Demo",
      author: "Author",
      plugins: [pluginEntry],
      custom: { pluginSourcePolicy },
    };

    assertEquals(legacyTheme.name, theme.name);
    assertEquals(hooks.beforeBuild, undefined);
    assertEquals(plugin.name, "plugin");
    assertEquals(tokens[0].text, "Demo");
    assertEquals(config.plugins?.[0], pluginEntry);
    assertEquals(config.custom?.pluginSourcePolicy, pluginSourcePolicy);
  });
}
