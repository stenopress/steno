# Themes and Tau

This page covers directory-based themes: a folder with a `theme.yaml`, built with Tau templates,
loaded from a local path. For themes authored as a `mod.ts` module (including how Steno resolves a
`theme` specifier, and the `StenoTheme` shape either kind of theme produces), see the
[Theme specification](theme-specification.md). For the template language itself (expressions,
filters, control flow), see [Tau syntax](tau_syntax.md).

A local theme is a directory with layouts, optional registered components, and optional assets:

```text
theme/
├── theme.yaml
├── layouts/
│   └── layout.tau
├── components/
│   └── Header.tau
├── scripts/
│   └── site.ts
└── assets/
    └── site.css
```

```yaml
# theme.yaml
name: example-theme
version: 1.0.0
components:
  header: components/Header.tau
defaultConfig:
  brand: Steno
configSchema:
  showSearch: { type: boolean, default: true, description: Show search }
  density: { type: string, enum: [compact, comfortable], default: comfortable }
  social:
    type: object
    properties:
      github: { type: string, pattern: "^https://github\\.com/" }
```

Layout files use the `.tau` extension; their base filename is the layout name. A page without
`layout` uses `layout`, so it needs `layouts/layout.tau`. Components must be declared in
`theme.yaml`; their declared key is capitalized when loaded (`header` becomes `<Header />`). Assets
are copied to `<output>/assets/`.

