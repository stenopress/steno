import { assertEquals, assertStringIncludes } from "@std/assert";
import { join } from "@std/path";
import { buildSite } from "./build/build.ts";
import { loadTheme } from "./steno_theme.ts";
import { resolveProject } from "./project.ts";

export function registerProjectTests(): void {
  Deno.test({
    name: "zero-config: single-file mode uses reserved steno namespace",
    permissions: { read: true, write: true },
    fn: async () => {
      const tempDir = Deno.makeTempDirSync();
      const configPath = join(tempDir, ".steno", "config.yml");
      const sourcePath = join(tempDir, "index.md");

      Deno.writeTextFileSync(
        sourcePath,
        `---
steno:
  theme: "jsr:@steno/theme-minimal"
---
# Welcome

Plain content.
`,
      );

      const project = await resolveProject(configPath, tempDir);
      assertEquals(project.mode, "single-file");
      assertEquals(project.config.title, "Welcome");
      assertEquals(project.config.custom?.theme, "jsr:@steno/theme-minimal");
      assertEquals(project.pages?.[0].frontmatter.steno, {
        theme: "jsr:@steno/theme-minimal",
      });

      const theme = await loadTheme(project.config);
      assertEquals(theme?.name, "minimal");

      await buildSite({
        config: project.config,
        theme,
        plugins: [],
        hooks: {},
        pages: project.pages,
      });

      const html = Deno.readTextFileSync(join(tempDir, "dist", "index.html"));
      assertStringIncludes(html, "<h1>Welcome</h1>");
      assertStringIncludes(html, "Plain content.");

      Deno.removeSync(tempDir, { recursive: true });
    },
  });

  Deno.test({
    name: "zero-config: docs mode builds navigation from folders",
    permissions: { read: true, write: true },
    fn: async () => {
      const tempDir = Deno.makeTempDirSync();
      const docsDir = join(tempDir, "docs");
      const configPath = join(tempDir, ".steno", "config.yml");

      Deno.mkdirSync(join(docsDir, "guide"), { recursive: true });
      Deno.writeTextFileSync(
        join(docsDir, "index.md"),
        `# Docs Home

Intro.
`,
      );
      Deno.writeTextFileSync(
        join(docsDir, "guide", "setup.md"),
        `# Setup

Steps.
`,
      );

      const project = await resolveProject(configPath, tempDir);
      assertEquals(project.mode, "docs");
      assertEquals(
        project.config.custom?.theme,
        "jsr:@steno/theme-docs-minimal",
      );
      assertEquals(project.config.navigation?.[0].title, "Docs Home");
      assertEquals(project.config.navigation?.[0].children?.[0].title, "Guide");
      assertEquals(
        project.config.navigation?.[0].children?.[0].children?.[0].title,
        "Setup",
      );

      const theme = await loadTheme(project.config);
      assertEquals(theme?.name, "docs-minimal");

      await buildSite({
        config: project.config,
        theme,
        plugins: [],
        hooks: {},
        pages: project.pages,
      });

      const indexHtml = Deno.readTextFileSync(
        join(tempDir, "dist", "index.html"),
      );
      assertStringIncludes(indexHtml, "Docs Home");
      assertStringIncludes(indexHtml, "Guide");
      assertStringIncludes(indexHtml, "Setup");

      const setupHtml = Deno.readTextFileSync(
        join(tempDir, "dist", "guide", "setup", "index.html"),
      );
      assertStringIncludes(setupHtml, "<h1>Setup</h1>");

      Deno.removeSync(tempDir, { recursive: true });
    },
  });
}
