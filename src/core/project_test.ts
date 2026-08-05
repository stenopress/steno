import { assertEquals, assertStringIncludes } from "@std/assert";
import { join } from "@std/path";
import { buildSite } from "./build/build.ts";
import { bundledThemeLocalPath, loadTheme } from "./steno_theme.ts";
import { resolveProject } from "./project.ts";

export function registerProjectTests(): void {
  Deno.test("themes: remote bundled-theme candidates use JSR fallback", () => {
    assertEquals(
      bundledThemeLocalPath(
        new URL(
          "https://jsr.io/@steno/steno/0.11.1/packages/theme-docs-minimal",
        ),
      ),
      undefined,
    );
  });

  Deno.test({
    name: "themes: bundled marketing theme exposes landing-page defaults",
    permissions: { read: true },
    fn: async () => {
      const theme = await loadTheme({
        title: "Launch",
        description: "",
        author: "",
        custom: { theme: "jsr:@steno/theme-marketing-minimal" },
      });

      assertEquals(theme?.name, "marketing-minimal");
      if (!theme) throw new Error("Marketing theme failed to load.");
      assertEquals(theme?.config.primaryLabel, "Get started");
      const html = await theme?.renderLayout("layout", "<h2>Details</h2>", {
        title: "Launch",
        site: { title: "Launch", navigation: [] },
        theme: { name: theme.name, version: theme.version, ...theme.config },
      });
      assertStringIncludes(html ?? "", 'class="hero"');
      assertStringIncludes(html ?? "", "Details");
    },
  });

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
      assertEquals(project.config.theme, "jsr:@steno/theme-minimal");
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
    name:
      "zero-config: single-file mode nested in a subdirectory builds to the site root",
    permissions: { read: true, write: true },
    fn: async () => {
      // The README's own quickstart tells users to create "content/index.md"
      // at the project root. contentDir is reassigned to the file's parent
      // directory ("content/") in single-file mode, one level deeper than
      // the scan root - relPath must be recomputed against that, or the
      // extra directory segment leaks into the output path.
      const tempDir = Deno.makeTempDirSync();
      const configPath = join(tempDir, ".steno", "config.yml");
      const sourcePath = join(tempDir, "content", "index.md");

      Deno.mkdirSync(join(tempDir, "content"), { recursive: true });
      Deno.writeTextFileSync(
        sourcePath,
        `---\ntitle: "Nested"\n---\n# Nested\n`,
      );

      const project = await resolveProject(configPath, tempDir);
      assertEquals(project.mode, "single-file");
      assertEquals(project.config.contentDir, join(tempDir, "content"));
      assertEquals(project.pages?.[0].relPath, "index.md");

      await buildSite({
        config: project.config,
        plugins: [],
        hooks: {},
        pages: project.pages,
      });

      const html = Deno.readTextFileSync(join(tempDir, "dist", "index.html"));
      assertStringIncludes(html, "<h1>Nested</h1>");
      assertEquals(
        (() => {
          try {
            Deno.statSync(join(tempDir, "dist", "content", "index.html"));
            return true;
          } catch {
            return false;
          }
        })(),
        false,
      );

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
        project.config.theme,
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
