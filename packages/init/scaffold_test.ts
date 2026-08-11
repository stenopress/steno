import { assertEquals, assertStringIncludes, assertThrows } from "@std/assert";
import { join } from "@std/path";
import { OnboardingError } from "./src/onboarding.ts";
import { scaffoldTheme } from "./src/scaffold_theme.ts";
import { scaffoldPlugin } from "./src/scaffold_plugin.ts";

function readFile(dir: string, ...segments: string[]): string {
  return Deno.readTextFileSync(join(dir, ...segments));
}

function fileExists(dir: string, ...segments: string[]): boolean {
  try {
    Deno.statSync(join(dir, ...segments));
    return true;
  } catch {
    return false;
  }
}

Deno.test("scaffoldTheme: writes a working mod.ts/layout/style/README", async () => {
  const dir = await Deno.makeTempDir({ prefix: "steno_init_theme_test_" });
  scaffoldTheme("My Cool Theme", { targetDir: dir });

  assertEquals(fileExists(dir, "mod.ts"), true);
  assertEquals(fileExists(dir, "deno.json"), true);
  assertEquals(fileExists(dir, "layouts", "layout.tau"), true);
  assertEquals(fileExists(dir, "assets", "style.css"), true);
  assertEquals(fileExists(dir, "README.md"), true);

  const mod = readFile(dir, "mod.ts");
  assertStringIncludes(mod, `name: "my-cool-theme"`);
  assertStringIncludes(mod, "layouts: { layout }");

  const readme = readFile(dir, "README.md");
  assertStringIncludes(readme, "theme: ./my-cool-theme");
});

Deno.test("scaffoldTheme: slugifies the name into a stable identifier", async () => {
  const dir = await Deno.makeTempDir({ prefix: "steno_init_theme_test_" });
  scaffoldTheme("  Weird!! Name__here  ", { targetDir: dir });
  const mod = readFile(dir, "mod.ts");
  assertStringIncludes(mod, `name: "weird-name-here"`);
});

Deno.test("scaffoldTheme: refuses to overwrite existing files without --force", async () => {
  const dir = await Deno.makeTempDir({ prefix: "steno_init_theme_test_" });
  scaffoldTheme("dup", { targetDir: dir });
  assertThrows(() => scaffoldTheme("dup", { targetDir: dir }), OnboardingError);
});

Deno.test("scaffoldTheme: force overwrites existing files", async () => {
  const dir = await Deno.makeTempDir({ prefix: "steno_init_theme_test_" });
  scaffoldTheme("dup", { targetDir: dir });
  scaffoldTheme("dup", { targetDir: dir, force: true }); // should not throw
  assertEquals(fileExists(dir, "mod.ts"), true);
});

Deno.test("scaffoldPlugin: writes a working mod.ts/test/README", async () => {
  const dir = await Deno.makeTempDir({ prefix: "steno_init_plugin_test_" });
  scaffoldPlugin("My Cool Plugin", { targetDir: dir });

  assertEquals(fileExists(dir, "mod.ts"), true);
  assertEquals(fileExists(dir, "mod_test.ts"), true);
  assertEquals(fileExists(dir, "deno.json"), true);
  assertEquals(fileExists(dir, "README.md"), true);

  const mod = readFile(dir, "mod.ts");
  assertStringIncludes(mod, `name: "my-cool-plugin"`);
  assertStringIncludes(mod, "export default function myCoolPlugin(");
  assertStringIncludes(mod, "export interface MyCoolPluginOptions");

  const readme = readFile(dir, "README.md");
  assertStringIncludes(readme, "pluginSourcePolicy");
  assertStringIncludes(readme, "allowLocal: true");
  assertStringIncludes(readme, `file:///absolute/path/to/my-cool-plugin/mod.ts`);
});

Deno.test("scaffoldPlugin: the generated plugin passes its own generated test", async () => {
  const dir = await Deno.makeTempDir({ prefix: "steno_init_plugin_test_" });
  scaffoldPlugin("smoke", { targetDir: dir });

  const command = new Deno.Command(Deno.execPath(), {
    args: ["test", "-A", "mod_test.ts"],
    cwd: dir,
    stdout: "piped",
    stderr: "piped",
  });
  const { code, stderr } = await command.output();
  if (code !== 0) {
    throw new Error(`generated plugin test failed:\n${new TextDecoder().decode(stderr)}`);
  }
  assertEquals(code, 0);
});

Deno.test("scaffoldPlugin: refuses to overwrite existing files without --force", async () => {
  const dir = await Deno.makeTempDir({ prefix: "steno_init_plugin_test_" });
  scaffoldPlugin("dup", { targetDir: dir });
  assertThrows(() => scaffoldPlugin("dup", { targetDir: dir }), OnboardingError);
});
