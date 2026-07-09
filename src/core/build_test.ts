import {
  assertEquals,
  assertRejects,
  assertStringIncludes,
  assertThrows,
} from "@std/assert";
import { join } from "@std/path";
import { Steno } from "../../mod.ts";

export function registerBuildTests(): void {
  Deno.test({
    name: "build: end-to-end pipeline build",
    permissions: { read: true, write: true, net: true },
    fn: async () => {
      const tempDir = Deno.makeTempDirSync();

      const contentDir = join(tempDir, "content");
      const outputDir = join(tempDir, "dist");
      const themeDir = join(tempDir, "theme");

      Deno.mkdirSync(contentDir, { recursive: true });
      Deno.mkdirSync(outputDir, { recursive: true });
      Deno.mkdirSync(themeDir, { recursive: true });
      Deno.mkdirSync(join(themeDir, "layouts"), { recursive: true });
      Deno.mkdirSync(join(themeDir, "components"), { recursive: true });
      Deno.mkdirSync(join(themeDir, "assets"), { recursive: true });

      // Create Config
      const configPath = join(contentDir, ".steno", "config.yml");
      Deno.mkdirSync(join(contentDir, ".steno"), { recursive: true });
      Deno.writeTextFileSync(
        configPath,
        `
title: "My Blog"
description: "E2E testing"
author: "Tester"
contentDir: "${contentDir}"
output: "${outputDir}"
custom:
  shortUrls: true
  theme: "${themeDir}"
  themeConfig:
    brand: "Steno Test"
`,
      );

      // Create theme.yaml
      Deno.writeTextFileSync(
        join(themeDir, "theme.yaml"),
        `
name: "e2e-theme"
version: "1.0.0"
components:
  header: "components/header.scr"
`,
      );

      // Create layout
      Deno.writeTextFileSync(
        join(themeDir, "layouts", "layout.scr"),
        `<!DOCTYPE html><html><body><Header />{@html content}</body></html>`,
      );

      // Create component
      Deno.writeTextFileSync(
        join(themeDir, "components", "header.scr"),
        `<header>{ theme.brand } - { site.title }</header>`,
      );

      // Create asset
      Deno.writeTextFileSync(
        join(themeDir, "assets", "global.css"),
        `body { margin: 0; }`,
      );

      // Create index.md
      Deno.writeTextFileSync(
        join(contentDir, "index.md"),
        `---
title: "Home"
layout: "layout"
---
# Hello E2E
`,
      );

      // Create a sub-page
      Deno.mkdirSync(join(contentDir, "blog"), { recursive: true });
      Deno.writeTextFileSync(
        join(contentDir, "blog", "first-post.md"),
        `---
title: "First Post"
layout: "layout"
---
Welcome to my blog.
`,
      );

      // Build
      const steno = new Steno(configPath, false);
      await steno.build();

      // Assertions
      const indexHtml = Deno.readTextFileSync(join(outputDir, "index.html"));
      assertStringIncludes(indexHtml, "<header>Steno Test - My Blog</header>");
      assertStringIncludes(indexHtml, "<h1>Hello E2E</h1>");

      // Short URLs assertion (blog/first-post.md -> blog/first-post/index.html)
      const postHtml = Deno.readTextFileSync(
        join(outputDir, "blog", "first-post", "index.html"),
      );
      assertStringIncludes(postHtml, "Welcome to my blog.");

      // Asset assertion
      const css = Deno.readTextFileSync(
        join(outputDir, "assets", "global.css"),
      );
      assertEquals(css, "body { margin: 0; }");

      // Clean up
      Deno.removeSync(tempDir, { recursive: true });
    },
  });

  Deno.test({
    name: "build: reports syntax errors with file path and line/col numbers",
    permissions: { read: true, write: true },
    fn: async () => {
      const tempDir = Deno.makeTempDirSync();
      const contentDir = join(tempDir, "content");
      const outputDir = join(tempDir, "dist");
      const themeDir = join(tempDir, "theme");

      Deno.mkdirSync(contentDir, { recursive: true });
      Deno.mkdirSync(outputDir, { recursive: true });
      Deno.mkdirSync(themeDir, { recursive: true });
      Deno.mkdirSync(join(themeDir, "layouts"), { recursive: true });

      // Create config
      const configPath = join(contentDir, ".steno", "config.yml");
      Deno.mkdirSync(join(contentDir, ".steno"), { recursive: true });
      Deno.writeTextFileSync(
        configPath,
        `
title: "Error Test"
contentDir: "${contentDir}"
output: "${outputDir}"
custom:
  theme: "${themeDir}"
`,
      );

      // Create theme.yaml
      Deno.writeTextFileSync(
        join(themeDir, "theme.yaml"),
        `name: "error-theme"\nversion: "1.0.0"\n`,
      );

      // Create malformed layout (missing {/each})
      const layoutPath = join(themeDir, "layouts", "layout.scr");
      Deno.writeTextFileSync(
        layoutPath,
        `<html>
<body>
{#each items as item}
  <p>{item}</p>
<!-- Missing closing each tag -->
</body>
</html>`,
      );

      // Create markdown file
      Deno.writeTextFileSync(
        join(contentDir, "index.md"),
        `---
title: "Error page"
layout: "layout"
---
Content
`,
      );

      const steno = new Steno(configPath, false);
      const err = await assertRejects(() => steno.build());
      assertStringIncludes((err as Error).message, layoutPath);
      // Expected layoutPath:7:8: Expected "{/each}"
      assertStringIncludes((err as Error).message, "7:8");

      // Clean up
      Deno.removeSync(tempDir, { recursive: true });
    },
  });

  Deno.test({
    name: "build: reports frontmatter errors with file path",
    permissions: { read: true, write: true },
    fn: async () => {
      const tempDir = Deno.makeTempDirSync();
      const contentDir = join(tempDir, "content");
      const outputDir = join(tempDir, "dist");

      Deno.mkdirSync(contentDir, { recursive: true });
      Deno.mkdirSync(outputDir, { recursive: true });

      // Create config
      const configPath = join(contentDir, ".steno", "config.yml");
      Deno.mkdirSync(join(contentDir, ".steno"), { recursive: true });
      Deno.writeTextFileSync(
        configPath,
        `
title: "Frontmatter Error Test"
contentDir: "${contentDir}"
output: "${outputDir}"
`,
      );

      // Create malformed markdown file (broken YAML syntax)
      const mdPath = join(contentDir, "index.md");
      Deno.writeTextFileSync(
        mdPath,
        `---
title: "Error page
broken_yaml: : :
---
Content
`,
      );

      const steno = new Steno(configPath, false);
      const err = await assertRejects(() => steno.build());
      assertStringIncludes((err as Error).message, mdPath);

      // Clean up
      Deno.removeSync(tempDir, { recursive: true });
    },
  });

  Deno.test({
    name: "build: plugin lifecycle hooks are called in order",
    permissions: { read: true, write: true },
    fn: async () => {
      const tempDir = Deno.makeTempDirSync();
      const contentDir = join(tempDir, "content");
      const outputDir = join(tempDir, "dist");

      Deno.mkdirSync(join(contentDir, ".steno"), { recursive: true });
      Deno.writeTextFileSync(
        join(contentDir, ".steno", "config.yml"),
        `title: "Test"\ndescription: ""\nauthor: ""\ncontentDir: "${contentDir}"\noutput: "${outputDir}"\n`,
      );
      Deno.writeTextFileSync(
        join(contentDir, "index.md"),
        `---\ntitle: "Home"\n---\nHello.`,
      );

      const order: string[] = [];
      const steno = new Steno(join(contentDir, ".steno", "config.yml"), false, {
        beforeBuild: () => {
          order.push("hook:beforeBuild");
        },
        afterPage: () => {
          order.push("hook:afterPage");
        },
        afterBuild: () => {
          order.push("hook:afterBuild");
        },
      });

      await (steno as any).themeLoadingPromise;
      await (steno as any).pluginsLoadingPromise;

      (steno as any).plugins = [{
        name: "test",
        beforeBuild: () => {
          order.push("plugin:beforeBuild");
        },
        afterPage: () => {
          order.push("plugin:afterPage");
        },
        afterBuild: () => {
          order.push("plugin:afterBuild");
        },
      }];

      await steno.build();

      assertEquals(order, [
        "plugin:beforeBuild",
        "hook:beforeBuild",
        "hook:afterPage",
        "plugin:afterPage",
        "plugin:afterBuild",
        "hook:afterBuild",
      ]);

      Deno.removeSync(tempDir, { recursive: true });
    },
  });

  Deno.test({
    name: "build: incremental rebuilds skip unchanged pages",
    permissions: { read: true, write: true },
    fn: async () => {
      const tempDir = Deno.makeTempDirSync();
      const contentDir = join(tempDir, "content");
      const outputDir = join(tempDir, "dist");

      Deno.mkdirSync(join(contentDir, ".steno"), { recursive: true });
      Deno.writeTextFileSync(
        join(contentDir, ".steno", "config.yml"),
        `title: "Incremental"\ndescription: ""\nauthor: ""\ncontentDir: "${contentDir}"\noutput: "${outputDir}"\n`,
      );
      Deno.writeTextFileSync(
        join(contentDir, "index.md"),
        `---\ntitle: "Home"\n---\nHome.`,
      );
      Deno.writeTextFileSync(
        join(contentDir, "about.md"),
        `---\ntitle: "About"\n---\nAbout.`,
      );

      const rendered: string[] = [];
      const steno = new Steno(join(contentDir, ".steno", "config.yml"), false, {
        afterPage: ({ path }) => {
          rendered.push(path);
        },
      });

      await steno.build();
      assertEquals(rendered.sort(), [
        join(outputDir, "about.html"),
        join(outputDir, "index.html"),
      ]);

      rendered.length = 0;
      Deno.writeTextFileSync(
        join(contentDir, "about.md"),
        `---\ntitle: "About"\n---\nUpdated about page.`,
      );

      await steno.build();
      assertEquals(rendered, [join(outputDir, "about.html")]);

      rendered.length = 0;
      Deno.removeSync(join(contentDir, "index.md"));

      await steno.build();
      assertEquals(rendered, []);
      assertThrows(
        () => Deno.statSync(join(outputDir, "index.html")),
        Deno.errors.NotFound,
      );

      Deno.removeSync(tempDir, { recursive: true });
    },
  });

  Deno.test({
    name: "build: persistent cache skips unchanged pages across processes",
    permissions: { read: true, write: true },
    fn: async () => {
      const tempDir = Deno.makeTempDirSync();
      const contentDir = join(tempDir, "content");
      const outputDir = join(tempDir, "dist");
      const configPath = join(contentDir, ".steno", "config.yml");
      const cachePath = join(contentDir, ".steno", "build-cache.json");

      Deno.mkdirSync(join(contentDir, ".steno"), { recursive: true });
      Deno.writeTextFileSync(
        configPath,
        `title: "Persistent Incremental"\ndescription: ""\nauthor: ""\ncontentDir: "${contentDir}"\noutput: "${outputDir}"\n`,
      );
      Deno.writeTextFileSync(
        join(contentDir, "index.md"),
        `---\ntitle: "Home"\n---\nHome.`,
      );
      Deno.writeTextFileSync(
        join(contentDir, "about.md"),
        `---\ntitle: "About"\n---\nAbout.`,
      );

      await new Steno(configPath, false).build();
      const cacheRaw = Deno.readTextFileSync(cachePath);
      assertStringIncludes(cacheRaw, "\"signature\"");

      Deno.writeTextFileSync(
        join(contentDir, "about.md"),
        `---\ntitle: "About"\n---\nUpdated from new process.`,
      );

      const secondRendered: string[] = [];
      await new Steno(configPath, false, {
        afterPage: ({ path }) => {
          secondRendered.push(path);
        },
      }).build();
      assertEquals(secondRendered, [join(outputDir, "about.html")]);

      const thirdRendered: string[] = [];
      await new Steno(configPath, false, {
        afterPage: ({ path }) => {
          thirdRendered.push(path);
        },
      }).build();
      assertEquals(thirdRendered, []);

      Deno.removeSync(join(contentDir, "about.md"));
      await new Steno(configPath, false).build();
      assertThrows(
        () => Deno.statSync(join(outputDir, "about.html")),
        Deno.errors.NotFound,
      );

      Deno.removeSync(tempDir, { recursive: true });
    },
  });

  Deno.test({
    name:
      "build: persistent cache re-renders pages when theme layout templates change",
    permissions: { read: true, write: true },
    fn: async () => {
      const tempDir = Deno.makeTempDirSync();
      const contentDir = join(tempDir, "content");
      const outputDir = join(tempDir, "dist");
      const themeDir = join(tempDir, "theme");
      const configPath = join(contentDir, ".steno", "config.yml");

      Deno.mkdirSync(join(contentDir, ".steno"), { recursive: true });
      Deno.mkdirSync(join(themeDir, "layouts"), { recursive: true });

      Deno.writeTextFileSync(
        configPath,
        `title: "Layout Signature"\ndescription: ""\nauthor: ""\ncontentDir: "${contentDir}"\noutput: "${outputDir}"\ncustom:\n  theme: "${themeDir}"\n`,
      );
      Deno.writeTextFileSync(
        join(themeDir, "theme.yaml"),
        `name: "signature-theme"\nversion: "1.0.0"\n`,
      );
      Deno.writeTextFileSync(
        join(themeDir, "layouts", "layout.scr"),
        `<html><body><p>layout-v1</p>{@html content}</body></html>`,
      );
      Deno.writeTextFileSync(
        join(contentDir, "index.md"),
        `---\ntitle: "Home"\nlayout: "layout"\n---\nHome.`,
      );

      await new Steno(configPath, false).build();
      let html = Deno.readTextFileSync(join(outputDir, "index.html"));
      assertStringIncludes(html, "layout-v1");

      Deno.writeTextFileSync(
        join(themeDir, "layouts", "layout.scr"),
        `<html><body><p>layout-v2</p>{@html content}</body></html>`,
      );

      const rendered: string[] = [];
      await new Steno(configPath, false, {
        afterPage: ({ path }) => {
          rendered.push(path);
        },
      }).build();

      assertEquals(rendered, [join(outputDir, "index.html")]);
      html = Deno.readTextFileSync(join(outputDir, "index.html"));
      assertStringIncludes(html, "layout-v2");

      Deno.removeSync(tempDir, { recursive: true });
    },
  });

  Deno.test({
    name:
      "build: persistent cache re-renders pages when plugin implementation changes",
    permissions: { read: true, write: true },
    fn: async () => {
      const tempDir = Deno.makeTempDirSync();
      const contentDir = join(tempDir, "content");
      const outputDir = join(tempDir, "dist");
      const configPath = join(contentDir, ".steno", "config.yml");

      Deno.mkdirSync(join(contentDir, ".steno"), { recursive: true });
      Deno.writeTextFileSync(
        configPath,
        `title: "Plugin Signature"\ndescription: ""\nauthor: ""\ncontentDir: "${contentDir}"\noutput: "${outputDir}"\n`,
      );
      Deno.writeTextFileSync(
        join(contentDir, "index.md"),
        `---\ntitle: "Home"\n---\nHome.`,
      );

      const stenoV1 = new Steno(configPath, false);
      await (stenoV1 as any).themeLoadingPromise;
      await (stenoV1 as any).pluginsLoadingPromise;
      (stenoV1 as any).plugins = [{
        name: "signature-plugin",
        transformHtml: (html: string) => `<div>plugin-v1</div>${html}`,
      }];
      await stenoV1.build();
      let html = Deno.readTextFileSync(join(outputDir, "index.html"));
      assertStringIncludes(html, "plugin-v1");

      const rendered: string[] = [];
      const stenoV2 = new Steno(configPath, false, {
        afterPage: ({ path }) => {
          rendered.push(path);
        },
      });
      await (stenoV2 as any).themeLoadingPromise;
      await (stenoV2 as any).pluginsLoadingPromise;
      (stenoV2 as any).plugins = [{
        name: "signature-plugin",
        transformHtml: (html: string) => `<div>plugin-v2</div>${html}`,
      }];
      await stenoV2.build();

      assertEquals(rendered, [join(outputDir, "index.html")]);
      html = Deno.readTextFileSync(join(outputDir, "index.html"));
      assertStringIncludes(html, "plugin-v2");

      Deno.removeSync(tempDir, { recursive: true });
    },
  });

  Deno.test({
    name: "build: theme plugins can be disabled via pluginSecurity config",
    permissions: { read: true, write: true },
    fn: async () => {
      const tempDir = Deno.makeTempDirSync();
      const contentDir = join(tempDir, "content");
      const outputDir = join(tempDir, "dist");
      const themeModulePath = join(tempDir, "theme.ts");
      const configPath = join(contentDir, ".steno", "config.yml");

      Deno.mkdirSync(join(contentDir, ".steno"), { recursive: true });
      Deno.writeTextFileSync(
        themeModulePath,
        `import type { StenoTheme } from "file://${join(Deno.cwd(), "mod.ts")}";
const theme: StenoTheme = {
  name: "module-theme",
  version: "1.0.0",
  layouts: {
    layout: "<html><body>{@html content}</body></html>",
  },
  plugins: [{
    name: "theme-plugin",
    transformHtml: (html) => "<div>theme-plugin</div>" + html,
  }],
};
export default theme;
`,
      );
      Deno.writeTextFileSync(
        join(contentDir, "index.md"),
        `---
title: "Home"
layout: "layout"
---
Hello.
`,
      );

      Deno.writeTextFileSync(
        configPath,
        `title: "Theme Plugin Enabled"
description: ""
author: ""
contentDir: "${contentDir}"
output: "${outputDir}"
custom:
  theme: "${themeModulePath}"
`,
      );
      await new Steno(configPath, false).build();
      let html = Deno.readTextFileSync(join(outputDir, "index.html"));
      assertStringIncludes(html, "theme-plugin");

      Deno.writeTextFileSync(
        configPath,
        `title: "Theme Plugin Disabled"
description: ""
author: ""
contentDir: "${contentDir}"
output: "${outputDir}"
custom:
  theme: "${themeModulePath}"
  pluginSecurity:
    allowThemePlugins: false
`,
      );
      await new Steno(configPath, false).build();
      html = Deno.readTextFileSync(join(outputDir, "index.html"));
      assertEquals(html.includes("theme-plugin"), false);

      Deno.removeSync(tempDir, { recursive: true });
    },
  });
}
