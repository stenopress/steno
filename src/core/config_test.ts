import { assertEquals, assertThrows } from "@std/assert";
import { join } from "@std/path";
import { loadConfig, loadPlugins } from "./config.ts";

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
}
