import { marked } from "marked";
import { parseFrontmatter } from "../src/utils/frontmatter.ts";
import { render } from "../src/utils/tau.ts";
import { createPageContext, renderMarkdown, renderPage, Theme } from "@steno/core";

const paragraph = "Steno benchmark content for realistic end-to-end rendering.";
const standardBody = Array.from({ length: 80 }, () => paragraph).join("\n\n");
const largeBody = Array.from({ length: 400 }, () => paragraph).join("\n\n");

const pageTemplate = `
---
title: "Benchmark Post"
author: "Steno"
tags:
  - benchmark
  - pipeline
---
${standardBody}
`;

const largePageTemplate = `
---
title: "Large Benchmark Post"
author: "Steno"
tags:
  - benchmark
  - pipeline
---
${largeBody}
`;

const layoutTemplate = `
<!DOCTYPE html>
<html>
  <head>
    <title>{title}</title>
  </head>
  <body>
    <Header siteTitle={site.title} author={author} />
    <article>{@html content}</article>
    <Footer tags={tags} />
  </body>
</html>
`;

const components = {
  Header: "<header><h1>{siteTitle}</h1><p>{author}</p></header>",
  Footer: "<footer>{#each tags as tag}<span>{tag}</span>{/each}</footer>",
};

const sharedTheme = new Theme({
  name: "benchmark",
  version: "1.0.0",
  layouts: { layout: layoutTemplate },
  components,
});

Deno.bench("core (prepared page context->layout)", { group: "pipeline" }, async () => {
  const { frontmatter, body } = parseFrontmatter(pageTemplate);
  const content = await renderMarkdown(body, []);
  const prepared = createPageContext({
    page: { frontmatter, relPath: "posts/benchmark.md" },
    config: { title: "Steno", description: "", author: "" },
    theme: sharedTheme,
    siteHead: [],
    globals: {},
    publicEnv: {},
    collections: {},
    data: {},
    assets: {},
  });
  await renderPage({ ...prepared, content, theme: sharedTheme, minify: false });
});

async function runPagePipeline(markdown: string): Promise<string> {
  const { frontmatter, body } = parseFrontmatter(markdown);
  const bodyHtml = marked.parse(body);

  return await render({
    template: layoutTemplate,
    context: {
      site: { title: "Steno" },
      content: bodyHtml,
      ...frontmatter,
    },
    components,
  });
}

Deno.bench(
  "pipeline (typical page parse->markdown->tau)",
  { group: "pipeline", baseline: true },
  async () => {
    await runPagePipeline(pageTemplate);
  },
);

Deno.bench(
  "pipeline (large page parse->markdown->tau)",
  {
    group: "pipeline",
  },
  async () => {
    await runPagePipeline(largePageTemplate);
  },
);
