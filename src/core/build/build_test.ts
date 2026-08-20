import { assertEquals, assertRejects, assertStringIncludes, assertThrows } from "@std/assert";
import { join } from "@std/path";
import { Steno } from "../../../mod.ts";
import type { SiteConfig, StenoPlugin } from "../../types.ts";
import { fileExistsSync as fileExists } from "../../utils/fs.ts";
import { buildSite } from "./build.ts";
import { beginOutputTransaction, rollbackOutputTransaction } from "./output_transaction.ts";

interface TestFixture {
  tempDir: string;
  contentDir: string;
  outputDir: string;
  configPath: string;
  cleanup: () => void;
  writeConfig: (extra?: string) => void;
  writePage: (relPath: string, content: string) => void;
  writeTheme: (
    layouts?: Record<string, string>,
    components?: Record<string, string>,
    assets?: Record<string, string>,
  ) => string;
}

function createFixture(): TestFixture {
  const tempDir = Deno.makeTempDirSync();
  const contentDir = join(tempDir, "content");
  const outputDir = join(tempDir, "dist");
  const configPath = join(contentDir, ".steno", "config.yml");

  Deno.mkdirSync(join(contentDir, ".steno"), { recursive: true });

  return {
    tempDir,
    contentDir,
    outputDir,
    configPath,
    cleanup: () => Deno.removeSync(tempDir, { recursive: true }),
    writeConfig: (extra = "") => {
      Deno.writeTextFileSync(
        configPath,
        `title: "Test"\ndescription: ""\nauthor: ""\ncontentDir: "${contentDir}"\noutput: "${outputDir}"\n${extra}`,
      );
    },
    writePage: (relPath, content) => {
      const fullPath = join(contentDir, relPath);
      Deno.mkdirSync(join(fullPath, ".."), { recursive: true });
      Deno.writeTextFileSync(fullPath, content);
    },
    writeTheme: (
      layouts = { layout: `<html><body>{@html content}</body></html>` },
      components = {},
      assets = {},
    ) => {
      const themeDir = join(tempDir, "theme");
      Deno.mkdirSync(join(themeDir, "layouts"), { recursive: true });
      if (Object.keys(components).length > 0) {
        Deno.mkdirSync(join(themeDir, "components"), { recursive: true });
      }
      if (Object.keys(assets).length > 0) {
        Deno.mkdirSync(join(themeDir, "assets"), { recursive: true });
      }

      const componentEntries = Object.entries(components)
        .map(([name]) => `  ${name}: "components/${name}.tau"`)
        .join("\n");

      Deno.writeTextFileSync(
        join(themeDir, "theme.yaml"),
        `name: "test-theme"\nversion: "1.0.0"\n${
          componentEntries ? `components:\n${componentEntries}\n` : ""
        }`,
      );

      for (const [name, content] of Object.entries(layouts)) {
        Deno.writeTextFileSync(join(themeDir, "layouts", `${name}.tau`), content);
      }
      for (const [name, content] of Object.entries(components)) {
        Deno.writeTextFileSync(join(themeDir, "components", `${name}.tau`), content);
      }
      for (const [name, content] of Object.entries(assets)) {
        Deno.writeTextFileSync(join(themeDir, "assets", name), content);
      }

      return themeDir;
    },
  };
}

async function replacePlugins(steno: Steno, plugins: StenoPlugin[]): Promise<void> {
  const internals = steno as unknown as {
    runtimeLoadingPromise: Promise<unknown>;
    plugins: StenoPlugin[];
  };
  await internals.runtimeLoadingPromise;
  internals.plugins = plugins;
}

// tests

