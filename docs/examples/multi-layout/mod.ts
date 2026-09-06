import type { StenoTheme } from "../../../mod.ts";

const page = `<Base title={title} description={description}>
  <h1>{title}</h1>
  {@html content}
</Base>`;

export default {
  name: "composition-example",
  version: "1.0.0",
  layouts: {
    layout: page,
    page,
    article: `<Base title={title} description={description}>
  <article>
    <h1>{title}</h1>
    {#if author}<p>By {author}</p>{/if}
    {@html content}
  </article>
</Base>`,
    index: `<Base title={title} description={description}>
  <h1>{title}</h1>
  {@html content}
  <EntryList entries={collections.posts?.items} />
</Base>`,
    section: `<Base title={title} description={description}>
  <section>
    <h1>{title}</h1>
    {@html content}
    <EntryList entries={collections[collection]?.items} />
  </section>
</Base>`,
  },
  components: {
    Base: `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{title} · {site.title}</title>
    {#if description}<meta name="description" content="{description}" />{/if}
  </head>
  <body>
    <header><a href="/">{site.title}</a></header>
    <main>{@children}</main>
    <footer>{site.title}</footer>
  </body>
</html>`,
    EntryList: `<ul>
  {#if entries}
    {#each entries as entry}
      <li><a href="{entry.url}">{entry.frontmatter.title}</a></li>
    {/each}
  {/if}
</ul>`,
  },
} satisfies StenoTheme;
