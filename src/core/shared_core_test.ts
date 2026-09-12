import { assertEquals, assertStrictEquals } from "@std/assert";
import { join } from "@std/path";
import { createPageContext, renderMarkdown, renderPage, Theme as CoreTheme } from "@steno/core";
import { filters as coreFilters, render as coreRender } from "@steno/core/template";
import { TauError as CoreTauError } from "@steno/tau";
import { filters, render, TauError, Theme } from "../../mod.ts";
import { buildSite } from "./build/build.ts";
import type { SiteConfig, StenoPlugin } from "../types.ts";

Deno.test("extraction: legacy exports retain registry, renderer, and error identity", () => {
  assertStrictEquals(filters, coreFilters);
  assertStrictEquals(render, coreRender);
  assertStrictEquals(TauError, CoreTauError);
});

Deno.test(
  "extraction: directory-loaded themes retain the legacy constructor identity",
  async () => {
    const dir = await Deno.makeTempDir({ prefix: "steno-theme-identity-" });
    try {
      await Deno.mkdir(join(dir, "layouts"));
      await Deno.writeTextFile(join(dir, "theme.yaml"), "name: identity\nversion: 1.0.0\n");
      await Deno.writeTextFile(join(dir, "layouts/layout.tau"), "{@html content}");
      const theme = await Theme.loadFromDirectory(dir);
      assertEquals(theme instanceof Theme, true);
      assertEquals(theme instanceof CoreTheme, true);
      assertEquals(await theme.renderLayout("layout", "<p>Body</p>", {}), "<p>Body</p>");
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
);

Deno.test("extraction: Steno and an in-memory Core caller produce identical pages", async () => {
  const root = await Deno.makeTempDir({ prefix: "steno-shared-core-" });
  try {
    const contentDir = join(root, "content");
    await Deno.mkdir(contentDir);
    const config: SiteConfig = {
      title: "Shared",
      description: "Shared rendering",
      author: "Steno",
      contentDir,
      output: join(root, "dist"),
      minify: false,
      head: [{ name: "description", content: "shared" }],
    };
    const themeData = {
      name: "fixture",
      version: "1.0.0",
      layouts: { layout: "<html><head></head><body><h2>{title}</h2>{@html content}</body></html>" },
    };
    const body = "# Shared body";
    const page = {
      fullPath: join(contentDir, "index.md"),
      relPath: "index.md",
      sourceText: body,
      body,
      frontmatter: { title: "Page" },
    };
    let written = 0;
    const plugin: StenoPlugin = {
      name: "fixture",
      transformHtml: (html) => html + "<footer>Transformed</footer>",
      afterPage() {
        written++;
      },
    };
    await buildSite({
      config,
      theme: new Theme(themeData),
      plugins: [plugin],
      hooks: {},
      pages: [page],
    });
    const theme = new CoreTheme(themeData);
    const prepared = createPageContext({
      page,
      config,
      theme,
      siteHead: config.head!,
      globals: {},
      publicEnv: {},
      collections: {},
      data: {},
      assets: {},
    });
    const html = await renderPage({
      ...prepared,
      content: await renderMarkdown(body, [plugin]),
      theme,
      minify: false,
    });
    assertEquals(await Deno.readTextFile(join(config.output!, "index.html")), html);
    assertEquals(written, 1);
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});