export function registerBuildTests(): void {
  Deno.test({
    name: "build: ready waits for the automatic initialization build",
    permissions: { read: true, write: true },
    fn: async () => {
      const f = createFixture();
      try {
        f.writeConfig();
        f.writePage("index.md", `---\ntitle: "Home"\n---\n# Ready\n`);

        const steno = new Steno(f.configPath, true);
        await steno.ready();

        assertStringIncludes(
          Deno.readTextFileSync(join(f.outputDir, "index.html")),
          "<h1>Ready</h1>",
        );
      } finally {
        f.cleanup();
      }
    },
  });

  Deno.test({
    name: "build: end-to-end pipeline build",
    permissions: { read: true, write: true, net: true },
    fn: async () => {
      const f = createFixture();
      const themeDir = f.writeTheme(
        {
          layout: `<!DOCTYPE html><html><body><Header />{@html content}</body></html>`,
        },
        { header: `<header>{ theme.brand } - { site.title }</header>` },
        { "global.css": `body { margin: 0; }` },
      );

      Deno.writeTextFileSync(
        f.configPath,
        `title: "My Blog"\ndescription: ""\nauthor: ""\ncontentDir: "${f.contentDir}"\noutput: "${f.outputDir}"\ncustom:\n  shortUrls: true\n  theme: "${themeDir}"\n  themeConfig:\n    brand: "Steno Test"\n`,
      );
      f.writePage("index.md", `---\ntitle: "Home"\nlayout: "layout"\n---\n# Hello E2E\n`);
      f.writePage(
        "blog/first-post.md",
        `---\ntitle: "First Post"\nlayout: "layout"\n---\nWelcome to my blog.\n`,
      );

      await new Steno(f.configPath, false).build();

      const indexHtml = Deno.readTextFileSync(join(f.outputDir, "index.html"));
      assertStringIncludes(indexHtml, "<header>Steno Test - My Blog</header>");
      assertStringIncludes(indexHtml, "<h1>Hello E2E</h1>");

      const postHtml = Deno.readTextFileSync(join(f.outputDir, "blog", "first-post", "index.html"));
      assertStringIncludes(postHtml, "Welcome to my blog.");

      const assetFiles = [...Deno.readDirSync(join(f.outputDir, "assets"))].map(
        (entry) => entry.name,
      );
      const cssFileName = assetFiles.find((name) => /^global\.[0-9a-f]{8}\.css$/.test(name));
      if (!cssFileName) {
        throw new Error(`Expected a hashed global.css asset, found: ${assetFiles.join(", ")}`);
      }
      const css = Deno.readTextFileSync(join(f.outputDir, "assets", cssFileName));
      assertEquals(css, "body{margin:0}");

      f.cleanup();
    },
  });

  Deno.test({
    name: "build: hashAssets: false keeps theme asset filenames as-is",
    permissions: { read: true, write: true },
    fn: async () => {
      const f = createFixture();
      const themeDir = f.writeTheme(undefined, undefined, {
        "style.css": "body { color: green; }",
      });
      f.writeConfig(`custom:\n  theme: "${themeDir}"\nhashAssets: false\nminify:\n  css: false\n`);
      f.writePage("index.md", `---\ntitle: "Home"\n---\nHello.`);

      await new Steno(f.configPath, false).build();

      const css = Deno.readTextFileSync(join(f.outputDir, "assets", "style.css"));
      assertEquals(css, "body { color: green; }");

      f.cleanup();
    },
  });

  Deno.test({
    name: "build: minify.css: false keeps theme CSS asset formatting as-is",
    permissions: { read: true, write: true },
    fn: async () => {
      const f = createFixture();
      const themeDir = f.writeTheme(undefined, undefined, {
        "style.css": "body {\n  color: green;\n}",
      });
      f.writeConfig(`custom:\n  theme: "${themeDir}"\nminify:\n  css: false\n`);
      f.writePage("index.md", `---\ntitle: "Home"\n---\nHello.`);

      await new Steno(f.configPath, false).build();

      const [assetsFile] = Array.from(Deno.readDirSync(join(f.outputDir, "assets")))
        .map((entry) => entry.name)
        .filter((name) => name.startsWith("style."));
      const css = Deno.readTextFileSync(join(f.outputDir, "assets", assetsFile));
      assertEquals(css, "body {\n  color: green;\n}");

      f.cleanup();
    },
  });

  Deno.test({
    name: "build: theme CSS assets are minified by default",
    permissions: { read: true, write: true },
    fn: async () => {
      const f = createFixture();
      const themeDir = f.writeTheme(undefined, undefined, {
        "style.css": "body {\n  color: green;\n}",
      });
      f.writeConfig(`custom:\n  theme: "${themeDir}"\nhashAssets: false\n`);
      f.writePage("index.md", `---\ntitle: "Home"\n---\nHello.`);

      await new Steno(f.configPath, false).build();

      const css = Deno.readTextFileSync(join(f.outputDir, "assets", "style.css"));
      assertEquals(css, "body{color:green}");

      f.cleanup();
    },
  });

  Deno.test({
    name: "build: minify.html: false keeps rendered page formatting as-is",
    permissions: { read: true, write: true },
    fn: async () => {
      const f = createFixture();
      const themeDir = f.writeTheme({
        layout: `<html>\n  <body>\n    {@html content}\n  </body>\n</html>`,
      });
      f.writeConfig(`custom:\n  theme: "${themeDir}"\nminify:\n  html: false\n`);
      f.writePage("index.md", `---\ntitle: "Home"\n---\nHello.`);

      await new Steno(f.configPath, false).build();

      const html = Deno.readTextFileSync(join(f.outputDir, "index.html"));
      assertStringIncludes(html, "\n  <body>\n    ");

      f.cleanup();
    },
  });

  Deno.test({
    name: "build: rendered pages are HTML-minified by default",
    permissions: { read: true, write: true },
    fn: async () => {
      const f = createFixture();
      const themeDir = f.writeTheme({
        layout: `<html>\n  <body>\n    {@html content}\n  </body>\n</html>`,
      });
      f.writeConfig(`custom:\n  theme: "${themeDir}"\n`);
      f.writePage("index.md", `---\ntitle: "Home"\n---\nHello.`);

      await new Steno(f.configPath, false).build();

      const html = Deno.readTextFileSync(join(f.outputDir, "index.html"));
      assertEquals(html.includes("\n  <body>\n    "), false);

      f.cleanup();
    },
  });

  Deno.test({
    name: "build: reports syntax errors with file path and line/col numbers",
    permissions: { read: true, write: true },
    fn: async () => {
      const f = createFixture();
      const themeDir = f.writeTheme({
        layout: `<html>\n<body>\n{#each items as item}\n  <p>{item}</p>\n<!-- Missing closing each tag -->\n</body>\n</html>`,
      });

      f.writeConfig(`custom:\n  theme: "${themeDir}"\n`);
      f.writePage("index.md", `---\ntitle: "Error page"\nlayout: "layout"\n---\nContent\n`);

      const layoutPath = join(themeDir, "layouts", "layout.tau");
      const steno = new Steno(f.configPath, false);
      const err = await assertRejects(() => steno.build());
      assertStringIncludes((err as Error).message, layoutPath);
      assertStringIncludes((err as Error).message, "7:8");

      f.cleanup();
    },
  });

  Deno.test({
    name: "build: emits explicit permalinks and a root custom 404",
    permissions: { read: true, write: true },
    fn: async () => {
      const f = createFixture();
      f.writeConfig(`custom:\n  shortUrls: true\n`);
      f.writePage(
        "company.md",
        `---\ntitle: Company\nsteno:\n  permalink: /about/\n---\nCompany page.`,
      );
      f.writePage("404.md", `---\ntitle: Not found\n---\nThis page could not be found.`);

      await new Steno(f.configPath, false).build();

      assertStringIncludes(
        Deno.readTextFileSync(join(f.outputDir, "about", "index.html")),
        "Company page.",
      );
      assertStringIncludes(
        Deno.readTextFileSync(join(f.outputDir, "404.html")),
        "This page could not be found.",
      );
      assertEquals(fileExists(join(f.outputDir, "company", "index.html")), false);
      assertEquals(fileExists(join(f.outputDir, "404", "index.html")), false);
      f.cleanup();
    },
  });

  Deno.test({
    name: "build: reports frontmatter errors with file path",
    permissions: { read: true, write: true },
    fn: async () => {
      const f = createFixture();
      f.writeConfig();

      const mdPath = join(f.contentDir, "index.md");
      Deno.writeTextFileSync(mdPath, `---\ntitle: "Error page\nbroken_yaml: : :\n---\nContent\n`);

      const steno = new Steno(f.configPath, false);
      const err = await assertRejects(() => steno.build());
      assertStringIncludes((err as Error).message, mdPath);

      f.cleanup();
    },
  });

  Deno.test({
    name: "build: plugin lifecycle hooks are called in order",
    permissions: { read: true, write: true },
    fn: async () => {
      const f = createFixture();
      f.writeConfig();
      f.writePage("index.md", `---\ntitle: "Home"\n---\nHello.`);

      const order: string[] = [];
      const steno = new Steno(f.configPath, false, {
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

      await replacePlugins(steno, [
        {
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
        },
      ]);

      await steno.build();

      assertEquals(order, [
        "plugin:beforeBuild",
        "hook:beforeBuild",
        "hook:afterPage",
        "plugin:afterPage",
        "plugin:afterBuild",
        "hook:afterBuild",
      ]);

      f.cleanup();
    },
  });

  Deno.test({
    name: "build: incremental rebuilds skip unchanged pages",
    permissions: { read: true, write: true },
    fn: async () => {
      const f = createFixture();
      f.writeConfig();
      f.writePage("index.md", `---\ntitle: "Home"\n---\nHome.`);
      f.writePage("about.md", `---\ntitle: "About"\n---\nAbout.`);

      const rendered: string[] = [];
      const steno = new Steno(f.configPath, false, {
        afterPage: ({ path }) => {
          rendered.push(path);
        },
      });

      await steno.build();
      assertEquals(rendered.sort(), [
        join(f.outputDir, "about.html"),
        join(f.outputDir, "index.html"),
      ]);

      rendered.length = 0;
      f.writePage("about.md", `---\ntitle: "About"\n---\nUpdated about page.`);
      await steno.build();
      assertEquals(rendered, [join(f.outputDir, "about.html")]);

      rendered.length = 0;
      Deno.removeSync(join(f.contentDir, "index.md"));
      await steno.build();
      assertEquals(rendered, []);
      assertThrows(() => Deno.statSync(join(f.outputDir, "index.html")), Deno.errors.NotFound);

      f.cleanup();
    },
  });

  Deno.test({
    name: "build: persistent cache skips unchanged pages across processes",
    permissions: { read: true, write: true },
    fn: async () => {
      const f = createFixture();
      f.writeConfig();
      f.writePage("index.md", `---\ntitle: "Home"\n---\nHome.`);
      f.writePage("about.md", `---\ntitle: "About"\n---\nAbout.`);

      const cachePath = join(f.contentDir, ".steno", "build-cache.json");

      await new Steno(f.configPath, false).build();
      assertStringIncludes(Deno.readTextFileSync(cachePath), '"signature"');

      f.writePage("about.md", `---\ntitle: "About"\n---\nUpdated from new process.`);
      const secondRendered: string[] = [];
      await new Steno(f.configPath, false, {
        afterPage: ({ path }) => {
          secondRendered.push(path);
        },
      }).build();
      assertEquals(secondRendered, [join(f.outputDir, "about.html")]);

      const thirdRendered: string[] = [];
      await new Steno(f.configPath, false, {
        afterPage: ({ path }) => {
          thirdRendered.push(path);
        },
      }).build();
      assertEquals(thirdRendered, []);

      Deno.removeSync(join(f.contentDir, "about.md"));
      await new Steno(f.configPath, false).build();
      assertThrows(() => Deno.statSync(join(f.outputDir, "about.html")), Deno.errors.NotFound);

      f.cleanup();
    },
  });

  Deno.test({
    name: "build: a data file change forces a rebuild instead of stale output",
    permissions: { read: true, write: true },
    fn: async () => {
      const f = createFixture();
      const themeDir = f.writeTheme({
        layout: `<html><body>{data.site.message}{@html content}</body></html>`,
      });
      f.writeConfig(`custom:\n  theme: "${themeDir}"\n`);
      f.writePage("index.md", `---\ntitle: "Home"\nlayout: "layout"\n---\nHello.`);
      f.writePage("_data/site.json", `{"message":"v1"}`);

      const steno = new Steno(f.configPath, false);
      await steno.build();
      assertStringIncludes(Deno.readTextFileSync(join(f.outputDir, "index.html")), "v1");

      // The page's own source is untouched - only the data file changes.
      // Before the build signature accounted for data, this page's cache
      // entry would still match and the stale "v1" output would be copied
      // forward unchanged.
      f.writePage("_data/site.json", `{"message":"v2"}`);
      await steno.build();
      const html = Deno.readTextFileSync(join(f.outputDir, "index.html"));
      assertStringIncludes(html, "v2");
      assertEquals(html.includes("v1"), false);

      f.cleanup();
    },
  });

  Deno.test({
    name: "build: a theme asset content change forces a rebuild of pages that embed its hashed path",
    permissions: { read: true, write: true },
    fn: async () => {
      const f = createFixture();
      const themeDir = f.writeTheme(
        {
          layout: `<html><head><link rel="stylesheet" href="/assets/{assets["style.css"]}"></head><body>{@html content}</body></html>`,
        },
        {},
        { "style.css": "body { color: red; }" },
      );
      f.writeConfig(`custom:\n  theme: "${themeDir}"\n`);
      f.writePage("index.md", `---\ntitle: "Home"\nlayout: "layout"\n---\nHello.`);

      const steno = new Steno(f.configPath, false);
      await steno.build();
      const firstHtml = Deno.readTextFileSync(join(f.outputDir, "index.html"));
      const firstHrefMatch = firstHtml.match(/href="([^"]+)"/);
      assertEquals(firstHrefMatch !== null, true);
      const firstHref = firstHrefMatch![1];

      // Only the theme CSS changes - page source stays same.
      Deno.writeTextFileSync(join(themeDir, "assets", "style.css"), "body { color: blue; }");
      await steno.build();
      const secondHtml = Deno.readTextFileSync(join(f.outputDir, "index.html"));
      const secondHrefMatch = secondHtml.match(/href="([^"]+)"/);
      assertEquals(secondHrefMatch !== null, true);
      const secondHref = secondHrefMatch![1];

      assertEquals(secondHref === firstHref, false);
      assertEquals(fileExists(join(f.outputDir, secondHref.replace(/^\//, ""))), true);

      f.cleanup();
    },
  });

  Deno.test({
    name: "build: reuses cached HTML across processes when output is missing but content is unchanged",
    permissions: { read: true, write: true },
    fn: async () => {
      const f = createFixture();
      f.writeConfig();
      f.writePage("index.md", `---\ntitle: "Home"\n---\nHello.`);

      let transformCalls = 0;
      const plugin: StenoPlugin = {
        name: "counter",
        transformHtml: (html: string) => {
          transformCalls++;
          return html;
        },
      };

      const stenoV1 = new Steno(f.configPath, false);
      await replacePlugins(stenoV1, [plugin]);
      await stenoV1.build();
      assertEquals(transformCalls, 1);

      // Simulate a clean rebuild from a fresh process: the output directory
      // is gone, but content is unchanged and the persistent disk cache
      // still matches the build signature.
      Deno.removeSync(f.outputDir, { recursive: true });

      const stenoV2 = new Steno(f.configPath, false);
      await replacePlugins(stenoV2, [plugin]);
      await stenoV2.build();

      assertEquals(
        transformCalls,
        1,
        "transformHtml should not run again when cached HTML is reused",
      );
      assertStringIncludes(Deno.readTextFileSync(join(f.outputDir, "index.html")), "Hello.");

      f.cleanup();
    },
  });

  Deno.test({
    name: "build: persistent cache re-renders pages when theme layout templates change",
    permissions: { read: true, write: true },
    fn: async () => {
      const f = createFixture();
      const themeDir = f.writeTheme({
        layout: `<html><body><p>layout-v1</p>{@html content}</body></html>`,
      });
      f.writeConfig(`custom:\n  theme: "${themeDir}"\n`);
      f.writePage("index.md", `---\ntitle: "Home"\nlayout: "layout"\n---\nHome.`);

      await new Steno(f.configPath, false).build();
      assertStringIncludes(Deno.readTextFileSync(join(f.outputDir, "index.html")), "layout-v1");

      Deno.writeTextFileSync(
        join(themeDir, "layouts", "layout.tau"),
        `<html><body><p>layout-v2</p>{@html content}</body></html>`,
      );

      const rendered: string[] = [];
      await new Steno(f.configPath, false, {
        afterPage: ({ path }) => {
          rendered.push(path);
        },
      }).build();

      assertEquals(rendered, [join(f.outputDir, "index.html")]);
      assertStringIncludes(Deno.readTextFileSync(join(f.outputDir, "index.html")), "layout-v2");

      f.cleanup();
    },
  });

  Deno.test({
    name: "build: persistent cache re-renders pages when plugin implementation changes",
    permissions: { read: true, write: true },
    fn: async () => {
      const f = createFixture();
      f.writeConfig();
      f.writePage("index.md", `---\ntitle: "Home"\n---\nHome.`);

      const stenoV1 = new Steno(f.configPath, false);
      await replacePlugins(stenoV1, [
        {
          name: "sig",
          transformHtml: (html: string) => `<div>plugin-v1</div>${html}`,
        },
      ]);
      await stenoV1.build();
      assertStringIncludes(Deno.readTextFileSync(join(f.outputDir, "index.html")), "plugin-v1");

      const rendered: string[] = [];
      const stenoV2 = new Steno(f.configPath, false, {
        afterPage: ({ path }) => {
          rendered.push(path);
        },
      });
      await replacePlugins(stenoV2, [
        {
          name: "sig",
          transformHtml: (html: string) => `<div>plugin-v2</div>${html}`,
        },
      ]);
      await stenoV2.build();

      assertEquals(rendered, [join(f.outputDir, "index.html")]);
      assertStringIncludes(Deno.readTextFileSync(join(f.outputDir, "index.html")), "plugin-v2");

      f.cleanup();
    },
  });

  Deno.test({
    name: "build: theme plugins can be disabled via plugin source policy",
    permissions: { read: true, write: true },
    fn: async () => {
      const f = createFixture();
      const themeModulePath = join(f.tempDir, "theme.ts");

      Deno.writeTextFileSync(
        themeModulePath,
        `import type { StenoTheme } from "file://${join(Deno.cwd(), "mod.ts")}";
const theme: StenoTheme = {
  name: "module-theme",
  version: "1.0.0",
  layouts: { layout: "<html><body>{@html content}</body></html>" },
  plugins: [{ name: "theme-plugin", transformHtml: (html) => "<div>theme-plugin</div>" + html }],
};
export default theme;`,
      );

      f.writePage("index.md", `---\ntitle: "Home"\nlayout: "layout"\n---\nHello.`);

      f.writeConfig(`custom:\n  theme: "${themeModulePath}"\n`);
      await new Steno(f.configPath, false).build();
      assertStringIncludes(Deno.readTextFileSync(join(f.outputDir, "index.html")), "theme-plugin");

      f.writeConfig(
        `custom:\n  theme: "${themeModulePath}"\n  pluginSourcePolicy:\n    allowThemePlugins: false\n`,
      );
      await new Steno(f.configPath, false).build();
      assertEquals(
        Deno.readTextFileSync(join(f.outputDir, "index.html")).includes("theme-plugin"),
        false,
      );

      f.cleanup();
    },
  });

  Deno.test({
    name: "build: skips draft pages in production build",
    permissions: { read: true, write: true },
    fn: async () => {
      const f = createFixture();
      f.writeConfig();
      f.writePage("index.md", `---\ntitle: "Home"\n---\nHello.`);
      f.writePage("draft-post.md", `---\ntitle: "Draft"\ndraft: true\n---\nThis is a draft.`);

      await new Steno(f.configPath, false).build();

      assertEquals(fileExists(join(f.outputDir, "index.html")), true);
      assertEquals(fileExists(join(f.outputDir, "draft-post.html")), false);

      f.cleanup();
    },
  });

  Deno.test({
    name: "build: includes draft pages in dev build",
    permissions: { read: true, write: true },
    fn: async () => {
      const f = createFixture();
      f.writePage("draft-post.md", `---\ntitle: "Draft"\ndraft: true\n---\nThis is a draft.`);

      await buildSite({
        config: {
          title: "Test",
          description: "",
          author: "",
          contentDir: f.contentDir,
          output: f.outputDir,
        },
        plugins: [],
        hooks: {},
        dev: true,
      });

      assertEquals(fileExists(join(f.outputDir, "draft-post.html")), true);
      f.cleanup();
    },
  });

  Deno.test({
    name: "build: non-draft pages are always included",
    permissions: { read: true, write: true },
    fn: async () => {
      const f = createFixture();
      f.writePage("about.md", `---\ntitle: "About"\ndraft: false\n---\nAbout page.`);

      await buildSite({
        config: {
          title: "Test",
          description: "",
          author: "",
          contentDir: f.contentDir,
          output: f.outputDir,
        },
        plugins: [],
        hooks: {},
        dev: false,
      });

      assertEquals(fileExists(join(f.outputDir, "about.html")), true);
      f.cleanup();
    },
  });

  Deno.test({
    name: "build: exposes custom globals in layouts and components",
    permissions: { read: true, write: true },
    fn: async () => {
      const f = createFixture();
      const themeDir = f.writeTheme(
        {
          layout: `<html><body><Header /><p>{tagline} - {globals.company.name}</p>{@html content}</body></html>`,
        },
        { header: `<header>{tagline}::{globals.company.name}</header>` },
      );

      f.writeConfig(
        `custom:\n  theme: "${themeDir}"\n  globals:\n    tagline: "Ship fast"\n    company:\n      name: "Acme"\n`,
      );
      f.writePage("index.md", `---\ntitle: "Home"\nlayout: "layout"\n---\nHello.`);

      await new Steno(f.configPath, false).build();
      const html = Deno.readTextFileSync(join(f.outputDir, "index.html"));
      assertStringIncludes(html, "<header>Ship fast::Acme</header>");
      assertStringIncludes(html, "<p>Ship fast - Acme</p>");

      f.cleanup();
    },
  });

  Deno.test({
    name: "build: applies isolated per-page configuration overrides",
    permissions: { read: true, write: true, net: true },
    fn: async () => {
      const f = createFixture();
      const themeDir = f.writeTheme({
        layout: `<p>{site.title}|{site.description}|{theme.brand}|{globals.campaign}|{campaign}</p>{@html content}`,
      });
      Deno.writeTextFileSync(
        f.configPath,
        `title: Test\ndescription: Site description\nauthor: ""\ncontentDir: "${f.contentDir}"\noutput: "${f.outputDir}"\ncustom:\n  theme: "${themeDir}"\n  themeConfig:\n    brand: Default brand\n  globals:\n    campaign: evergreen\n`,
      );
      f.writePage(
        "launch.md",
        `---\ntitle: Launch\nsteno:\n  title: Launch site\n  description: Launch description\n  themeConfig:\n    brand: Launch brand\n  globals:\n    campaign: launch\n---\nLaunch.`,
      );
      f.writePage("about.md", `---\ntitle: About\n---\nAbout.`);

      await new Steno(f.configPath, false).build();

      const launch = Deno.readTextFileSync(join(f.outputDir, "launch.html"));
      assertStringIncludes(
        launch,
        "<p>Launch site|Launch description|Launch brand|launch|launch</p>",
      );
      const about = Deno.readTextFileSync(join(f.outputDir, "about.html"));
      assertStringIncludes(about, "<p>Test|Site description|Default brand|evergreen|evergreen</p>");
      assertEquals(launch.includes("[object Object]"), false);

      f.cleanup();
    },
  });

  Deno.test({
    name: "build: validates per-page overrides and reports the page",
    permissions: { read: true, write: true, net: true },
    fn: async () => {
      const f = createFixture();
      const themeDir = f.writeTheme();
      Deno.writeTextFileSync(
        join(themeDir, "theme.yaml"),
        `name: test-theme\nversion: 1.0.0\nconfigSchema:\n  columns: { type: integer, default: 2 }\n`,
      );
      f.writeConfig(`custom:\n  theme: "${themeDir}"\n`);
      f.writePage("invalid.md", `---\nsteno:\n  themeConfig:\n    columns: wide\n---\nInvalid.`);

      const error = await assertRejects(
        () => new Steno(f.configPath, false).build(),
        Error,
        'in "invalid.md": Invalid configuration for theme "test-theme" at "themeConfig.columns": expected integer',
      );
      assertStringIncludes(error.message, "test-theme");

      f.cleanup();
    },
  });

  Deno.test({
    name: "build: injects and isolates merged site and page head tags",
    permissions: { read: true, write: true, net: true },
    fn: async () => {
      const f = createFixture();
      const themeDir = f.writeTheme({
        layout: "<html><head><title>{title}</title></head><body>{@html content}</body></html>",
      });
      f.writeConfig(
        `custom:\n  theme: "${themeDir}"\nhead:\n  - name: description\n    content: Site description\n  - property: og:type\n    content: website\n  - tag: script\n    src: /app.js\n`,
      );
      f.writePage(
        "post.md",
        `---\ntitle: Post\nsteno:\n  head:\n    - name: description\n      content: Post description\n    - property: og:type\n      content: article\n    - tag: script\n      src: /app.js\n      defer: true\n---\nPost.`,
      );
      f.writePage("about.md", `---\ntitle: About\n---\nAbout.`);

      await new Steno(f.configPath, false).build();
      const post = Deno.readTextFileSync(join(f.outputDir, "post.html"));
      assertStringIncludes(post, '<meta name="description" content="Post description">');
      assertStringIncludes(post, '<meta property="og:type" content="article">');
      assertStringIncludes(post, '<script src="/app.js" defer></script>');
      assertEquals(post.includes("Site description"), false);

      const about = Deno.readTextFileSync(join(f.outputDir, "about.html"));
      assertStringIncludes(about, "Site description");
      assertStringIncludes(about, '<meta property="og:type" content="website">');
      assertEquals(about.includes(" defer"), false);

      f.cleanup();
    },
  });

  Deno.test({
    name: "build: rejects malformed per-page configuration with page path",
    permissions: { read: true, write: true },
    fn: async () => {
      const f = createFixture();
      f.writeConfig();
      f.writePage("invalid.md", `---\nsteno: invalid\n---\nInvalid.`);

      await assertRejects(
        () => new Steno(f.configPath, false).build(),
        Error,
        'in "invalid.md" at "steno": expected an object',
      );

      f.cleanup();
    },
  });

  Deno.test({
    name: "build: exposes PUBLIC_ environment variables and namespaced env in layouts",
    permissions: { read: true, write: true, env: true },
    fn: async () => {
      const f = createFixture();
      Deno.env.set("PUBLIC_ANALYTICS_ID", "STENO-999");
      Deno.env.set("STRIPE_SECRET_KEY", "sk_private_secret_leak_test");

      try {
        const themeDir = f.writeTheme({
          layout: `<html><body><div id="flat">{PUBLIC_ANALYTICS_ID}</div><div id="namespace">{env.PUBLIC_ANALYTICS_ID}</div><div id="secret">{STRIPE_SECRET_KEY}</div>{@html content}</body></html>`,
        });

        f.writeConfig(`custom:\n  theme: "${themeDir}"\n`);
        f.writePage("index.md", `---\ntitle: "Home"\nlayout: "layout"\n---\nPage content\n`);

        await new Steno(f.configPath, false).build();
        const html = Deno.readTextFileSync(join(f.outputDir, "index.html"));

        assertStringIncludes(html, '<div id="flat">STENO-999</div>');
        assertStringIncludes(html, '<div id="namespace">STENO-999</div>');
        assertStringIncludes(html, '<div id="secret"></div>');
      } finally {
        Deno.env.delete("PUBLIC_ANALYTICS_ID");
        Deno.env.delete("STRIPE_SECRET_KEY");
        f.cleanup();
      }
    },
  });

  Deno.test({
    name: "build: processes {@include} directives in markdown",
    permissions: { read: true, write: true },
    fn: async () => {
      const f = createFixture();
      f.writeConfig();
      f.writePage("index.md", `---\ntitle: "Home"\n---\n# Hello\n{@include "partials/cta.md"}`);
      f.writePage("partials/cta.md", `Sign up today!`);

      await new Steno(f.configPath, false).build();

      assertStringIncludes(
        Deno.readTextFileSync(join(f.outputDir, "index.html")),
        "Sign up today!",
      );

      f.cleanup();
    },
  });

  Deno.test({
    name: "build: an unchanged page whose {@include}d partial changed is rebuilt on the next incremental build",
    permissions: { read: true, write: true },
    fn: async () => {
      const f = createFixture();
      const config: SiteConfig = {
        title: "Test",
        description: "",
        author: "",
        contentDir: f.contentDir,
        output: f.outputDir,
      };
      f.writePage("index.md", `---\ntitle: "Home"\n---\n# Hello\n{@include "partials/cta.md"}`);
      f.writePage("partials/cta.md", `Old CTA`);

      const state = { signature: null, pages: new Map() };
      await buildSite({ config, plugins: [], hooks: {}, dev: false, state });
      assertStringIncludes(Deno.readTextFileSync(join(f.outputDir, "index.html")), "Old CTA");

      f.writePage("partials/cta.md", `New CTA`);
      await buildSite({ config, plugins: [], hooks: {}, dev: false, state });

      assertStringIncludes(Deno.readTextFileSync(join(f.outputDir, "index.html")), "New CTA");

      f.cleanup();
    },
  });

  Deno.test({
    name: "build: an unchanged page that lists a collection is rebuilt when the collection's membership changes",
    permissions: { read: true, write: true },
    fn: async () => {
      const f = createFixture();
      const themeDir = f.writeTheme({
        layout:
          `<html><body><ul>{#each collections.posts.items as post}` +
          `<li>{post.frontmatter.title}</li>{/each}</ul>{@html content}</body></html>`,
      });
      f.writeConfig(`custom:\n  theme: "${themeDir}"\n`);
      f.writePage("index.md", `---\ntitle: "Home"\nlayout: layout\n---\n# Hello`);
      f.writePage("posts/one.md", `---\ntitle: "First"\nlayout: layout\n---\nBody`);

      const steno = new Steno(f.configPath, false);
      await steno.build();
      assertStringIncludes(
        Deno.readTextFileSync(join(f.outputDir, "index.html")),
        "<li>First</li>",
      );

      f.writePage("posts/two.md", `---\ntitle: "Second"\nlayout: layout\n---\nBody`);
      await steno.build();

      const html = Deno.readTextFileSync(join(f.outputDir, "index.html"));
      assertStringIncludes(html, "<li>First</li>");
      assertStringIncludes(html, "<li>Second</li>");

      f.cleanup();
    },
  });

  Deno.test({
    name: "build: failed plugin hook preserves the previous output",
    permissions: { read: true, write: true },
    fn: async () => {
      const f = createFixture();
      f.writeConfig();
      f.writePage("index.md", `---\ntitle: "Home"\n---\nStable output.`);
      const steno = new Steno(f.configPath, false);
      await steno.build();
      const outputPath = join(f.outputDir, "index.html");
      const previousOutput = Deno.readTextFileSync(outputPath);
      const cachePath = join(f.contentDir, ".steno", "build-cache.json");
      const previousCache = Deno.readTextFileSync(cachePath);

      f.writePage("index.md", `---\ntitle: "Home"\n---\nUnsafe update.`);
      await replacePlugins(steno, [
        {
          name: "failing-after-build",
          afterBuild: () => {
            throw new Error("deliberate post-build failure");
          },
        },
      ]);

      await assertRejects(() => steno.build(), Error, "deliberate post-build failure");
      assertEquals(Deno.readTextFileSync(outputPath), previousOutput);
      assertEquals(Deno.readTextFileSync(cachePath), previousCache);
      assertEquals(
        [...Deno.readDirSync(f.tempDir)].some((entry) =>
          entry.name.startsWith(".dist.steno-stage-"),
        ),
        false,
      );
      f.cleanup();
    },
  });

  Deno.test({
    name: "build: lifecycle hooks receive the staging output directory",
    permissions: { read: true, write: true },
    fn: async () => {
      const f = createFixture();
      f.writeConfig();
      f.writePage("index.md", `---\ntitle: "Home"\n---\nAtomic.`);
      let lifecycleOutput = "";

      await new Steno(f.configPath, false, {
        afterBuild: (config) => {
          lifecycleOutput = config.output ?? "";
          Deno.writeTextFileSync(join(lifecycleOutput, "hook-output.txt"), "committed");
          assertEquals(fileExists(f.outputDir), false);
        },
      }).build();

      assertEquals(lifecycleOutput === f.outputDir, false);
      assertEquals(Deno.readTextFileSync(join(f.outputDir, "hook-output.txt")), "committed");
      f.cleanup();
    },
  });

  Deno.test({
    name: "build: afterBuild receives generated page metadata",
    permissions: { read: true, write: true },
    fn: async () => {
      const f = createFixture();
      f.writeConfig();
      f.writePage(
        "post.md",
        `---
title: "Post"
description: "Feed description"
date: "2026-07-29"
---
Body.`,
      );
      let pages: SiteConfig["pages"];

      await new Steno(f.configPath, false, {
        afterBuild: (config) => {
          pages = config.pages;
        },
      }).build();

      assertEquals(pages, [
        {
          slug: "post.html",
          title: "Post",
          description: "Feed description",
          date: "2026-07-29",
        },
      ]);
      f.cleanup();
    },
  });

  Deno.test({
    name: "build: removes stale pages and theme assets on commit",
    permissions: { read: true, write: true },
    fn: async () => {
      const f = createFixture();
      const themeDir = f.writeTheme(undefined, undefined, { "old.css": "old" });
      f.writeConfig(`custom:\n  theme: "${themeDir}"\n`);
      f.writePage("index.md", `---\ntitle: "Home"\n---\nHome.`);
      f.writePage("old.md", `---\ntitle: "Old"\n---\nOld.`);
      await new Steno(f.configPath, false).build();

      Deno.removeSync(join(f.contentDir, "old.md"));
      Deno.removeSync(join(themeDir, "assets", "old.css"));
      await new Steno(f.configPath, false).build();

      assertEquals(fileExists(join(f.outputDir, "old.html")), false);
      assertEquals(fileExists(join(f.outputDir, "assets", "old.css")), false);
      f.cleanup();
    },
  });

  Deno.test({
    name: "build: rejects page output collisions without promotion",
    permissions: { read: true, write: true },
    fn: async () => {
      const f = createFixture();
      f.writeConfig(`custom:\n  shortUrls: true\n`);
      f.writePage("index.md", `---\ntitle: "Home"\n---\nStable.`);
      await new Steno(f.configPath, false).build();
      const previousOutput = Deno.readTextFileSync(join(f.outputDir, "index.html"));

      f.writePage("about.md", `---\ntitle: "About"\n---\nOne.`);
      f.writePage("about/index.md", `---\ntitle: "About index"\n---\nTwo.`);
      await assertRejects(() => new Steno(f.configPath, false).build(), Error, "Output collision");
      assertEquals(Deno.readTextFileSync(join(f.outputDir, "index.html")), previousOutput);
      f.cleanup();
    },
  });

  Deno.test({
    name: "build: rejects redirect collisions without promotion",
    permissions: { read: true, write: true },
    fn: async () => {
      const f = createFixture();
      f.writeConfig();
      f.writePage("index.md", `---\ntitle: "Home"\n---\nStable.`);
      await new Steno(f.configPath, false).build();
      const previousOutput = Deno.readTextFileSync(join(f.outputDir, "index.html"));

      f.writeConfig(`redirects:\n  /index: /elsewhere\n`);
      await assertRejects(() => new Steno(f.configPath, false).build(), Error, "Output collision");
      assertEquals(Deno.readTextFileSync(join(f.outputDir, "index.html")), previousOutput);
      f.cleanup();
    },
  });

  Deno.test({
    name: "build: clean builds are byte deterministic",
    permissions: { read: true, write: true },
    fn: async () => {
      const f = createFixture();
      const themeDir = f.writeTheme(undefined, undefined, {
        "style.css": "body { color: black; }",
      });
      f.writeConfig(`custom:\n  theme: "${themeDir}"\nredirects:\n  /old: /new\n`);
      f.writePage("index.md", `---\ntitle: "Home"\n---\nDeterministic.`);

      const snapshot = async (): Promise<Record<string, string>> => {
        const files: Record<string, string> = {};
        const walk = async (directory: string, prefix = ""): Promise<void> => {
          const entries = [...Deno.readDirSync(directory)].sort((a, b) =>
            a.name.localeCompare(b.name),
          );
          for (const entry of entries) {
            const path = join(directory, entry.name);
            const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
            if (entry.isDirectory) {
              await walk(path, relativePath);
            } else if (entry.isFile) {
              const digest = await crypto.subtle.digest("SHA-256", Deno.readFileSync(path));
              files[relativePath] = Array.from(new Uint8Array(digest))
                .map((byte) => byte.toString(16).padStart(2, "0"))
                .join("");
            }
          }
        };
        await walk(f.outputDir);
        return files;
      };

      await new Steno(f.configPath, false).build();
      const first = await snapshot();
      Deno.removeSync(f.outputDir, { recursive: true });
      await new Steno(f.configPath, false).build();
      assertEquals(await snapshot(), first);
      f.cleanup();
    },
  });

  Deno.test({
    name: "build: recovers an output backup left by interrupted promotion",
    permissions: { read: true, write: true },
    fn: () => {
      const tempDir = Deno.makeTempDirSync();
      const outputDir = join(tempDir, "dist");
      const backupDir = join(tempDir, ".dist.steno-backup");
      Deno.mkdirSync(backupDir);
      Deno.writeTextFileSync(join(backupDir, "index.html"), "last-good");

      const transaction = beginOutputTransaction(outputDir);
      assertEquals(Deno.readTextFileSync(join(outputDir, "index.html")), "last-good");
      rollbackOutputTransaction(transaction);
      assertEquals(Deno.readTextFileSync(join(outputDir, "index.html")), "last-good");
      Deno.removeSync(tempDir, { recursive: true });
    },
  });

  Deno.test({
    name: "build: copies public directory files to output root",
    permissions: { read: true, write: true },
    fn: async () => {
      const f = createFixture();
      f.writeConfig();
      f.writePage("index.md", `---\ntitle: "Home"\n---\nHello.`);
      f.writePage("public/favicon.ico", "ICO");
      f.writePage("public/css/style.css", "body {}");

      await new Steno(f.configPath, false).build();

      assertEquals(Deno.readTextFileSync(join(f.outputDir, "favicon.ico")), "ICO");
      assertEquals(Deno.readTextFileSync(join(f.outputDir, "css", "style.css")), "body {}");
      f.cleanup();
    },
  });

  Deno.test({
    name: "build: public directory is excluded from page scanning",
    permissions: { read: true, write: true },
    fn: async () => {
      const f = createFixture();
      f.writeConfig();
      f.writePage("index.md", `---\ntitle: "Home"\n---\nHello.`);
      f.writePage("public/downloads/readme.md", "# not a page");

      await new Steno(f.configPath, false).build();

      assertEquals(
        Deno.readTextFileSync(join(f.outputDir, "downloads", "readme.md")),
        "# not a page",
      );
      assertEquals(fileExists(join(f.outputDir, "downloads", "readme.html")), false);
      f.cleanup();
    },
  });

  Deno.test({
    name: "build: publicDir: false disables the public directory",
    permissions: { read: true, write: true },
    fn: async () => {
      const f = createFixture();
      f.writeConfig(`publicDir: false\n`);
      f.writePage("index.md", `---\ntitle: "Home"\n---\nHello.`);
      f.writePage("public/favicon.ico", "ICO");

      await new Steno(f.configPath, false).build();

      assertEquals(fileExists(join(f.outputDir, "favicon.ico")), false);
      f.cleanup();
    },
  });

  Deno.test({
    name: "build: publicDir overrides the directory name",
    permissions: { read: true, write: true },
    fn: async () => {
      const f = createFixture();
      f.writeConfig(`publicDir: static\n`);
      f.writePage("index.md", `---\ntitle: "Home"\n---\nHello.`);
      f.writePage("static/favicon.ico", "ICO");
      f.writePage("public/favicon.ico", "should-not-be-copied");

      await new Steno(f.configPath, false).build();

      assertEquals(Deno.readTextFileSync(join(f.outputDir, "favicon.ico")), "ICO");
      f.cleanup();
    },
  });

  Deno.test({
    name: "build: a public custom.css is auto-linked in every page's head",
    permissions: { read: true, write: true },
    fn: async () => {
      const f = createFixture();
      f.writeConfig();
      f.writePage("index.md", `---\ntitle: "Home"\n---\nHello.`);
      f.writePage("public/custom.css", "h1 { color: hotpink; }");

      await new Steno(f.configPath, false).build();

      const html = Deno.readTextFileSync(join(f.outputDir, "index.html"));
      assertStringIncludes(html, '<link rel="stylesheet" href="/custom.css">');
      assertEquals(
        Deno.readTextFileSync(join(f.outputDir, "custom.css")),
        "h1 { color: hotpink; }",
      );
      f.cleanup();
    },
  });

  Deno.test({
    name: "build: an explicit head entry for /custom.css replaces the automatic one",
    permissions: { read: true, write: true },
    fn: async () => {
      const f = createFixture();
      f.writeConfig(
        `head:\n  - tag: link\n    rel: stylesheet\n    href: /custom.css\n    media: print\n`,
      );
      f.writePage("index.md", `---\ntitle: "Home"\n---\nHello.`);
      f.writePage("public/custom.css", "h1 { color: hotpink; }");

      await new Steno(f.configPath, false).build();

      const html = Deno.readTextFileSync(join(f.outputDir, "index.html"));
      const matches = html.match(/<link[^>]*custom\.css[^>]*>/g) ?? [];
      assertEquals(matches.length, 1);
      assertStringIncludes(html, 'media="print"');
      f.cleanup();
    },
  });

  Deno.test({
    name: "build: public asset colliding with a page fails the build",
    permissions: { read: true, write: true },
    fn: async () => {
      const f = createFixture();
      f.writeConfig();
      f.writePage("about.md", `---\ntitle: "About"\n---\nHello.`);
      f.writePage("public/about.html", "not the real page");

      await assertRejects(() => new Steno(f.configPath, false).build(), Error, "Output collision");
      f.cleanup();
    },
  });

  Deno.test({
    name: "build: dev-mode builds reload the config file on every rebuild",
    permissions: { read: true, write: true },
    fn: async () => {
      const f = createFixture();
      f.writeConfig();
      f.writePage("index.md", `---\ntitle: "Home"\n---\nHello.`);

      const steno = new Steno(f.configPath, false);
      const internals = steno as unknown as {
        executeBuild: (dev: boolean) => Promise<void>;
        config: SiteConfig;
      };

      await internals.executeBuild(true);
      assertEquals(internals.config.title, "Test");

      Deno.writeTextFileSync(
        f.configPath,
        `title: "Updated"\ndescription: ""\nauthor: ""\ncontentDir: "${f.contentDir}"\noutput: "${f.outputDir}"\n`,
      );

      await internals.executeBuild(true);
      assertEquals(internals.config.title, "Updated");

      const indexHtml = Deno.readTextFileSync(join(f.outputDir, "index.html"));
      assertStringIncludes(indexHtml, "Hello.");

      f.cleanup();
    },
  });
}
