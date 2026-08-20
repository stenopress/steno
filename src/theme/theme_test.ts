import { assertEquals, assertRejects, assertStringIncludes, assertThrows } from "@std/assert";
import { join } from "@std/path";
import type { StenoTheme } from "../types.ts";
import { mergeTheme, Theme } from "./theme.ts";

export function registerThemeTests(): void {
  Deno.test("theme: constructor throws on a missing/empty name", () => {
    assertThrows(
      () =>
        new Theme({
          name: "",
          version: "1.0.0",
          layouts: { layout: "<main>{@html content}</main>" },
        }),
      Error,
      'non-empty "name"',
    );
  });

  Deno.test("theme: constructor throws on a missing/empty version", () => {
    assertThrows(
      () =>
        new Theme({
          name: "incomplete",
          version: "",
          layouts: { layout: "<main>{@html content}</main>" },
        }),
      Error,
      'non-empty "version"',
    );
  });

  Deno.test("theme: constructor throws when there are no layouts at all", () => {
    assertThrows(
      () =>
        new Theme({
          name: "no-layouts",
          version: "1.0.0",
          layouts: {},
        }),
      Error,
      "declares no layouts",
    );
  });

  Deno.test("theme: merges defaultConfig with userConfig", () => {
    const theme = new Theme(
      {
        name: "minimal",
        version: "1.0.0",
        layouts: { layout: `<main>{@html content}</main>` },
        defaultConfig: { color: "blue", author: "theme" },
      },
      { author: "site" },
    );

    assertEquals(theme.config.color, "blue");
    assertEquals(theme.config.author, "site");
  });

  Deno.test("theme: renderLayout receives page/site/theme context", async () => {
    const theme = new Theme({
      name: "minimal",
      version: "1.0.0",
      layouts: {
        layout: `<Header title={title} /><article>{@html content}</article>`,
      },
      components: {
        Header: `<h1>{ title } - { site.title }</h1>`,
      },
      defaultConfig: { author: "theme-author" },
    });

    const out = await theme.renderLayout("layout", "<p>Body</p>", {
      title: "Post",
      site: { title: "Site", description: "", author: "" },
      theme: {
        name: theme.name,
        version: theme.version,
        author: "theme-author",
      },
    });

    assertStringIncludes(out, "<h1>Post - Site</h1>");
    assertStringIncludes(out, "<article><p>Body</p></article>");
  });

  Deno.test({
    name: "theme: copyAssets writes string and binary assets",
    permissions: { read: true, write: true },
    fn: async () => {
      const tempDir = Deno.makeTempDirSync();
      const theme = new Theme({
        name: "assets",
        version: "1.0.0",
        layouts: { layout: `{ title }` },
        assets: {
          "style.css": "body { color: red; }",
          "images/pixel.bin": new Uint8Array([1, 2, 3]),
        },
      });

      const manifest = await theme.copyAssets(tempDir);

      assertEquals(manifest["images/pixel.bin"], "images/pixel.bin");
      assertStringIncludes(manifest["style.css"], "style.");
      assertStringIncludes(manifest["style.css"], ".css");

      const css = Deno.readTextFileSync(join(tempDir, "assets", manifest["style.css"]));
      const bin = Deno.readFileSync(join(tempDir, "assets", "images", "pixel.bin"));

      assertStringIncludes(css, "color:red");
      assertEquals(Array.from(bin), [1, 2, 3]);
    },
  });

  Deno.test({
    name: "theme: copyAssets skips CSS minification when minifyCss is false",
    permissions: { read: true, write: true },
    fn: async () => {
      const tempDir = Deno.makeTempDirSync();
      const theme = new Theme({
        name: "assets",
        version: "1.0.0",
        layouts: { layout: `{ title }` },
        assets: { "style.css": "body {\n  color: red;\n}" },
      });

      const manifest = await theme.copyAssets(tempDir, new Set(), true, false);
      const css = Deno.readTextFileSync(join(tempDir, "assets", manifest["style.css"]));

      assertEquals(css, "body {\n  color: red;\n}");
    },
  });

  Deno.test({
    name: "theme: copyAssets hashes CSS/JS deterministically and leaves other assets untouched",
    permissions: { read: true, write: true },
    fn: async () => {
      const tempDir = Deno.makeTempDirSync();
      const theme = new Theme({
        name: "assets",
        version: "1.0.0",
        layouts: { layout: `{ title }` },
        assets: { "style.css": "body { color: blue; }" },
      });

      const first = await theme.copyAssets(join(tempDir, "a"));
      const second = await theme.copyAssets(join(tempDir, "b"));

      assertEquals(first["style.css"], second["style.css"]);
      assertEquals(/^style\.[0-9a-f]{8}\.css$/.test(first["style.css"]), true);
    },
  });

  Deno.test({
    name: "theme: loadFromDirectory loads layouts/components/assets",
    permissions: { read: true, write: true, net: true },
    fn: async () => {
      const tempDir = Deno.makeTempDirSync();
      const themeDir = join(tempDir, "theme");
      Deno.mkdirSync(join(themeDir, "layouts"), { recursive: true });
      Deno.mkdirSync(join(themeDir, "components"), { recursive: true });
      Deno.mkdirSync(join(themeDir, "assets"), { recursive: true });

      Deno.writeTextFileSync(
        join(themeDir, "theme.yaml"),
        `name: Demo\nversion: 1.0.0\ncomponents:\n  header: components/header.tau\ndefaultConfig:\n  author: demo\n`,
      );
      Deno.writeTextFileSync(join(themeDir, "layouts", "layout.tau"), `<Header />{@html content}`);
      Deno.writeTextFileSync(
        join(themeDir, "layouts", "legacy.liquid"),
        `This must not be loaded as Tau.`,
      );
      Deno.writeTextFileSync(join(themeDir, "components", "header.tau"), `<h1>{ site.title }</h1>`);
      Deno.writeTextFileSync(join(themeDir, "assets", "style.css"), `body {}`);

      const theme = await Theme.loadFromDirectory(themeDir, {
        author: "override",
      });
      const rendered = await theme.renderLayout("layout", "<p>x</p>", {
        site: { title: "My Site", description: "", author: "" },
        theme: {
          name: theme.name,
          version: theme.version,
          author: theme.config.author,
        },
      });

      assertStringIncludes(rendered, "<h1>My Site</h1>");
      await assertRejects(
        () => theme.renderLayout("legacy", "", {}),
        Error,
        'Layout "legacy" not found',
      );

      const outputDir = join(tempDir, "dist");
      const manifest = await theme.copyAssets(outputDir);
      const copied = Deno.readTextFileSync(join(outputDir, "assets", manifest["style.css"]));
      assertEquals(copied, "body{}");
      assertEquals(theme.config.author, "override");
    },
  });

  Deno.test({
    name: "theme: loadFromDirectory compiles scripts/*.ts into assets",
    permissions: { read: true, write: true, net: true, env: true, run: true },
    fn: async () => {
      const tempDir = Deno.makeTempDirSync();
      const themeDir = join(tempDir, "theme");
      Deno.mkdirSync(join(themeDir, "layouts"), { recursive: true });
      Deno.mkdirSync(join(themeDir, "scripts", "sub"), { recursive: true });

      Deno.writeTextFileSync(join(themeDir, "theme.yaml"), `name: Demo\nversion: 1.0.0\n`);
      Deno.writeTextFileSync(join(themeDir, "layouts", "layout.tau"), `{@html content}`);
      Deno.writeTextFileSync(
        join(themeDir, "scripts", "foo.ts"),
        `const label: string = "hi";\nconsole.log(label);\n`,
      );
      Deno.writeTextFileSync(
        join(themeDir, "scripts", "sub", "bar.ts"),
        `const count: number = 1;\nconsole.log(count);\n`,
      );
      Deno.writeTextFileSync(join(themeDir, "scripts", "plain.js"), `console.log("plain");\n`);

      const theme = await Theme.loadFromDirectory(themeDir);
      const outputDir = join(tempDir, "dist");
      const manifest = await theme.copyAssets(outputDir);

      const fooJs = Deno.readTextFileSync(join(outputDir, "assets", manifest["foo.js"]));
      assertStringIncludes(fooJs, "hi");
      assertEquals(fooJs.includes(": string"), false);

      const barJs = Deno.readTextFileSync(join(outputDir, "assets", manifest["bar.js"]));
      assertStringIncludes(barJs, "1");
      assertEquals(barJs.includes(": number"), false);

      const plainJs = Deno.readTextFileSync(join(outputDir, "assets", manifest["plain.js"]));
      assertStringIncludes(plainJs, "plain");
    },
  });

  Deno.test({
    name: "theme: loadFromDirectory is a no-op when scripts/ is absent",
    permissions: { read: true, write: true, net: true },
    fn: async () => {
      const tempDir = Deno.makeTempDirSync();
      const themeDir = join(tempDir, "theme");
      Deno.mkdirSync(join(themeDir, "layouts"), { recursive: true });
      Deno.writeTextFileSync(join(themeDir, "theme.yaml"), `name: Demo\nversion: 1.0.0\n`);
      Deno.writeTextFileSync(join(themeDir, "layouts", "layout.tau"), `{@html content}`);

      const theme = await Theme.loadFromDirectory(themeDir);
      const outputDir = join(tempDir, "dist");
      await theme.copyAssets(outputDir);

      const assetsExist = await Deno.stat(join(outputDir, "assets"))
        .then(() => true)
        .catch(() => false);
      assertEquals(assetsExist, false);
    },
  });

  Deno.test({
    name: "theme: loadFromDirectory extends a local base theme by theme.yaml",
    permissions: { read: true, write: true, net: true },
    fn: async () => {
      const tempDir = Deno.makeTempDirSync();
      const baseDir = join(tempDir, "base");
      const childDir = join(tempDir, "child");
      Deno.mkdirSync(join(baseDir, "layouts"), { recursive: true });
      Deno.mkdirSync(join(baseDir, "components"), { recursive: true });
      Deno.mkdirSync(join(childDir, "layouts"), { recursive: true });

      Deno.writeTextFileSync(
        join(baseDir, "theme.yaml"),
        `name: Base\nversion: 1.0.0\ncomponents:\n  header: components/header.tau\ndefaultConfig:\n  accent: blue\n`,
      );
      Deno.writeTextFileSync(
        join(baseDir, "layouts", "layout.tau"),
        `<Header /><main>{@html content}</main>`,
      );
      Deno.writeTextFileSync(
        join(baseDir, "layouts", "post.tau"),
        `<article>{@html content}</article>`,
      );
      Deno.writeTextFileSync(join(baseDir, "components", "header.tau"), `<h1>{ site.title }</h1>`);

      Deno.writeTextFileSync(
        join(childDir, "theme.yaml"),
        `name: Child\nversion: 1.0.0\nextends: ../base\n`,
      );
      Deno.writeTextFileSync(
        join(childDir, "layouts", "layout.tau"),
        `<Header /><main class="custom">{@html content}</main>`,
      );

      const theme = await Theme.loadFromDirectory(childDir);
      assertEquals(theme.name, "Child");
      assertEquals(theme.config.accent, "blue");

      const layout = await theme.renderLayout("layout", "<p>x</p>", {
        site: { title: "My Site", description: "", author: "" },
      });
      assertStringIncludes(layout, 'class="custom"');
      assertStringIncludes(layout, "<h1>My Site</h1>");

      const post = await theme.renderLayout("post", "<p>x</p>", {});
      assertStringIncludes(post, "<article>");
    },
  });

  Deno.test({
    name: "theme: loadFromDirectory extends a bundled theme by specifier",
    permissions: { read: true, write: true, net: true },
    fn: async () => {
      const tempDir = Deno.makeTempDirSync();
      const themeDir = join(tempDir, "theme");
      Deno.mkdirSync(themeDir, { recursive: true });
      Deno.writeTextFileSync(
        join(themeDir, "theme.yaml"),
        `name: My Minimal\nversion: 1.0.0\nextends: jsr:@steno/theme-minimal\n`,
      );

      const theme = await Theme.loadFromDirectory(themeDir);
      assertEquals(theme.name, "My Minimal");

      const layout = await theme.renderLayout("layout", "<p>x</p>", {
        site: { title: "My Site", description: "", author: "" },
        theme: { name: theme.name, version: theme.version, ...theme.config },
      });
      assertStringIncludes(layout, "site-header");
    },
  });

  Deno.test({
    name: "theme: loadFromDirectory rejects a circular extends chain",
    permissions: { read: true, write: true, net: true },
    fn: async () => {
      const tempDir = Deno.makeTempDirSync();
      const aDir = join(tempDir, "a");
      const bDir = join(tempDir, "b");
      Deno.mkdirSync(join(aDir, "layouts"), { recursive: true });
      Deno.mkdirSync(join(bDir, "layouts"), { recursive: true });
      Deno.writeTextFileSync(join(aDir, "theme.yaml"), `name: A\nversion: 1.0.0\nextends: ../b\n`);
      Deno.writeTextFileSync(join(aDir, "layouts", "layout.tau"), `{@html content}`);
      Deno.writeTextFileSync(join(bDir, "theme.yaml"), `name: B\nversion: 1.0.0\nextends: ../a\n`);
      Deno.writeTextFileSync(join(bDir, "layouts", "layout.tau"), `{@html content}`);

      await assertRejects(() => Theme.loadFromDirectory(aDir), Error, "Circular");
    },
  });

  Deno.test({
    name: "theme: loadFromDirectory rejects an unrecognized extends specifier",
    permissions: { read: true, write: true, net: true },
    fn: async () => {
      const tempDir = Deno.makeTempDirSync();
      const themeDir = join(tempDir, "theme");
      Deno.mkdirSync(join(themeDir, "layouts"), { recursive: true });
      Deno.writeTextFileSync(
        join(themeDir, "theme.yaml"),
        `name: Demo\nversion: 1.0.0\nextends: some-package\n`,
      );
      Deno.writeTextFileSync(join(themeDir, "layouts", "layout.tau"), `{@html content}`);

      await assertRejects(
        () => Theme.loadFromDirectory(themeDir),
        Error,
        "not a recognized bundled theme",
      );
    },
  });

  Deno.test("theme: plugins defaults to empty array when not provided", () => {
    const theme = new Theme({
      name: "minimal",
      version: "1.0.0",
      layouts: { layout: `{@html content}` },
    });

    assertEquals(theme.plugins, []);
  });

  Deno.test("theme: plugins are exposed from themeData", () => {
    const plugin = { name: "test-plugin" };
    const theme = new Theme({
      name: "minimal",
      version: "1.0.0",
      layouts: { layout: `{@html content}` },
      plugins: [plugin],
    });

    assertEquals(theme.plugins.length, 1);
    assertEquals(theme.plugins[0].name, "test-plugin");
  });

  Deno.test("theme: schema defaults are applied when user config is missing fields", () => {
    const theme = new Theme({
      name: "minimal",
      version: "1.0.0",
      layouts: { layout: `{@html content}` },
      configSchema: {
        primaryColor: { type: "string", default: "#3b82f6" },
        showFooter: { type: "boolean", default: true },
      },
    });

    assertEquals(theme.config.primaryColor, "#3b82f6");
    assertEquals(theme.config.showFooter, true);
  });

  Deno.test("theme: user config overrides schema defaults", () => {
    const theme = new Theme(
      {
        name: "minimal",
        version: "1.0.0",
        layouts: { layout: `{@html content}` },
        configSchema: {
          primaryColor: { type: "string", default: "#3b82f6" },
        },
      },
      { primaryColor: "#ff0000" },
    );

    assertEquals(theme.config.primaryColor, "#ff0000");
  });

  Deno.test("theme: rejects values with the wrong schema type", () => {
    assertThrows(
      () =>
        new Theme(
          {
            name: "typed",
            version: "1.0.0",
            layouts: { layout: "" },
            configSchema: { columns: { type: "integer" } },
          },
          { columns: 2.5 },
        ),
      Error,
      'at "themeConfig.columns": expected integer, received number',
    );
  });

  Deno.test("theme: enforces required fields and value constraints", () => {
    const themeData = {
      name: "constrained",
      version: "1.0.0",
      layouts: { layout: "" },
      configSchema: {
        density: {
          type: "string" as const,
          required: true,
          enum: ["compact", "comfortable"],
        },
        width: { type: "number" as const, minimum: 320, maximum: 1920 },
      },
    };

    assertThrows(() => new Theme(themeData), Error, 'at "themeConfig.density": is required');
    assertThrows(
      () => new Theme(themeData, { density: "wide", width: 1200 }),
      Error,
      "must be one of",
    );
    assertThrows(
      () => new Theme(themeData, { density: "compact", width: 200 }),
      Error,
      "must be at least 320",
    );
  });

  Deno.test("theme: applies nested defaults and validates object arrays", () => {
    const theme = new Theme({
      name: "nested",
      version: "1.0.0",
      layouts: { layout: "" },
      configSchema: {
        navigation: {
          type: "object",
          additionalProperties: false,
          properties: {
            visible: { type: "boolean", default: true },
            links: {
              type: "array",
              default: [{ label: "Home", href: "/" }],
              minItems: 1,
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  label: { type: "string", required: true, minLength: 1 },
                  href: { type: "string", required: true, pattern: "^/" },
                },
              },
            },
          },
        },
      },
    });

    assertEquals(theme.config.navigation, {
      visible: true,
      links: [{ label: "Home", href: "/" }],
    });

    assertThrows(
      () =>
        new Theme(
          {
            name: "nested",
            version: "1.0.0",
            layouts: { layout: "" },
            configSchema: {
              links: {
                type: "array",
                items: { type: "string", pattern: "^/" },
              },
            },
          },
          { links: ["/docs", "external"] },
        ),
      Error,
      'at "themeConfig.links[1]": must match pattern',
    );
  });

  Deno.test("theme: permits undeclared top-level keys for compatibility", () => {
    const theme = new Theme(
      {
        name: "compatible",
        version: "1.0.0",
        layouts: { layout: "" },
        configSchema: { accent: { type: "string" } },
      },
      { customExtension: { enabled: true } },
    );

    assertEquals(theme.config.customExtension, { enabled: true });
  });

  const baseTheme: StenoTheme = {
    name: "base",
    version: "1.0.0",
    layouts: { layout: "<main/>", docs: "<docs/>" },
    components: { Header: "<h1/>" },
    assets: { "site.css": "body{}" },
    configSchema: { accent: { type: "string" } },
    defaultConfig: { accent: "blue" },
    plugins: [{ name: "base-plugin" }],
  };

  Deno.test("mergeTheme: keeps base layouts not re-declared by overrides", () => {
    const merged = mergeTheme(baseTheme, {
      layouts: { landing: "<landing/>" },
    });
    assertEquals(merged.layouts, {
      layout: "<main/>",
      docs: "<docs/>",
      landing: "<landing/>",
    });
  });

  Deno.test("mergeTheme: override layout replaces same-key base layout", () => {
    const merged = mergeTheme(baseTheme, {
      layouts: { layout: "<overridden/>" },
    });
    assertEquals(merged.layouts.layout, "<overridden/>");
    assertEquals(merged.layouts.docs, "<docs/>");
  });

  Deno.test("mergeTheme: merges assets, components, configSchema, defaultConfig by key", () => {
    const merged = mergeTheme(baseTheme, {
      assets: { "extra.js": "console.log(1)" },
      components: { Footer: "<footer/>" },
      configSchema: { title: { type: "string" } },
      defaultConfig: { title: "Untitled" },
    });
    assertEquals(merged.assets, {
      "site.css": "body{}",
      "extra.js": "console.log(1)",
    });
    assertEquals(merged.components, { Header: "<h1/>", Footer: "<footer/>" });
    assertEquals(Object.keys(merged.configSchema ?? {}).sort(), ["accent", "title"]);
    assertEquals(merged.defaultConfig, { accent: "blue", title: "Untitled" });
  });

  Deno.test("mergeTheme: overrides name/version when provided, else keeps base", () => {
    const merged = mergeTheme(baseTheme, { name: "extended" });
    assertEquals(merged.name, "extended");
    assertEquals(merged.version, "1.0.0");
  });

  Deno.test("mergeTheme: plugins replace wholesale, not concat", () => {
    const merged = mergeTheme(baseTheme, {
      plugins: [{ name: "override-plugin" }],
    });
    assertEquals(merged.plugins, [{ name: "override-plugin" }]);

    const keepsBase = mergeTheme(baseTheme, {});
    assertEquals(keepsBase.plugins, [{ name: "base-plugin" }]);
  });

  Deno.test("mergeTheme: does not throw when base or overrides omit optional fields", () => {
    const minimalBase: StenoTheme = {
      name: "bare",
      version: "1.0.0",
      layouts: { layout: "<main/>" },
    };
    const merged = mergeTheme(minimalBase, {});
    assertEquals(merged.layouts, { layout: "<main/>" });
    assertEquals(merged.assets, {});
    assertEquals(merged.components, {});
  });
}
