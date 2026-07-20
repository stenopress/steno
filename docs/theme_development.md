# Themes and Scribe

A local theme is a directory with layouts, optional registered components, and
optional assets:

```text
theme/
├── theme.yaml
├── layouts/
│   └── layout.scr
├── components/
│   └── Header.scr
└── assets/
    └── site.css
```

```yaml
# theme.yaml
name: example-theme
version: 1.0.0
components:
  header: components/Header.scr
defaultConfig:
  brand: Steno
configSchema:
  showSearch: { type: boolean, default: true, description: Show search }
```

Layout files can be `.scr` or `.liquid`; their base filename is the layout name.
A page without `layout` uses `layout`, so it needs `layouts/layout.scr`.
Components must be declared in `theme.yaml`; their declared key is capitalized
when loaded (`header` becomes `<Header />`). Assets are copied to
`<output>/assets/`.

## Layout context

Every layout receives `content` (compiled Markdown), `site`, `theme`, `data`,
`collections`, `env`, `globals`, public environment variables, and all page
frontmatter. `theme` contains its name/version plus merged configuration.

```html
<!doctype html>
<title>{title} · {site.title}</title>
<link rel="stylesheet" href="/assets/site.css">
<Header title={site.title} />
<article>{@html content}</article>
```

Component contexts include their props plus `site`, `theme`, `globals`, and the
global values themselves. They do not implicitly inherit arbitrary page
frontmatter.

## Scribe syntax

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
`lower`. Invoke a component with `<Header />`; props may be literals,
expressions (`title={title}`), or shorthand (`{title}`).

`{@include "name"}` in a theme resolves a registered component name through the
theme renderer. For Markdown source-file includes, see [Content](content.md).
