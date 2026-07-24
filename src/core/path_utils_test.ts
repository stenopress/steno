import { assertEquals, assertThrows } from "@std/assert";
import { join } from "@std/path";
import type { MarkdownPage } from "./collections.ts";
import { resolvePageOutputPath, resolvePageRoute } from "./path_utils.ts";

function page(
  relPath: string,
  frontmatter: Record<string, unknown> = {},
): MarkdownPage {
  return {
    fullPath: `/content/${relPath}`,
    relPath,
    sourceText: "",
    frontmatter,
    body: "",
  };
}

export function registerPathUtilsTests(): void {
  Deno.test("routes: preserve existing short and HTML route behavior", () => {
    assertEquals(resolvePageRoute(page("index.md"), true), {
      url: "/",
      outputPath: "index.html",
    });
    assertEquals(resolvePageRoute(page("guides/setup.md"), true), {
      url: "/guides/setup",
      outputPath: "guides/setup/index.html",
    });
    assertEquals(resolvePageRoute(page("guides/setup.md"), false), {
      url: "/guides/setup.html",
      outputPath: "guides/setup.html",
    });
  });

  Deno.test("routes: root 404 page uses static-host compatible output", () => {
    assertEquals(resolvePageRoute(page("404.md"), true), {
      url: "/404.html",
      outputPath: "404.html",
    });
    assertEquals(resolvePageRoute(page("404.md"), false), {
      url: "/404.html",
      outputPath: "404.html",
    });
  });

  Deno.test("routes: explicit permalinks support clean and exact URLs", () => {
    assertEquals(
      resolvePageRoute(page("company.md", { permalink: "/about/" }), true),
      { url: "/about/", outputPath: "about/index.html" },
    );
    assertEquals(
      resolvePageRoute(
        page("legacy.md", { permalink: "/company/history.html" }),
        true,
      ),
      {
        url: "/company/history.html",
        outputPath: "company/history.html",
      },
    );
    assertEquals(
      resolvePageRoute(page("landing.md", { permalink: "/" }), true),
      { url: "/", outputPath: "index.html" },
    );
    assertEquals(
      resolvePageRoute(page("company.md", { permalink: "/about" }), false),
      { url: "/about", outputPath: "about/index.html" },
    );
  });

  Deno.test("routes: steno.permalink overrides the top-level field", () => {
    assertEquals(
      resolvePageRoute(
        page("company.md", {
          permalink: "/old/",
          steno: { permalink: "/new/" },
        }),
        true,
      ),
      { url: "/new/", outputPath: "new/index.html" },
    );
  });

  Deno.test("routes: output paths stay beneath the configured directory", () => {
    assertEquals(
      resolvePageOutputPath(
        "site-output",
        page("company.md", { permalink: "/about/" }),
        true,
      ),
      join("site-output", "about", "index.html"),
    );
    for (
      const permalink of [
        "../escape",
        "/safe/../escape",
        "https://example.com/page",
        "/page?draft=true",
        "/page#section",
        String.raw`\windows\path`,
      ]
    ) {
      assertThrows(
        () => resolvePageRoute(page("unsafe.md", { permalink }), true),
        Error,
        "Invalid permalink",
      );
    }
  });
}
