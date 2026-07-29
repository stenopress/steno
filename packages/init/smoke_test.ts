import { assertEquals, assertStringIncludes } from "@std/assert";
import { join } from "@std/path";
import { runOnboarding, type ThemeChoice } from "./src/onboarding.ts";

const themes: ThemeChoice[] = [
  "minimal",
  "docs-minimal",
  "marketing-minimal",
];

Deno.test({
  name: "generated projects: every official theme builds without edits",
  permissions: { env: true, read: true, run: true, write: true },
  fn: async () => {
    for (const theme of themes) {
      const projectDir = await Deno.makeTempDir({
        prefix: `steno_init_${theme}_`,
      });

      try {
        await runOnboarding(projectDir, {
          title: `${theme} smoke test`,
          description: "Generated-project build verification",
          author: "Steno",
          plugins: [],
          theme,
        });

        const result = await new Deno.Command(Deno.execPath(), {
          args: ["task", "build"],
          cwd: projectDir,
          env: { ...Deno.env.toObject(), NO_COLOR: "1" },
          stdout: "piped",
          stderr: "piped",
        }).output();
        const stdout = new TextDecoder().decode(result.stdout);
        const stderr = new TextDecoder().decode(result.stderr);

        assertEquals(
          result.success,
          true,
          `${theme} generated project failed to build:\n${stdout}${stderr}`,
        );

        const html = await Deno.readTextFile(
          join(projectDir, "dist/index.html"),
        );
        assertStringIncludes(html, `Welcome to ${theme} smoke test`);
        const stylesheet = join(projectDir, "dist/assets/style.css");
        const hasStylesheet = await Deno.stat(stylesheet)
          .then((file) => file.isFile)
          .catch(() => false);
        assertEquals(
          hasStylesheet,
          true,
          `${theme} did not copy its stylesheet:\n${stdout}${stderr}`,
        );
      } finally {
        await Deno.remove(projectDir, { recursive: true });
      }
    }
  },
});
