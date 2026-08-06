# Themes and Tau

This page covers directory-based themes: a folder with a `theme.yaml`, built
with Tau templates, loaded from a local path. For themes authored as a `mod.ts`
module (including how Steno resolves a `theme` specifier, and the `StenoTheme`
shape either kind of theme produces), see the
[Theme specification](theme-specification.md). For the template language itself
(expressions, filters, control flow), see [Tau syntax](tau_syntax.md).

A local theme is a directory with layouts, optional registered components, and
optional assets:

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

Layout files use the `.tau` extension; their base filename is the layout name. A
page without `layout` uses `layout`, so it needs `layouts/layout.tau`.
Components must be declared in `theme.yaml`; their declared key is capitalized
when loaded (`header` becomes `<Header />`). Assets are copied to
`<output>/assets/`.

Point a project at this theme with `theme: ./theme` (or wherever the folder
lives, relative to the config file) in `content/.steno/config.yml`. See
[Resolution](theme-specification.md#resolution) for every specifier form `theme`
accepts, and [Configuration](config_reference.md) for `themeConfig`.

## Scripts

`scripts/*.ts`/`*.tsx` are transpiled to JavaScript and merged into the theme's
assets, so `scripts/site.ts` is reachable at `/assets/site.js` -
`scripts/foo/bar.ts` is flattened the same way, to `/assets/bar.js`. Existing
`scripts/*.js`/`*.jsx` are copied through unchanged. This only applies to
directory-based themes (`theme.yaml`); a theme authored as a `mod.ts` module
already has full control over how it builds its own `assets` map. Omit
`scripts/` entirely if a theme has no need for it - there's no cost either way.

## Layout context

Every layout receives `content` (compiled Markdown), `site`, `theme`, `data`,
`collections`, `env`, `globals`, `assets`, public environment variables, and all
page frontmatter. `theme` contains its name/version plus merged configuration.
Writing a TypeScript helper that builds part of this context yourself (outside
`.tau` templates, which aren't typed)? Import `PageRenderContext` from
`@steno/steno` for the same shape, with autocomplete.

`assets` maps each theme asset's source-relative path (as written in `assets/`
or `scripts/`) to its output filename. CSS and JS assets are written under a
content-hashed filename by default (`site.css` -> `site.a1b2c3d4.css`) so a
redeploy with changed styles or scripts gets a new URL automatically - no CDN
cache purge needed. Set `hashAssets: false` in the site config to keep source
filenames as-is. Reference assets through this map rather than hardcoding the
source filename either way:

```html
<!doctype html>
<title>{title} · {site.title}</title>
<link rel="stylesheet" href="/assets/{assets['site.css']}">
<Header title={site.title} />
<article>{@html content}</article>
```

Component contexts include their props plus `site`, `theme`, `globals`, and the
global values themselves. They do not implicitly inherit arbitrary page
frontmatter.

## Tau syntax

Expressions are JavaScript expressions and are HTML-escaped:

```html
<h1>{title | upper}</h1>
{#if date}
  <time>{date | date}</time>
{:else}
  <span>Undated</span>
{/if}
{#each tags as tag, index}<span>{index}: {tag}</span>{/each}
```

Use `{@html expression}` only for trusted HTML, such as Steno's generated
`content`. Built-in filters are `date`, `truncate(length)`, `upper`, and
`lower`; see [Built-in filters](tau_syntax.md#built-in-filters) for their
defaults and edge-case behavior. Invoke a component with `<Header />`; props may
be literals, expressions (`title={title}`), or shorthand (`{title}`).

`{@include "name"}` in a theme resolves a registered component name through the
theme renderer. For Markdown source-file includes, see [Content](content.md).

## Sharing boilerplate across layouts

Tau has no `extends`/layout-inheritance syntax, but `{@include}` already covers
the common case that would motivate one: a `<head>` block (charset, viewport,
favicons, stylesheet links, and similar) repeated identically across every
layout in a theme.

The key difference from a `<Component />` invocation is context: a component
only receives its explicit props plus `site`/`theme`/`globals` (see
[Layout context](#layout-context) above), but `{@include "name"}` inherits the
**full** context of the template that includes it - the same `title`,
`description`, and other page frontmatter a layout itself sees. Register the
shared block as an ordinary component and pull it in with `{@include}` instead
of `<Head />`, and every value it needs is already in scope:

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
  <meta property="og:type" content="article" />
  <body>{@html content}</body>
</html>
```

A layout can still add a few tags of its own directly after the include -
`{@include}` only replaces the parts that are actually identical everywhere; it
isn't a slot system and doesn't let a child layout override part of what it
includes.

## Safety limits

Tau templates cannot access ambient runtime globals such as `Deno`,
`globalThis`, `process`, or generated renderer internals. Mutating,
code-generating, prototype, and constructor expressions are rejected.

Rendering also enforces shared limits across layouts, includes, and components:
64 nested renders, 100,000 loop iterations, 16 MiB of output, and 1 MiB per
template by default. API consumers can lower these limits through
`TauOptions.limits`.

These controls harden rendering against malformed templates and accidental
resource exhaustion. Tau templates remain trusted theme code and are not a
security sandbox for arbitrary user-authored expressions.

## See also

- [Tau syntax](tau_syntax.md) for the full expression grammar, built-in filters,
  and escaping rules.
- [Theme specification](theme-specification.md) for module-based (`mod.ts`)
  themes, `configSchema` validation rules, and how `theme` is resolved.
- [Configuration](config_reference.md) for `theme`, `themeConfig`, `hashAssets`,
  and other site-level settings.
