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
under `env`. Do not put secrets in variables with that prefix: they are
available to rendered pages.
