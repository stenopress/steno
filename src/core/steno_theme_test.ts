import { assertEquals, assertNotEquals } from "@std/assert";
import { join } from "@std/path";
import { loadTheme, resolveThemeWatchDir } from "./steno_theme.ts";
import { DiagnosticBag } from "./diagnostics.ts";
import type { SiteConfig } from "../types.ts";

function baseConfig(overrides: Partial<SiteConfig> = {}): SiteConfig {
  return { title: "t", description: "d", author: "a", ...overrides };
}

Deno.test({
  name: "resolveThemeWatchDir: undefined when no theme is configured",
  fn: () => {
    assertEquals(resolveThemeWatchDir(baseConfig()), undefined);
  },
});

Deno.test({
  name: "resolveThemeWatchDir: undefined for a jsr/npm package specifier",
  fn: () => {
    assertEquals(
      resolveThemeWatchDir(baseConfig({ theme: "jsr:@steno/theme-minimal" })),
      undefined,
    );
    assertEquals(
      resolveThemeWatchDir(baseConfig({ theme: "npm:some-theme" })),
      undefined,
    );
  },
});

Deno.test({
  name: "resolveThemeWatchDir: resolves a relative local theme path against cwd",
  fn: () => {
    const dir = resolveThemeWatchDir(baseConfig({ theme: "./my-theme" }));
    assertEquals(dir, join(Deno.cwd(), "my-theme"));
  },
});

Deno.test({
  name: "resolveThemeWatchDir: resolves an absolute local theme path as-is",
  fn: () => {
    const dir = resolveThemeWatchDir(baseConfig({ theme: "/abs/my-theme" }));
    assertEquals(dir, "/abs/my-theme");
  },
});

Deno.test({
  name: "resolveThemeWatchDir: resolves a file:// theme specifier to a plain path",
  permissions: { read: true, write: true },
  fn: () => {
    const tempDir = Deno.makeTempDirSync();
    const dir = resolveThemeWatchDir(
      baseConfig({ theme: `file://${tempDir}` }),
    );
    assertEquals(dir, tempDir);
    Deno.removeSync(tempDir, { recursive: true });
  },
});

Deno.test({
  name: "loadTheme: picks up an edited local mod.ts theme across repeated loads",
  permissions: { read: true, write: true },
  fn: async () => {
    const tempDir = Deno.makeTempDirSync();
    await Deno.writeTextFile(
      join(tempDir, "mod.ts"),
      `export default {
        name: "reload-test-theme",
        version: "v1",
        layouts: { layout: "v1" },
        async renderLayout() { return "v1"; },
      };`,
    );

    const config = baseConfig({ theme: tempDir });

    const first = await loadTheme(config);
    assertEquals(first?.version, "v1");

    await Deno.writeTextFile(
      join(tempDir, "mod.ts"),
      `export default {
        name: "reload-test-theme",
        version: "v2",
        layouts: { layout: "v2" },
        async renderLayout() { return "v2"; },
      };`,
    );

    const second = await loadTheme(config);
    assertEquals(second?.version, "v2");
    assertNotEquals(first?.version, second?.version);

    Deno.removeSync(tempDir, { recursive: true });
  },
});

Deno.test({
  name: "loadTheme: a theme with no layouts fails to load as a theme-load-failed diagnostic",
  permissions: { read: true, write: true },
  fn: async () => {
    const tempDir = Deno.makeTempDirSync();
    await Deno.writeTextFile(
      join(tempDir, "mod.ts"),
      `export default {
        name: "no-layouts-theme",
        version: "1.0.0",
        layouts: {},
      };`,
    );

    const config = baseConfig({ theme: tempDir });
    const diagnostics = new DiagnosticBag();
    const theme = await loadTheme(config, diagnostics);

    assertEquals(theme, undefined);
    assertEquals(diagnostics.errors.length, 1);
    assertEquals(diagnostics.errors[0].code, "theme-load-failed");

    Deno.removeSync(tempDir, { recursive: true });
  },
});
