# Content, data, and collections

Steno scans Markdown files under `contentDir` recursively, excluding `.steno`.
YAML frontmatter uses `---`; TOML uses `+++`. Frontmatter is exposed directly to
layouts and retained as `CollectionItem.frontmatter`.

```markdown
---
title: Building a site
date: 2026-07-18
tags: [deno, ssg]
draft: false
layout: article
---

# Building a site
```

Pages marked `draft: true` are omitted from production builds but rendered in
development. A page's title is frontmatter `title`, an inferred Markdown title,
or the site title.

## Routes and permalinks

Markdown paths define routes automatically. With `shortUrls: true`,
`content/guides/setup.md` is written to `dist/guides/setup/index.html` and uses
the public URL `/guides/setup`.

Use `steno.permalink` when a page needs a stable route independent of its source
file:

```yaml
---
title: About us
steno:
  permalink: /about/
---
```

Trailing-slash permalinks emit an `index.html`; explicit `.html` permalinks emit
that exact file. Protocols, query strings, fragments, backslashes, and path
traversal are rejected. A root `content/404.md` automatically emits
`dist/404.html`, as expected by common static hosts.

## Per-page configuration

Use the reserved `steno` frontmatter namespace to override presentation-facing
configuration for one page. Supported fields are `title`, `description`,
`author`, `head`, `navigation`, `themeConfig`, `globals`, and `permalink`:

```yaml
---
title: Product announcement
steno:
  description: Page-specific search description
  head:
    - property: og:title
      content: Product announcement
    - tag: script
      src: /assets/product.js
      defer: true
  themeConfig:
    density: compact
  globals:
    campaign: launch
---
```

`themeConfig` is shallowly merged with the configured theme values and checked
against the theme's `configSchema`. `globals` is shallowly merged and remains
available both directly and under `globals`. Operational settings such as
`contentDir`, `output`, plugins, redirects, and the theme package cannot be
changed by a page. The `steno` namespace itself is reserved and is not exposed
to templates.

## Markdown includes

Use `{@include "snippet.md"}` in Markdown to inline another file before Markdown
parsing. Steno first resolves it relative to the current file, then relative to
`contentDir`. Absolute paths are rejected and circular includes throw an error.

## Data files

Files in `content/_data/` with `.json`, `.yaml`, `.yml`, or `.toml` extensions
become the `data` template value. Relative paths create nested keys:

```text
content/_data/team.json              → data.team
content/_data/blog/authors.yaml      → data.blog.authors
```

## Collections

Every first-level content directory becomes a collection. For example,
`content/posts/welcome.md` contributes an item to `collections.posts`; root
pages do not. Each item has `url`, `frontmatter`, and rendered HTML `content`.

Configure filtering, sorting, limiting, and frontmatter validation in
[`collections`](config_reference.md#configuration-reference). Filters require
strict equality. Sorting compares string representations; missing values sort
last. Schema fields are required unless `required: false`.

Use collections in a layout:

```html
{#each collections.posts.items as post}
  <a href={post.url}>{post.frontmatter.title}</a>
{/each}
```

## Public environment variables

Environment variables prefixed `PUBLIC_` are provided to templates directly and
under `env`. Steno loads `.env`, `.env.local`, `.env.development` or
`.env.production`, and the matching `.env.<environment>.local` file in that
order. `dev` selects `development`; `build` selects `production`. Later files
override earlier files, while variables already present in the process have the
highest precedence.

Only `PUBLIC_*` values are rendered into templates. Do not put secrets in
variables with that prefix. Add `.env.local` and `.env.*.local` to `.gitignore`.
