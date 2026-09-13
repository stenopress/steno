# Core

Core is a content-processing library for Deno. It parses Markdown and frontmatter,
assembles collections, runs plugin transforms, and renders pages with reusable
themes.

Core provides the shared content primitives for
[Steno](https://github.com/stenopress/steno). It uses
[Tau](https://github.com/stenopress/tau) for templates and exposes the contracts
used by Steno themes and plugins.

Use Core when building a content tool or integrating page rendering into your
own application. For a complete static site generator with a CLI, development
server, and output management, use Steno.

## Install

Add Core to a Deno project:

```sh
deno add jsr:@steno/core@0.1.0-rc.1
```

Core is currently available as a prerelease, so examples pin the version explicitly.

## Quick start

Parse a document, render its Markdown, and apply a theme:

```ts
import { parseFrontmatter, renderMarkdown, Theme } from "jsr:@steno/core@0.1.0-rc.1";

const { frontmatter, body } = parseFrontmatter(`---
title: Hello Core
---

Content written in **Markdown**.
`);

const theme = new Theme({
  name: "example",
  version: "1.0.0",
  layouts: {
    layout: `<article><h1>{title}</h1>{@html content}</article>`,
  },
});

const content = await renderMarkdown(body, []);
const html = await theme.renderLayout("layout", content, frontmatter);

console.log(html);
```

The result is an HTML string. Your application decides whether to write it to a
file or return it in a response. Markdown rendering does not sanitize untrusted
HTML; sanitize content when your application accepts untrusted HTML.

## Page rendering

For pages that need site settings, collections, head tags, and frontmatter
overrides, use the shared page pipeline:

```ts
import {
  createPageContext,
  parseFrontmatter,
  renderMarkdown,
  renderPage,
  Theme,
} from "jsr:@steno/core@0.1.0-rc.1";

const { frontmatter, body } = parseFrontmatter("# Welcome");
const theme = new Theme({
  name: "site",
  version: "1.0.0",
  layouts: {
    layout: `<!doctype html><html><head><title>{title}</title></head>
      <body><main>{@html content}</main></body></html>`,
  },
});

const prepared = createPageContext({
  page: { relPath: "index.md", title: "Welcome", frontmatter },
  config: { title: "My site", description: "A content site", author: "Alex" },
  theme,
  siteHead: [{ name: "description", content: "A content site" }],
  globals: {},
  publicEnv: {},
  collections: {},
  data: {},
  assets: {},
});

const html = await renderPage({
  ...prepared,
  content: await renderMarkdown(body, []),
  theme,
  minify: false,
});

console.log(html);
```

The pipeline has three steps:

1. `renderMarkdown(body, plugins)` applies AST transforms, renders Markdown, then
   applies HTML transforms to the body.
2. `createPageContext(options)` resolves per-page `steno.*` overrides and prepares
   the template context, layout name, and document head.
3. `renderPage(options)` applies the layout, injects head tags, and optionally
   minifies the result. Without a theme, it uses the rendered body directly.

The context exposes `site`, `theme`, `globals`, `env`, `collections`, `data`,
`assets`, and page metadata. Supply only public environment values in `publicEnv`;
Core does not select or read environment variables for you.

## Frontmatter and collections

`parseFrontmatter(source, filePath?)` supports YAML between `---` delimiters and
TOML between `+++` delimiters. It returns the metadata and remaining document body.
Pass a file path to include it in parse errors.

`collectMarkdownPages(contentDir)` discovers Markdown files and prepares their
metadata. `buildCollections` groups pages by their first directory beneath the
content root, so `content/posts/hello.md` belongs to `collections.posts`.
Collection configuration supports sorting, filtering, limits, and schemas.

```ts
import { buildCollections, collectMarkdownPages } from "jsr:@steno/core@0.1.0-rc.1";

const pages = await collectMarkdownPages("./content");
const collections = await buildCollections(
  "./content",
  {
    title: "My site",
    description: "A content site",
    author: "Alex",
    collections: { posts: { sortBy: "date", order: "desc" } },
  },
  [],
  pages,
);

console.log(collections.posts);
```

Filesystem discovery requires Deno read permission. Supply prepared pages to
`buildCollections` to avoid scanning disk. Its optional `processedBodies` and
`htmlCache` maps let a host reuse include-resolved Markdown and rendered bodies.
The HTML cache is populated in place; the caller owns its lifetime and invalidation.

## Plugins

Plugins use the `StenoPlugin` contract:

```ts
import { renderMarkdown, type StenoPlugin } from "jsr:@steno/core@0.1.0-rc.1";

const plugin: StenoPlugin = {
  name: "article-body",
  transformHtml(html) {
    return `<div class="article-body">${html}</div>`;
  },
};

const html = await renderMarkdown("# Hello", [plugin]);
console.log(html);
```

Transforms run sequentially in plugin order. `transformAst` receives Markdown
tokens; `transformHtml` receives body HTML before layout rendering.

The contract also includes `beforeBuild`, `afterPage`, and `afterBuild`. Core's
page-rendering functions do not invoke these lifecycle hooks. A host controls
build lifecycle, file output, and plugin isolation. Plugins used concurrently
must manage their own mutable state.

## Themes and templates

Construct a `Theme` from a `StenoTheme` object or load a directory with
`Theme.loadFromDirectory(path)`. Themes can provide layouts, components,
functions, assets, configuration defaults, and configuration schemas.
`mergeTheme` combines a base theme with overrides.

Template syntax is documented in [Tau's README](https://github.com/stenopress/tau#template-syntax).
Core's `render` and `filters` exports include the `markdown_inline` filter in
addition to Tau's built-ins. Supplying a `filters` option replaces that render's
registry; spread the exported registry when extending it.

Directory loading, asset copying, and isolated plugin execution use Deno's
filesystem or process APIs and require the corresponding permissions. Rendering
prepared page inputs does not write files or start an HTTP server.

## API

The root export provides:

- `parseFrontmatter`, `collectMarkdownPages`, and `buildCollections`
- `renderMarkdown`, `createPageContext`, and `renderPage`
- `Theme` and `mergeTheme`
- `inferPageTitle` and `resolvePageRoute`
- `validateSiteConfig`, `DiagnosticBag`, and `StenoDiagnosticError`
- `isStenoPlugin` and `runHtmlTransforms`
- `render`, `filters`, `getTauCacheStats`, and `clearTauCache`
- shared types, including `SiteConfig`, `StenoPlugin`, and `StenoTheme`

Modules are also available through package subpaths such as `/render`, `/theme`,
`/collections`, `/frontmatter`, `/plugins`, and `/types`.
See the [API reference](https://jsr.io/@steno/core@0.1.0-rc.1/doc) for signatures
and the complete export list.

## Development

Core is developed in the Steno repository under `packages/core`. The development
workspace configuration links to a Tau checkout beside Steno:

```text
Projects/
├── tau/
└── steno/
    └── packages/
        └── core/
```

Run the complete local check:

```sh
deno task --cwd packages/core check
```

Run this from the Steno repository root. It checks formatting, types, API
documentation, lint rules, and tests. Run only the tests with
`deno task --cwd packages/core test`. Inspect the publishable package from Core's directory:

```sh
deno publish --dry-run
```

Installed packages resolve Tau through the versioned JSR dependency. The sibling
checkout is only used for local development. Changes to shared rendering should
also pass Steno's compatibility suites and performance benchmarks.

## License

Core is available under the [MIT License](./LICENSE.txt).
