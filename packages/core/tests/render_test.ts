import { assertEquals, assertRejects, assertStringIncludes } from "@std/assert";
import { filters as tauFilters, render as renderTau, TauError } from "@steno/tau";
import {
  buildCollections,
  createPageContext,
  filters,
  parseFrontmatter,
  render,
  renderMarkdown,
  renderPage,
  Theme,
} from "../mod.ts";
import type { MarkdownPage, SiteConfig, StenoPlugin } from "../mod.ts";

Deno.test(
  "content rendering preserves body-transform order and page overrides without file IO",
  async () => {
    const config: SiteConfig = { title: "Site", description: "Description", author: "Author" };
    const sourceText = "---\ntitle: Article\nsteno:\n  globals:\n    label: page\n---\n# Hello";
    const parsed = parseFrontmatter(sourceText);
    const page: MarkdownPage = {
      ...parsed,
      sourceText,
      fullPath: "/not-on-disk/posts/article.md",
      relPath: "posts/article.md",
    };
    const calls: string[] = [];
    const plugin: StenoPlugin = {
      name: "decorate",
      transformAst(tokens) {
        calls.push("ast");
        return tokens;
      },
      transformHtml(html) {
        calls.push("body");
        assertEquals(html.includes("<main>"), false);
        return html + "<aside>Body hook</aside>";
      },
      beforeBuild() {
        throw new Error("Build hooks must not run during rendering");
      },
      afterPage() {
        throw new Error("Output hooks must not run during rendering");
      },
    };
    const htmlCache = new Map<string, string>();
    const collections = await buildCollections("/not-on-disk", config, [plugin], [page], {
      htmlCache,
    });
    const theme = new Theme({
      name: "shared",
      version: "1.0.0",
      layouts: { layout: "<main><h2>{title}:{globals.label}</h2>{@html content}</main>" },
    });
    const prepared = createPageContext({
      page,
      config,
      theme,
      siteHead: [],
      globals: { label: "site" },
      publicEnv: {},
      collections,
      data: {},
      assets: {},
    });
    const html = await renderPage({
      ...prepared,
      content: htmlCache.get(page.fullPath)!,
      theme,
      minify: false,
    });
    assertStringIncludes(html, "<main><h2>Article:page</h2><h1>Hello</h1>");
    assertStringIncludes(html, "<aside>Body hook</aside></main>");
    assertEquals(collections.posts.items[0].url, "/posts/article.html");
    assertEquals(calls, ["ast", "body"]);
    assertEquals(config.title, "Site");
    assertEquals(prepared.context.steno, undefined);
  },
);

Deno.test("Markdown filters belong to Core without modifying standalone Tau", async () => {
  assertEquals(Object.hasOwn(tauFilters, "markdown_inline"), false);
  assertEquals(
    await render({
      template: "{@html value | markdown_inline}",
      context: { value: "**Bold**" },
      components: {},
    }),
    "<strong>Bold</strong>",
  );
  await assertRejects(
    () =>
      renderTau({ template: "{value | markdown_inline}", context: { value: "x" }, components: {} }),
    TauError,
  );
  const previous = filters.markdown_inline;
  try {
    filters.markdown_inline = () => "custom";
    assertEquals(
      await render({
        template: "{value | markdown_inline}",
        context: { value: "x" },
        components: {},
      }),
      "custom",
    );
  } finally {
    filters.markdown_inline = previous;
  }
});

Deno.test("Markdown transforms retain diagnostic failures", async () => {
  await assertRejects(
    () =>
      renderMarkdown("# Page", [
        {
          name: "broken",
          transformHtml() {
            throw new Error("failure");
          },
        },
      ]),
    Error,
    'Plugin "broken"\'s transformHtml threw: failure',
  );
});
