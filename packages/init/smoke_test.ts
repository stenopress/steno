import { assertEquals, assertStringIncludes } from "@std/assert";
import { fromFileUrl, join, toFileUrl } from "@std/path";

const themes = ["minimal", "docs-minimal", "marketing-minimal", "local"] as const;
const useSourceCandidate = Deno.env.get("STENO_INIT_SMOKE_SOURCE") === "1";

async function copyTheme(source: URL, destination: string): Promise<void> {
  await Deno.mkdir(destination, { recursive: true });
  for await (const entry of Deno.readDir(source)) {
    const sourcePath = new URL(entry.name, source);
    const destinationPath = join(destination, entry.name);
    if (entry.isDirectory) {
      await copyTheme(new URL(`${entry.name}/`, source), destinationPath);
    } else if (entry.isFile) {
      await Deno.copyFile(sourcePath, destinationPath);
    }
  }
}

Deno.test({
  name: "generated projects: CLI scaffolds and actual build tasks work for official and local themes",
  permissions: { env: true, read: true, run: true, write: true },
  fn: async () => {
    for (const theme of themes) {
      const projectDir = await Deno.realPath(
        await Deno.makeTempDir({
          prefix: `steno_init_${theme}_`,
        }),
      );

      try {
        const custom = theme === "docs-minimal";
        if (theme === "local") {
          const starter = await new Deno.Command(Deno.execPath(), {
            args: [
              "run",
              "-A",
              fromFileUrl(new URL("./src/create_theme.ts", import.meta.url)),
              "my-theme",
            ],
            cwd: projectDir,
            stdout: "piped",
            stderr: "piped",
          }).output();
          assertEquals(starter.success, true, new TextDecoder().decode(starter.stderr));
        }
        const scaffold = await new Deno.Command(Deno.execPath(), {
          args: [
            "run",
            "-A",
            fromFileUrl(new URL("./src/create.ts", import.meta.url)),
            "--title",
            `${theme} smoke test`,
            "--description",
            "Generated-project build verification",
            "--author",
            "Steno",
            "--plugins",
            "",
            ...(theme === "local" ? ["--local-theme", "my-theme"] : ["--theme", theme]),
            ...(custom
              ? ["--content-dir", "pages here", "--output-dir", "public", "--no-short-urls"]
              : []),
          ],
          cwd: projectDir,
          stdout: "piped",
          stderr: "piped",
        }).output();
        const decoder = new TextDecoder();
        assertEquals(scaffold.success, true, decoder.decode(scaffold.stderr));

        const configPath = join(
          projectDir,
          custom ? "pages here" : "content",
          ".steno",
          "config.yml",
        );
        if (custom) assertStringIncludes(await Deno.readTextFile(configPath), "shortUrls: false");
        const denoPath = join(projectDir, "deno.json");
        const generated = JSON.parse(await Deno.readTextFile(denoPath));
        assertEquals(generated.imports["@steno/steno"], "jsr:@steno/steno@^0.14.0");
        if (useSourceCandidate) {
          // Substitute candidate dependencies only; keep the generated task and permissions intact.
          const localTheme = join(projectDir, "candidate-theme");
          if (theme !== "local") {
            await copyTheme(new URL(`../theme-${theme}/`, import.meta.url), localTheme);
          }
          const source = JSON.parse(
            await Deno.readTextFile(new URL("../../deno.json", import.meta.url)),
          );
          generated.imports = {
            ...source.imports,
            "@steno/steno": new URL("../../mod.ts", import.meta.url).href,
            ...(theme !== "local"
              ? {
                  [`jsr:@steno/theme-${theme}@^0.14.0`]: toFileUrl(join(localTheme, "mod.ts")).href,
                }
              : {}),
          };
          generated.links = [
            fromFileUrl(new URL("../core", import.meta.url)),
            fromFileUrl(new URL("../../../tau", import.meta.url)),
          ];
          await Deno.writeTextFile(denoPath, JSON.stringify(generated));
        }

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

        const outputDir = custom ? "public" : "dist";
        const html = await Deno.readTextFile(join(projectDir, outputDir, "index.html"));
        assertStringIncludes(html, `Welcome to ${theme} smoke test`);
        // hashAssets defaults to true, so the shipped filename is
        // `style.<hash>.css`, not the literal source name - match by prefix.
        const assetsDir = join(projectDir, outputDir, "assets");
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
