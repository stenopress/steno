# Recipes

Short, copy-pasteable answers to "how do I do X". Each recipe links back to the reference doc that
explains the mechanism in full, this page is about the goal, not the theory.

## Add an RSS feed, Atom feed, and sitemap

Add the official SEO plugin, no custom code needed:

```yaml
plugins:
  - package: jsr:@steno/plugin-seo
    options:
      siteUrl: https://example.com
      title: My Site
      description: A concise description
      authorName: Ada Lovelace
```

This writes `sitemap.xml`, `feed.xml` (RSS), and `atom.xml` from your pages on every build. See
[Plugins](plugins.md#using-an-official-plugin).

## Highlight code blocks

Add the official Shiki plugin:

```yaml
plugins:
  - package: jsr:@steno/plugin-shiki
    options:
      theme: github-dark
```

Every fenced code block in your Markdown (` ```ts `, ` ```html `, and so on) gets syntax
highlighted automatically, no per-page setup. See [Plugins](plugins.md#using-an-official-plugin).

## Resize and optimize images

Add the official image plugin:

```yaml
plugins:
  - package: jsr:@steno/plugin-image
    options:
      widths: [400, 800, 1200]
      formats: [webp]
      quality: 80
```

It processes images your theme references and swaps in optimized, appropriately sized versions. See
[Plugins](plugins.md#using-an-official-plugin).

## Build a blog listing page

Put your posts under `content/posts/`, each one becomes an item in `collections.posts`
automatically. List them from any layout or Markdown page's frontmatter-driven layout:

```html
<ul>
  {#each collections.posts.items as post}
  <li>
    <a href="{post.url}">{post.frontmatter.title}</a>
    {#if post.frontmatter.date}<time>{post.frontmatter.date | date}</time>{/if}
  </li>
  {/each}
</ul>
```

Want them newest first? Configure the collection instead of sorting by hand:

```yaml
collections:
  posts:
    sortBy: date
    order: desc
```

See [Collections](content.md#collections) for `limit`, `filter`, and frontmatter `schema` too.

## Add a custom 404 page

Create `content/404.md`, Steno writes it to `dist/404.html` automatically, the filename most static
hosts look for when a page is missing:

```markdown
---
title: Page not found
layout: layout
---

# Page not found

Sorry, that page doesn't exist. [Go home](/).
```

See [Routes and permalinks](content.md#routes-and-permalinks).

## Rename or move a page without breaking old links

Add an entry to `redirects` in config, this writes a small static HTML page at the old URL that
sends visitors to the new one:

```yaml
redirects:
  /old-post: /blog/new-post-name
```

See [Redirects](config_reference.md#redirects).

## Add dark mode

Steno doesn't have a special dark mode feature, this is plain CSS and a tiny bit of JavaScript in
your theme, the same as on any site. A common approach: default to the visitor's system preference
with `prefers-color-scheme`, and let a button override it by toggling a `data-theme` attribute:

```css
/* theme/assets/style.css */
:root {
  --bg: #fff;
  --fg: #111;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #111;
    --fg: #eee;
  }
}
:root[data-theme="dark"] {
  --bg: #111;
  --fg: #eee;
}
:root[data-theme="light"] {
  --bg: #fff;
  --fg: #111;
}
body {
  background: var(--bg);
  color: var(--fg);
}
```

```js
// theme/scripts/theme-toggle.ts
const stored = localStorage.getItem("theme");
if (stored) document.documentElement.dataset.theme = stored;

document.getElementById("theme-toggle")?.addEventListener("click", () => {
  const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  localStorage.setItem("theme", next);
});
```

Reference the compiled script from your layout through the `assets` map so it gets a cache-busted
URL automatically, see [Layout context](theme_development.md#layout-context):

```html
<script src="/assets/{assets['theme-toggle.js']}" defer></script>
<button id="theme-toggle">Toggle theme</button>
```

## Build a search index

A plugin's `afterBuild(config)` hook receives `config.pages`, an array of every generated page's
`slug`, `title`, `description`, and `date`, without having to re-scan `contentDir` yourself. Write
it to a JSON file your site's own JavaScript can fetch and search client side:

```ts
import type { StenoPlugin } from "jsr:@steno/steno";

export default function searchIndexPlugin(): StenoPlugin {
  return {
    name: "search-index",
    afterBuild: async (config) => {
      const index = (config.pages ?? []).map((page) => ({
        title: page.title,
        url: page.slug,
        description: page.description,
      }));
      await Deno.writeTextFile(`${config.output}/search-index.json`, JSON.stringify(index));
    },
  };
}
```

See [Transactional builds](atomic_builds.md#plugin-and-hook-paths) for why `config.output` (not a
hardcoded `dist/`) is the path to write to, a plugin writes into Steno's staging directory, not the
final output, so the write above is safe even if a later step in the same build fails.

## What to read next

- [Content](content.md) for everything collections and frontmatter support.
- [Plugins](plugins.md) for the full list of official plugins and how to write your own.
- [Themes and Tau](theme_development.md) for the template language used in the layout examples
  above.
