# Content, data, and collections

Every page on a Steno site starts as a Markdown file under `contentDir` (`content/` by default).
This page covers everything you can do with those files: frontmatter, routes, data, and grouping
pages into collections.

## Frontmatter

Frontmatter is the block at the top of a Markdown file, between `---` lines, that sets per-page
details like a title or a date. It uses YAML by default (`+++` for TOML instead, if you prefer
that):

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

Every field here is optional. Steno passes frontmatter straight to your theme's layout, so a theme
can use `title`, `date`, `tags`, or any other field you add. A page's title falls back to the first
Markdown heading, then to the site title, if you don't set `title` yourself.

Set `draft: true` to keep working on a page without publishing it: it is skipped in production
builds (`steno build`) but still shows up while you are developing (`steno dev`), so you can preview
it yourself.

Steno scans every Markdown file under `contentDir`, except the `.steno` folder itself.

## Routes and permalinks

Steno turns your file layout into URLs automatically, so `content/guides/setup.md` becomes the page
at `/guides/setup`. With `shortUrls: true` in config, that is written to
`dist/guides/setup/index.html` (a clean URL with no `.html` in it); otherwise it is written to
`dist/guides/setup.html`.

If a page needs a URL that doesn't match its file location, set `steno.permalink`:

```yaml
---
title: About us
steno:
  permalink: /about/
---
```

A permalink ending in `/` writes an `index.html` inside that folder; one ending in `.html` writes
exactly that file. For safety, a permalink cannot contain a protocol, query string, fragment,
backslash, or `..` path traversal, those are rejected.

Add a `content/404.md` file and Steno automatically writes it to `dist/404.html`, the file most
static hosts look for when a page is missing.

## Per-page configuration

Sometimes one page needs to override a site-wide setting, like its own `<head>` tags or a different
theme option, without changing it for every other page. Do that with a `steno` block in frontmatter.
It supports `title`, `description`, `author`, `head`, `navigation`, `themeConfig`, `globals`, and
`permalink`:

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

`themeConfig` here is merged with your site's `themeConfig` and still checked against the theme's
rules, just for this one page. `globals` works the same way. Things that apply to the whole project,
like `contentDir`, `output`, plugins, redirects, or which theme is active, cannot be changed from a
single page; those only live in the site config. The `steno` block itself is never passed to
templates; only the fields you set inside it are.

## Markdown includes

Write `{@include "snippet.md"}` inside a Markdown file to pull another file's content in at that
spot, before Markdown is even parsed. Steno looks for the file next to the current one first, then
falls back to `contentDir`. An absolute path is rejected, and including a file that (directly or
indirectly) includes itself back is an error rather than an infinite loop.

## Data files

Drop a `.json`, `.yaml`, `.yml`, or `.toml` file into `content/_data/` and its contents become
available to every template as `data`. The file's path becomes a nested key, so you can organize
data files into folders:

```text
content/_data/team.json              becomes data.team
content/_data/blog/authors.yaml      becomes data.blog.authors
```

A data file that fails to read or parse (invalid JSON/YAML/TOML) is reported as a
`[data-file-invalid]` diagnostic - fatal for `steno build`, printed but non-fatal for `steno dev`;
see [How Steno reports problems](troubleshooting.md#how-steno-reports-problems).

## Public assets

Anything in `content/public/` is copied to the output as-is, with the same folder structure, no
processing at all. Use it for things like a favicon or files a theme doesn't manage for you:

```text
content/public/favicon.ico           becomes dist/favicon.ico
content/public/css/style.css         becomes dist/css/style.css
```

This folder is never scanned for Markdown. Rename it with `publicDir` in config, or turn it off
entirely with `publicDir: false`. If a public file would overwrite a page or a theme asset, the
build fails loudly instead of silently overwriting something.

## Collections

A collection is an automatic grouping of pages by folder: every page inside `content/posts/` becomes
an item in `collections.posts`, every page inside `content/docs/` becomes an item in
`collections.docs`, and so on. Pages directly inside `content/` (not in any subfolder) don't belong
to a collection. Each item carries its `url`, its `frontmatter`, and its rendered HTML as `content`.

By default a collection includes every page in its folder, in no particular order. Configure it
under `collections` in your site config to change that:

```yaml
collections:
  posts:
    sortBy: date
    order: desc
    limit: 10
    filter: { draft: false }
    schema:
      title: { type: string }
      date: { type: string }
      tags: { type: array, required: false }
```

- `sortBy` names a frontmatter field to sort by (its values are compared as text; an item missing
  that field sorts last).
- `order` is `asc` or `desc`.
- `limit` keeps only the first N items, after sorting and filtering.
- `filter` keeps only items whose frontmatter matches every key/value pair listed (an exact match,
  not a partial one).
- `schema` validates frontmatter across every item in the collection: each field must be `string`,
  `number`, `boolean`, or `array`, and is required unless you set `required: false`.

Use a collection from a layout like any other list:

```html
{#each collections.posts.items as post}
  <a href="{post.url}">{post.frontmatter.title}</a>
{/each}
```

## Public environment variables

An environment variable whose name starts with `PUBLIC_` is available in every template, both
directly by name and under `env`. Steno reads `.env`, then `.env.local`, then `.env.development` or
`.env.production` depending on whether you ran `dev` or `build`, then a matching `.env.<name>.local`
file, each one able to override values from the ones before it. A variable already set in your shell
takes priority over all of them.

Only `PUBLIC_*` variables ever reach a template. Keep secrets, API keys, and anything else sensitive
out of variables with that prefix; they are meant to be visible in the built HTML. Add `.env.local`
and `.env.*.local` to `.gitignore` so your own local overrides never get committed.

Each `.env` file is plain `KEY=value` lines. A key must match `^[A-Za-z_][A-Za-z0-9_]*$`, an
optional leading `export` is allowed and ignored, blank lines and lines starting with `#` are
skipped, and an unquoted value can end with a `# comment` that gets stripped. Wrap a value in double
quotes to use escapes like `\n`; single quotes take the value literally, with no escaping.

## Redirects

See [Redirects](config_reference.md#redirects) for how `redirects` entries in config turn into
output pages.
