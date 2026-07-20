import { assertEquals, assertStringIncludes, assertThrows } from "@std/assert";
import { join } from "@std/path";
import { Theme } from "./theme.ts";

export function registerThemeTests(): void {
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

  Deno.test("theme: renderLayout receives page/site/theme context", () => {
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

    const out = theme.renderLayout("layout", "<p>Body</p>", {
      title: "Post",
      site: { title: "Site" },
      theme: { author: "theme-author" },
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

      await theme.copyAssets(tempDir);

      const css = Deno.readTextFileSync(join(tempDir, "assets", "style.css"));
      const bin = Deno.readFileSync(
        join(tempDir, "assets", "images", "pixel.bin"),
      );

      assertStringIncludes(css, "color: red");
      assertEquals(Array.from(bin), [1, 2, 3]);
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
      Deno.writeTextFileSync(
        join(themeDir, "layouts", "layout.tau"),
        `<Header />{@html content}`,
      );
      Deno.writeTextFileSync(
        join(themeDir, "layouts", "legacy.liquid"),
        `This must not be loaded as Tau.`,
      );
      Deno.writeTextFileSync(
        join(themeDir, "components", "header.tau"),
        `<h1>{ site.title }</h1>`,
      );
      Deno.writeTextFileSync(join(themeDir, "assets", "style.css"), `body {}`);

      const theme = Theme.loadFromDirectory(themeDir, { author: "override" });
      const rendered = theme.renderLayout("layout", "<p>x</p>", {
        site: { title: "My Site" },
        theme: { author: theme.config.author },
      });

      assertStringIncludes(rendered, "<h1>My Site</h1>");
      assertThrows(
        () => theme.renderLayout("legacy", "", {}),
        Error,
        'Layout "legacy" not found',
      );

      const outputDir = join(tempDir, "dist");
      await theme.copyAssets(outputDir);
      const copied = Deno.readTextFileSync(
        join(outputDir, "assets", "style.css"),
      );
      assertEquals(copied, "body {}");
      assertEquals(theme.config.author, "override");
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
}
