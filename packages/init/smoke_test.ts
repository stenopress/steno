import { assertEquals, assertStringIncludes } from "@std/assert";
import { fromFileUrl, join } from "@std/path";
import { runOnboarding, type ThemeChoice } from "./src/onboarding.ts";

const themes: ThemeChoice[] = ["minimal", "docs-minimal", "marketing-minimal"];
const useSourceCandidate = Deno.env.get("STENO_INIT_SMOKE_SOURCE") === "1";

function publishedSmokeImports(theme: ThemeChoice): Record<string, string> {
  return {
    "@steno/steno": "jsr:@steno/steno@^0.12.0",
    [`jsr:@steno/theme-${theme}@^0.12.0`]: new URL(`../theme-${theme}/mod.ts`, import.meta.url)
      .href,
  };
}

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

        const configPath = join(projectDir, "content", ".steno", "config.yml");
        const sourceTheme = new URL(`../theme-${theme}/mod.ts`, import.meta.url).href;
        if (useSourceCandidate) {
          const config = await Deno.readTextFile(configPath);
          await Deno.writeTextFile(
            configPath,
            config.replace(/^theme:\s+.*$/m, `theme: ${sourceTheme}`),
          );
        }

        const importMapPath = join(projectDir, "smoke-import-map.json");
        if (!useSourceCandidate) {
          await Deno.writeTextFile(
            importMapPath,
            JSON.stringify({ imports: publishedSmokeImports(theme) }),
          );
        }

        const command = useSourceCandidate
          ? [
              "run",
              `--config=${fromFileUrl(new URL("../../deno.json", import.meta.url))}`,
              "--allow-read",
              "--allow-write=.",
              "--allow-net=jsr.io",
              "--allow-env",
              new URL("../../mod.ts", import.meta.url).href,
              "build",
            ]
          : [
              "run",
              "--minimum-dependency-age=0",
              `--import-map=${importMapPath}`,
              "--allow-read",
              "--allow-write=.",
              "--allow-net=jsr.io",
              "--allow-env",
              "@steno/steno",
              "build",
            ];

        const result = await new Deno.Command(Deno.execPath(), {
          args: command,
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

        const html = await Deno.readTextFile(join(projectDir, "dist/index.html"));
        assertStringIncludes(html, `Welcome to ${theme} smoke test`);
        // hashAssets defaults to true, so the shipped filename is
        // `style.<hash>.css`, not the literal source name - match by prefix.
        const assetsDir = join(projectDir, "dist/assets");
        let hasStylesheet = false;
        try {
          for await (const entry of Deno.readDir(assetsDir)) {
            if (entry.isFile && entry.name.startsWith("style") && entry.name.endsWith(".css")) {
              hasStylesheet = true;
              break;
            }
          }
        } catch {
          hasStylesheet = false;
        }
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
