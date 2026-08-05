import { assertEquals, assertStringIncludes, assertThrows } from "@std/assert";
import { join } from "@std/path";
import {
  loadConfig,
  loadPlugins,
  resolveDevPort,
  resolveGlobals,
  resolveShortUrls,
  resolveTheme,
  resolveThemeConfig,
} from "./config.ts";

export function registerConfigTests(): void {
  Deno.test({
    name: "config: loads YAML config",
    permissions: { read: true, write: true },
    fn: () => {
      const tempDir = Deno.makeTempDirSync();
      const configPath = join(tempDir, "config.yml");

      Deno.writeTextFileSync(
        configPath,
        `title: Test Site\ndescription: Test Desc\nauthor: Dev\ncustom:\n  shortUrls: true\n`,
      );

      const config = loadConfig(configPath);
      assertEquals(config.title, "Test Site");
      assertEquals(config.custom?.shortUrls, true);
    },
  });

  Deno.test({
    name: "config: warns about unrecognized top-level keys",
    permissions: { read: true, write: true },
    fn: () => {
      const tempDir = Deno.makeTempDirSync();
      const configPath = join(tempDir, "config.yml");

      Deno.writeTextFileSync(
        configPath,
        `title: Test Site\ndescription: Test Desc\nauthor: Dev\ncolllections:\n  posts: {}\n`,
      );

      const warnings: string[] = [];
      const originalWarn = console.warn;
      console.warn = (...args) => warnings.push(args.join(" "));
      try {
        loadConfig(configPath);
      } finally {
        console.warn = originalWarn;
      }

      assertEquals(warnings.length, 1);
      assertStringIncludes(warnings[0], "colllections");
    },
  });

  Deno.test({
    name: "config: does not warn for known or custom keys",
    permissions: { read: true, write: true },
    fn: () => {
      const tempDir = Deno.makeTempDirSync();
      const configPath = join(tempDir, "config.yml");

      Deno.writeTextFileSync(
        configPath,
        `title: Test Site\ndescription: Test Desc\nauthor: Dev\ncustom:\n  anything: true\n`,
      );

      const warnings: string[] = [];
      const originalWarn = console.warn;
      console.warn = (...args) => warnings.push(args.join(" "));
      try {
        loadConfig(configPath);
      } finally {
        console.warn = originalWarn;
      }

      assertEquals(warnings.length, 0);
    },
  });

  Deno.test({
    name: "config: loads TOML config",
    permissions: { read: true, write: true },
    fn: () => {
      const tempDir = Deno.makeTempDirSync();
      const configPath = join(tempDir, "config.toml");

      Deno.writeTextFileSync(
        configPath,
        `title = "Toml Site"\ndescription = "Desc"\nauthor = "Dev"\n`,
      );

      const config = loadConfig(configPath);
      assertEquals(config.title, "Toml Site");
      assertEquals(config.author, "Dev");
    },
  });

  Deno.test({
    name: "config: throws on unsupported extension",
    permissions: { read: true, write: true },
    fn: () => {
      const tempDir = Deno.makeTempDirSync();
      const configPath = join(tempDir, "config.json");
      Deno.writeTextFileSync(configPath, `{}`);

      assertThrows(
        () => loadConfig(configPath),
        Error,
        "Unsupported config file format",
      );
    },
  });

  for (
    const [fileName, contents] of [
      ["config.yml", "title: [unterminated"],
      ["config.toml", 'title = "unterminated'],
    ] as const
  ) {
    Deno.test({
      name: `config: reports the path and suggestion for malformed ${fileName}`,
      permissions: { read: true, write: true },
      fn: () => {
        const configPath = join(Deno.makeTempDirSync(), fileName);
        Deno.writeTextFileSync(configPath, contents);

        const error = assertThrows(() => loadConfig(configPath), Error);
        assertEquals(error.message.includes(configPath), true);
        assertEquals(error.message.includes("Check the file syntax"), true);
      },
    });
  }

  Deno.test({
    name: "config: loadPlugins returns [] when plugins field is absent",
    fn: async () => {
      const result = await loadPlugins({
        title: "",
        description: "",
        author: "",
      });
      assertEquals(result, []);
    },
  });

  Deno.test({
    name: "config: loadPlugins returns [] when plugins array is empty",
    fn: async () => {
      const result = await loadPlugins({
        title: "",
        description: "",
        author: "",
        plugins: [],
      });
      assertEquals(result, []);
    },
  });

  const base = { title: "", description: "", author: "" };

  Deno.test({
    name: "config: resolveTheme prefers top-level over custom.theme",
    fn: () => {
      assertEquals(
        resolveTheme({
          ...base,
          theme: "./top",
          custom: { theme: "./nested" },
        }),
        "./top",
      );
      assertEquals(
        resolveTheme({ ...base, custom: { theme: "./nested" } }),
        "./nested",
      );
      assertEquals(resolveTheme(base), undefined);
    },
  });

  Deno.test({
    name:
      "config: resolveThemeConfig prefers top-level over custom.themeConfig",
    fn: () => {
      assertEquals(
        resolveThemeConfig({
          ...base,
          themeConfig: { a: 1 },
          custom: { themeConfig: { a: 2 } },
        }),
        { a: 1 },
      );
      assertEquals(
        resolveThemeConfig({ ...base, custom: { themeConfig: { a: 2 } } }),
        { a: 2 },
      );
    },
  });

  Deno.test({
    name: "config: resolveShortUrls prefers top-level, defaults to false",
    fn: () => {
      assertEquals(
        resolveShortUrls({
          ...base,
          shortUrls: true,
          custom: { shortUrls: false },
        }),
        true,
      );
      assertEquals(
        resolveShortUrls({ ...base, custom: { shortUrls: true } }),
        true,
      );
      assertEquals(resolveShortUrls(base), false);
    },
  });

  Deno.test({
    name: "config: resolveDevPort prefers top-level, defaults to 5735",
    fn: () => {
      assertEquals(
        resolveDevPort({ ...base, devPort: 4000, custom: { devPort: 5000 } }),
        4000,
      );
      assertEquals(
        resolveDevPort({ ...base, custom: { devPort: 5000 } }),
        5000,
      );
      assertEquals(resolveDevPort(base), 5735);
    },
  });

  Deno.test({
    name: "config: resolveGlobals prefers top-level over custom.globals",
    fn: () => {
      assertEquals(
        resolveGlobals({
          ...base,
          globals: { a: 1 },
          custom: { globals: { a: 2 } },
        }),
        { a: 1 },
      );
      assertEquals(
        resolveGlobals({ ...base, custom: { globals: { a: 2 } } }),
        { a: 2 },
      );
      assertEquals(resolveGlobals(base), undefined);
    },
  });
}
