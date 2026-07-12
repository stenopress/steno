import { render } from "../src/utils/scribe.ts";

const posts = Array.from({ length: 20 }, (_, index) => ({
  title: `Post ${index + 1}`,
  excerpt: `Excerpt for post ${index + 1}`.repeat(2),
  published: index % 2 === 0,
}));

const simpleTemplate = `
<article>
  <h1>{title}</h1>
  <p>{description | truncate(120)}</p>
</article>
`;

const simpleContext = {
  title: "Steno Bench",
  description: "A small benchmark focused on the core Scribe render path. ".repeat(
    4,
  ),
};

const layoutTemplate = `
<main>
  <Header siteTitle={site.title} />
  <ul>
    {#each posts as post}
      {#if post.published}
        <li>
          <Card title={post.title} excerpt={post.excerpt} />
        </li>
      {/if}
    {/each}
  </ul>
</main>
`;

const complexContext = {
  site: { title: "Steno" },
  posts,
};

const components = {
  Header: "<h1>{siteTitle}</h1>",
  Card: "<article><h2>{title}</h2><p>{excerpt | truncate(80)}</p></article>",
};

const thousandItems = Array.from({ length: 1000 }, (_, index) => ({
  title: `Item ${index + 1}`,
  excerpt: `Excerpt ${index + 1}`.repeat(4),
}));

const largeListTemplate = `
<section>
  <ul>
    {#each items as item}
      <li><Row title={item.title} excerpt={item.excerpt} /></li>
    {/each}
  </ul>
</section>
`;

const deepTree = Array.from({ length: 10 }, (_, sectionIndex) => ({
  name: `Section ${sectionIndex + 1}`,
  groups: Array.from({ length: 10 }, (_, groupIndex) => ({
    name: `Group ${groupIndex + 1}`,
    posts: Array.from({ length: 10 }, (_, postIndex) => ({
      title: `Post ${sectionIndex}-${groupIndex}-${postIndex}`,
      tags: ["perf", "deno", "scribe", `tag-${postIndex % 5}`],
    })),
  })),
}));

const nestedTemplate = `
<main>
  {#each sections as section}
    <SectionHeader title={section.name} />
    {#each section.groups as group}
      <GroupHeader title={group.name} />
      {#each group.posts as post}
        <article>
          <Post title={post.title} />
          <ul>
            {#each post.tags as tag}
              <li>{tag}</li>
            {/each}
          </ul>
        </article>
      {/each}
    {/each}
  {/each}
</main>
`;

const deepComponents = {
  SectionHeader: "<h2>{title}</h2>",
  GroupHeader: "<h3>{title}</h3>",
  Post: "<p>{title}</p>",
};

const unclosedTemplate = `
<main>
  {#if true}
    <p>broken template</p>
</main>
`;

Deno.bench(
  "scribe render (simple)",
  { group: "scribe", baseline: true },
  () => {
    render({
      template: simpleTemplate,
      context: simpleContext,
      components: {},
    });
  },
);

Deno.bench("scribe render (components + loops)", { group: "scribe" }, () => {
  render({
    template: layoutTemplate,
    context: complexContext,
    components,
  });
});

Deno.bench(
  "scribe render (list of 1000 items)",
  { group: "scribe-scale", baseline: true },
  () => {
    render({
      template: largeListTemplate,
      context: { items: thousandItems },
      components: {
        Row: "<article><h4>{title}</h4><p>{excerpt | truncate(60)}</p></article>",
      },
    });
  },
);

Deno.bench("scribe render (4-level nested loops)", { group: "scribe-scale" }, () => {
  render({
    template: nestedTemplate,
    context: { sections: deepTree },
    components: deepComponents,
  });
});

Deno.bench(
  "scribe render (unclosed tag fails fast)",
  { group: "scribe-errors", baseline: true },
  () => {
    try {
      render({
        template: unclosedTemplate,
        context: {},
        components: {},
      });
    } catch {
      // expected
    }
  },
);
