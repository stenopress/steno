import { assertEquals, assertStringIncludes } from "@std/assert";
import example from "../../docs/examples/multi-layout/mod.ts";
import { Theme } from "./theme.ts";

Deno.test("documented composition example shares one shell across all layouts", async () => {
  const theme = new Theme(example);
  for (const layout of ["layout", "page", "article", "index", "section"]) {
    const html = await theme.renderLayout(layout, "<p>Compiled body</p>", {
      title: "Page <title>",
      description: "A & B",
      author: "Ada",
      collection: "guides",
      site: { title: "Example", description: "", author: "" },
      collections: {
        posts: {
          name: "posts",
          items: [{ frontmatter: { title: "First post" }, url: "/posts/first/", content: "" }],
        },
        guides: {
          name: "guides",
          items: [{ frontmatter: { title: "Guide" }, url: "/guides/start/", content: "" }],
        },
      },
    });

    assertEquals(html.match(/<!doctype html>/g)?.length, 1);
    assertEquals(html.match(/<main>/g)?.length, 1);
    assertStringIncludes(html, "<title>Page &lt;title&gt; · Example</title>");
    assertStringIncludes(html, '<meta name="description" content="A &amp; B"');
    assertStringIncludes(html, "<h1>Page &lt;title&gt;</h1>");
    assertStringIncludes(html, "<p>Compiled body</p>");
    assertStringIncludes(html, "<footer>Example</footer>");
    if (layout === "article") assertStringIncludes(html, "<p>By Ada</p>");
    if (layout === "index") {
      assertStringIncludes(html, '<a href="/posts/first/">First post</a>');
    }
    if (layout === "section") {
      assertStringIncludes(html, '<a href="/guides/start/">Guide</a>');
    }
  }
});

Deno.test(
  "composition example accepts missing optional metadata and empty collections",
  async () => {
    const theme = new Theme(example);
    for (const layout of ["article", "index", "section"]) {
      const html = await theme.renderLayout(layout, "", {
        title: "Empty",
        site: { title: "Example", description: "", author: "" },
        collections: {},
        collection: "missing",
      });
      assertEquals(html.includes('name="description"'), false);
      assertEquals(html.includes("By "), false);
      assertEquals(html.includes("<li>"), false);
    }
  },
);
