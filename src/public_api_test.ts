import { assertEquals } from "@std/assert";
import { filters, render, runStenoCli, Steno, Theme } from "../mod.ts";
import type {
  PluginEntry,
  SiteConfig,
  StenoHooks,
  StenoPlugin,
  StenoTheme,
} from "./types.ts";
import type { StenoTheme as LegacyStenoTheme } from "./theme/types.ts";

export function registerPublicApiTests(): void {
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
    const hooks: StenoHooks = {};
    const config: SiteConfig = {
      title: "Demo",
      description: "Demo",
      author: "Author",
      plugins: [pluginEntry],
    };

    assertEquals(legacyTheme.name, theme.name);
    assertEquals(hooks.beforeBuild, undefined);
    assertEquals(plugin.name, "plugin");
    assertEquals(config.plugins?.[0], pluginEntry);
  });
}
