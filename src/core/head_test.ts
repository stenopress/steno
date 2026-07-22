import { assertEquals, assertStringIncludes, assertThrows } from "@std/assert";
import {
  injectHeadTags,
  mergeHeadTags,
  renderHeadTags,
  validateHeadTags,
} from "./head.ts";

export function registerHeadTests(): void {
  Deno.test("head: renders meta, Open Graph, links and scripts", () => {
    const tags = validateHeadTags([
      { name: "description", content: 'Fast & "small"' },
      { property: "og:type", content: "website" },
      { tag: "link", rel: "canonical", href: "https://example.com" },
      { tag: "script", src: "/app.js", defer: true },
      { tag: "script", type: "application/ld+json", content: "</script>" },
    ]);
    const html = renderHeadTags(tags);

    assertStringIncludes(
      html,
      '<meta name="description" content="Fast &amp; &quot;small&quot;">',
    );
    assertStringIncludes(html, '<meta property="og:type" content="website">');
    assertStringIncludes(
      html,
      '<link rel="canonical" href="https://example.com">',
    );
    assertStringIncludes(html, '<script src="/app.js" defer></script>');
    assertStringIncludes(html, "<\\/script>");
  });

  Deno.test("head: page tags replace stable site identities", () => {
    const merged = mergeHeadTags(
      [
        { name: "description", content: "Site" },
        { property: "og:title", content: "Site" },
        { tag: "script", src: "/app.js" },
      ],
      [
        { name: "description", content: "Page" },
        { property: "og:title", content: "Page" },
        { tag: "script", src: "/app.js", defer: true },
        { key: "analytics", tag: "script", content: "track()" },
      ],
    );

    assertEquals(merged.length, 4);
    assertEquals(merged[0], { name: "description", content: "Page" });
    assertEquals(merged[1], { property: "og:title", content: "Page" });
    assertEquals(merged[2], { tag: "script", src: "/app.js", defer: true });
  });

  Deno.test("head: injects before head close or creates a head", () => {
    assertEquals(
      injectHeadTags(
        "<html><head><title>X</title></head><body></body></html>",
        [
          { name: "robots", content: "index" },
        ],
      ),
      '<html><head><title>X</title><meta name="robots" content="index">\n</head><body></body></html>',
    );
    assertStringIncludes(
      injectHeadTags("<html><body>Page</body></html>", [
        { property: "og:type", content: "article" },
      ]),
      '<head>\n<meta property="og:type" content="article">\n</head>\n<body>',
    );
  });

  Deno.test("head: rejects malformed entries with a precise path", () => {
    assertThrows(
      () => validateHeadTags([{ tag: "script", defer: true }]),
      Error,
      'at "head[0]": script tags require src or content',
    );
    assertThrows(
      () => validateHeadTags([{ property: "og:title" }]),
      Error,
      'at "head[0].content": expected a string',
    );
  });
}