Point a project at this theme with `theme: ./theme` (or wherever the folder lives, relative to the
config file) in `content/.steno/config.yml`. See [Resolution](theme-specification.md#resolution) for
every specifier form `theme` accepts, and [Configuration](config_reference.md) for `themeConfig`.

Add `extends: jsr:@steno/theme-minimal` (or a local path to another `theme.yaml` directory) to
`theme.yaml` to override just a layout or two instead of building a theme from scratch - see
[Extending a directory theme](theme-specification.md#extending-a-directory-theme).

## Scripts

`scripts/*.ts`/`*.tsx` are transpiled to JavaScript and merged into the theme's assets, so
`scripts/site.ts` is reachable at `/assets/site.js` - `scripts/foo/bar.ts` is flattened the same
way, to `/assets/bar.js`. Existing `scripts/*.js`/`*.jsx` are copied through unchanged. This only
applies to directory-based themes (`theme.yaml`); a theme authored as a `mod.ts` module already has
full control over how it builds its own `assets` map. Omit `scripts/` entirely if a theme has no
need for it - there's no cost either way.

## Layout context

Every layout receives `content` (compiled Markdown), `site`, `theme`, `data`, `collections`, `env`,
`globals`, `assets`, public environment variables, and all page frontmatter. `theme` contains its
name/version plus merged configuration. Writing a TypeScript helper that builds part of this context
yourself (outside `.tau` templates, which aren't typed)? Import `PageRenderContext` from
`@steno/steno` for the same shape, with autocomplete.

`assets` maps each theme asset's source-relative path (as written in `assets/` or `scripts/`) to its
output filename. CSS and JS assets are written under a content-hashed filename by default
(`site.css` -> `site.a1b2c3d4.css`) so a redeploy with changed styles or scripts gets a new URL
automatically - no CDN cache purge needed. Set `hashAssets: false` in the site config to keep source
filenames as-is. CSS assets are also minified by default; set `minify: { css: false }` to keep
source formatting as-is. Reference assets through this map rather than hardcoding the source
filename either way:

```html
<!doctype html>
<title>{title} · {site.title}</title>
<link rel="stylesheet" href="/assets/{assets['site.css']}" />
<header title="{site.title}" />
<article>{@html content}</article>
```

Component contexts include their props plus `site`, `theme`, `globals`, and the global values
themselves. They do not implicitly inherit arbitrary page frontmatter.

## Tau syntax

Expressions are JavaScript expressions and are HTML-escaped:

```html
<h1>{title | upper}</h1>
{#if date}
<time>{date | date}</time>
{:else}
<span>Undated</span>
{/if} {#each tags as tag, index}<span>{index}: {tag}</span>{/each}
```

Use `{@html expression}` only for trusted HTML, such as Steno's generated `content`. Built-in
filters are `date`, `truncate(length)`, `upper`, and `lower`; see
[Built-in filters](tau_syntax.md#built-in-filters) for their defaults and edge-case behavior. Invoke
a component with `<Header />`; props may be literals, expressions (`title={title}`), or shorthand
(`{title}`).

`{@include "name"}` in a theme resolves a registered component name through the theme renderer. For
Markdown source-file includes, see [Content](content.md).

## Sharing boilerplate across layouts

For a theme with article, page, index, and section layouts, use **component composition**: put the
document shell in a registered `Base` component, and let each layout supply its body as children.
This is the recommended pattern for sharing a base layout in Tau. Template-level `extends` and
block overrides are not required; `extends` in `theme.yaml` instead merges entire themes.

```yaml
# theme.yaml
components:
  base: components/Base.tau
```

```html
<!-- components/Base.tau -->
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>{title} · {site.title}</title>
  </head>
  <body>
    <header><a href="/">{site.title}</a></header>
    <main>{@children}</main>
    <footer>{site.title}</footer>
  </body>
</html>
```

```html
<!-- layouts/article.tau -->
<Base title={title}>
  <article>
    <h1>{title}</h1>
    {#if author}<p>By {author}</p>{/if}
    {@html content}
  </article>
</Base>
```

The child markup is rendered in the calling layout's context, so it can read `author`, `content`,
and collections. `Base` receives `title` explicitly, plus the shared `site`, `theme`, and globals.
It emits the already-rendered body with `{@children}` (equivalent to `{@html children}`); writing
`{children}` would escape the HTML. Keep the document tags in `Base` so each output has exactly one
document shell.

Use the same wrapper in every layout and extract repeated body fragments into smaller components:

| Template              | Responsibility                                                        |
| --------------------- | --------------------------------------------------------------------- |
| `Base` component      | Document, head metadata, site header, main, footer                    |
| `article` layout      | Article heading, byline, compiled Markdown                            |
| `page` layout         | Page heading and compiled Markdown                                    |
| `index` layout        | Introductory Markdown and `collections.posts.items`                   |
| `section` layout      | Section introduction and `collections[collection].items`              |
| `EntryList` component | List markup shared by index and section; receives `entries` as a prop |

For section pages, set `collection: guides` (or another configured collection name) in frontmatter.
Keep a `layout` layout as the default for pages without a `layout` field. It can reuse the page
template. If the base needs page-specific head metadata, pass values such as `description` as props
and conditionally render the corresponding tags inside its `<head>`. Pass `assets` explicitly too
when the base references the asset manifest. Components do not inherit it from the page.

The complete [multi-layout theme example](examples/multi-layout/mod.ts) exports a `StenoTheme` with
all four layouts, a default layout, and shared `Base` and `EntryList` components. It uses the same
composition rules as directory themes; to split it into files, place each layout string under
`layouts/` and register each component string under `components:` in `theme.yaml`.

From a repository checkout, run its rendering tests:

```sh
deno test -A src/theme/composition_example_test.ts
```

These render every layout, check the shared shell, metadata escaping, Markdown insertion and
collection links, and exercise missing optional metadata and empty collections. To use the example
outside this checkout, copy the module and change its type import from `../../../mod.ts` to
`jsr:@steno/steno`, then point your site's `theme` setting at the copied module.

### Including identical fragments

Tau has no `extends`/layout-inheritance syntax, but `{@include}` already covers the common case that
would motivate one: a `<head>` block (charset, viewport, favicons, stylesheet links, and similar)
repeated identically across every layout in a theme.

The key difference from a `<Component />` invocation is context: a component only receives its
explicit props plus `site`/`theme`/`globals` (see [Layout context](#layout-context) above), but
`{@include "name"}` inherits the **full** context of the template that includes it - the same
`title`, `description`, and other page frontmatter a layout itself sees. Register the shared block
as an ordinary component and pull it in with `{@include}` instead of `<Head />`, and every value it
needs is already in scope:

```yaml
# theme.yaml
components:
  head: components/head.tau
```

```html
<!-- components/head.tau -->
<head>
  <meta charset="utf-8" />
  <title>{title} · {site.title}</title>
  <meta name="description" content="{description}" />
  <link rel="stylesheet" href="/assets/{assets['site.css']}" />
</head>
```

```html
<!-- layouts/article.tau -->
<html>
  {@include "Head"}
  <body>
    {@html content}
  </body>
</html>
```

`{@include}` replaces the parts that are identical everywhere; it does not let a child layout
override part of what it includes. When an include contains the entire `<head>`, put additional
metadata inside that component's `<head>`, not after the include in the calling layout. Prefer the
`Base` composition pattern above when sharing the surrounding document structure as well.

## Safety limits

Tau templates cannot access ambient runtime globals such as `Deno`, `globalThis`, `process`, or
generated renderer internals. Mutating, code-generating, prototype, and constructor expressions are
rejected.

Rendering also enforces shared limits across layouts, includes, and components: 64 nested renders,
100,000 loop iterations, 16 MiB of output, and 1 MiB per template by default. API consumers can
lower these limits through `TauOptions.limits`.

These controls harden rendering against malformed templates and accidental resource exhaustion. Tau
templates remain trusted theme code and are not a security sandbox for arbitrary user-authored
expressions.

## See also

- [Tau syntax](tau_syntax.md) for the full expression grammar, built-in filters, and escaping rules.
- [Theme specification](theme-specification.md) for module-based (`mod.ts`) themes, `configSchema`
  validation rules, and how `theme` is resolved.
- [Configuration](config_reference.md) for `theme`, `themeConfig`, `hashAssets`, `minify`, and
  other site-level settings.
