import { assertEquals } from "@std/assert";
import { join, toFileUrl } from "@std/path";

/**
 * Regression test for a self-referential module deadlock: `mod.ts` is both
 * the CLI entrypoint (`if (import.meta.main) await runStenoCli(...)`) and
 * the library's public API. Previously the top-level `await` there kept
 * `mod.ts`'s own module evaluation pending for the whole build; a theme
 * loaded mid-build that imports a *value* export (`Theme`, `mergeTheme`) -
 * not just a type - from this same module would then dynamically re-import
 * a module that can never finish evaluating until that very `await`
 * resolves, deadlocking the process indefinitely. This spawns a real
 * subprocess against a theme that imports `mergeTheme` and asserts the
 * build actually completes rather than hanging.
 */
export function registerModTests(): void {
  Deno.test({
    name: "mod: a theme importing a value export from mod.ts does not deadlock the build",
    permissions: { read: true, write: true, run: true, env: true },
    fn: async () => {
      const tempDir = await Deno.makeTempDir();
      try {
        const contentDir = join(tempDir, "content");
        const stenoDir = join(contentDir, ".steno");
        const themeDir = join(tempDir, "theme");
        await Deno.mkdir(stenoDir, { recursive: true });
        await Deno.mkdir(themeDir, { recursive: true });

        await Deno.writeTextFile(join(contentDir, "index.md"), "# Hello");
        await Deno.writeTextFile(
          join(stenoDir, "config.yml"),
          `title: Test\ndescription: d\nauthor: a\ntheme: "./theme/mod.ts"\n`,
        );
        await Deno.writeTextFile(
          join(themeDir, "mod.ts"),
          `import { mergeTheme, type StenoTheme } from "@steno/steno";
const base: StenoTheme = {
  name: "base",
  version: "1.0.0",
  layouts: { layout: "<html>{@html content}</html>" },
};
const theme: StenoTheme = mergeTheme(base, { name: "test-theme" });
export default theme;
`,
        );
        await Deno.writeTextFile(
          join(tempDir, "deno.json"),
          JSON.stringify({
            imports: {
              "@steno/steno": toFileUrl(join(Deno.cwd(), "mod.ts")).href,
            },
          }),
        );

        const command = new Deno.Command(Deno.execPath(), {
          args: ["run", "-A", join(Deno.cwd(), "mod.ts"), "build"],
          cwd: tempDir,
          stdout: "piped",
          stderr: "piped",
        });
        const child = command.spawn();

        const timeoutMs = 15_000;
        const result = await Promise.race([
          child.output(),
          new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), timeoutMs)),
        ]);

        if (result === "timeout") {
          child.kill();
          await child.output().catch(() => {});
          throw new Error(
            `Build did not complete within ${timeoutMs}ms - likely deadlocked.`,
          );
        }

        assertEquals(result.success, true);
        const html = await Deno.readTextFile(
          join(tempDir, "dist", "index.html"),
        );
        assertEquals(html.includes("<h1>Hello</h1>"), true);
      } finally {
        await Deno.remove(tempDir, { recursive: true });
      }
    },
  });

  Deno.test({
    name: "mod: --version prints the package version and exits 0",
    permissions: { read: true, run: true },
    fn: async () => {
      const command = new Deno.Command(Deno.execPath(), {
        args: ["run", "-A", join(Deno.cwd(), "mod.ts"), "--version"],
        stdout: "piped",
        stderr: "piped",
      });
      const result = await command.output();
      assertEquals(result.success, true);
      const stdout = new TextDecoder().decode(result.stdout);
      assertEquals(/^steno \d+\.\d+\.\d+/.test(stdout.trim()), true);
    },
  });

  Deno.test({
    name: "mod: `doctor` exits non-zero when the project has errors",
    permissions: { read: true, write: true, run: true },
    fn: async () => {
      const tempDir = await Deno.makeTempDir();
      try {
        const configPath = join(tempDir, "config.yml");
        await Deno.writeTextFile(
          configPath,
          `title: Test\ndescription: d\nauthor: a\ncontentDir: "${join(tempDir, "content")}"\n`,
        );

        const command = new Deno.Command(Deno.execPath(), {
          args: ["run", "-A", join(Deno.cwd(), "mod.ts"), "doctor", "--config", configPath],
          stdout: "piped",
          stderr: "piped",
        });
        const result = await command.output();
        assertEquals(result.success, false);
        assertEquals(result.code, 1);
      } finally {
        await Deno.remove(tempDir, { recursive: true });
      }
    },
  });

  Deno.test({
    name: "mod: `doctor` exits 0 for a clean project",
    permissions: { read: true, write: true, run: true },
    fn: async () => {
      const tempDir = await Deno.makeTempDir();
      try {
        const contentDir = join(tempDir, "content");
        await Deno.mkdir(contentDir, { recursive: true });
        await Deno.writeTextFile(join(contentDir, "index.md"), "# Home");
        const configPath = join(tempDir, "config.yml");
        await Deno.writeTextFile(
          configPath,
          `title: Test\ndescription: d\nauthor: a\ncontentDir: "${contentDir}"\n`,
        );

        const command = new Deno.Command(Deno.execPath(), {
          args: ["run", "-A", join(Deno.cwd(), "mod.ts"), "doctor", "--config", configPath],
          stdout: "piped",
          stderr: "piped",
        });
        const result = await command.output();
        assertEquals(result.success, true);
      } finally {
        await Deno.remove(tempDir, { recursive: true });
      }
    },
  });
}
