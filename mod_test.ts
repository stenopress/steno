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
}
