<div align="center">
  <picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://github.com/user-attachments/assets/c8955414-6790-40fb-b38b-1a64cf11c0c3">
  <source media="(prefers-color-scheme: light)" srcset="https://github.com/user-attachments/assets/1659f847-7180-4539-8ce9-57b610669d51">
  <img width="233" height="81" alt="Fallback image description" src="https://github.com/user-attachments/assets/1659f847-7180-4539-8ce9-57b610669d51">
</picture>
  <br><br>
  <p>A fast Deno-powered static site generator.</p>
  <small>Sponsored by <a href="https://tuta.com">Tuta</a></small>
</div>
<br><br>

Steno turns Markdown files into static HTML, adds frontmatter and theme support,
and ships with a small CLI plus a live-reloading dev server.

## What Steno does

Steno is designed around a simple content pipeline:

1. Read Markdown files from `content/`
2. Parse YAML or TOML frontmatter
3. Convert Markdown to HTML with `marked`
4. Optionally render the HTML through a Scribe-based theme
5. Write the generated pages to `dist/`
6. Copy theme assets into `dist/assets/`

That makes it a good fit for blogs, documentation sites, small marketing sites,
and theme-driven static websites.

## Features

- Markdown pages rendered to HTML with `marked`
- YAML and TOML config loading
- Frontmatter support with `---` (YAML) and `+++` (TOML)
- Theme layouts, components, and static assets
- Scribe templates for layouts and components
- Live-reloading dev server on `http://localhost:8000`
- CLI support for `build`, `dev`, `--config`, and `--help`
- Root test harness with `deno task test`

## Installation / usage

The package exports `mod.ts`, so you can import it directly in a Deno project:

```ts
import { Steno } from "@steno/steno";

new Steno();
```

For local development inside this repo, the current workflow is:

```sh
deno task dev
deno task test
deno run -A jsr:@steno/steno build
```

See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for the repo layout and change checklist.

## Quick start

Scaffold a new site with the interactive init package:

```sh
deno run -Ar jsr:@steno/init
```

Or create the default config file manually at `content/.steno/config.yml`:

```yaml
title: My site
description: A Steno site
author: Your Name

contentDir: content
output: dist

custom:
  shortUrls: true
  theme: "./test/test-theme"
  themeConfig:
    author: "Your Name"
```

Add a page at `content/index.md`:

```md
---
title: Home
layout: layout
---

# Hello

Welcome to Steno.
```

Then build the site:

```sh
deno run -A jsr:@steno/steno build --config content/.steno/config.yml
```

Or start the dev server with live reload:

```sh
deno run -A jsr:@steno/steno dev --config content/.steno/config.yml
```

## CLI

Steno’s CLI entrypoint lives in `mod.ts`, with argument parsing in `src/utils/cli.ts`.

### Commands

- `build` — generate the site into `dist/` (default)
- `dev` — start the dev server with file watching
- `--help` — print CLI usage

### Options

- `-c, --config <path>` — path to the site config file

### Examples

```sh
deno run -A jsr:@steno/steno
deno run -A jsr:@steno/steno build
deno run -A jsr:@steno/steno dev
deno run -A jsr:@steno/steno build --config content/.steno/config.yml
deno run -A jsr:@steno/steno --help
```

## Configuration

Steno loads config from YAML or TOML. The default path is
`content/.steno/config.yml`.

Supported top-level fields used by the current runtime include:

- `title`
- `description`
- `author`
- `head`
- `contentDir`
- `output`
- `custom.shortUrls`
- `custom.theme`
- `custom.themeConfig`

Example:

```yaml
title: My site
description: A site built with Steno
author: Your Name
contentDir: content
output: dist

head:
  - name: icon
    content: /favicon.ico

custom:
  shortUrls: true
  theme: "./test/test-theme"
  themeConfig:
    author: "Your Name"
```

### Notes

- `shortUrls: true` writes pages like `about/index.html` instead of `about.html`
- `.steno/` is reserved for internal config files
- only `.md` files are processed during builds

## Themes

Themes are loaded from `custom.theme` and can be either:

- a local theme directory containing `theme.yaml` or `theme.yml`
- a module import such as `jsr:`, `npm:`, `file:`, or `https:`

Directory-based themes conventionally use:

- `layouts/*.scr` for layouts
- `components/*.scr` for reusable components
- `assets/**` for static files copied to `dist/assets/`

Example `theme.yaml`:

```yaml
name: "Steno Minimalist"
version: "1.0.0"
components:
  header: "components/header.scr"
  footer: "components/footer.scr"
defaultConfig:
  author: "Steno Creator"
```

Example theme structure:

```text
test/test-theme/
├── theme.yaml
├── assets/
│   └── style.css
├── components/
│   ├── footer.scr
│   └── header.scr
└── layouts/
    ├── layout.scr
    └── post.scr
```

### Scribe template syntax

Steno themes are rendered with Scribe, not Liquid.

Common patterns:

```scr
{#if title}
  <Header />
{/if}

{@html content}

{ tags | join: ", " }

{#each tags as tag}
  <span>{tag}</span>
{/each}
```

### Render context

Layouts receive a context object containing:

- `site` — the site config
- `theme` — theme metadata plus merged theme config
- `content` — rendered Markdown HTML
- frontmatter fields such as `title`, `layout`, `date`, `tags`, and `author`

The default layout name is `layout` when frontmatter does not specify one.

## Development workflow

The repo is structured so that the root package points at `mod.ts`, while the
sandbox app lives under `test/`.

- `deno task dev` delegates to `test/`
- `deno task test` runs the root `test.ts` harness
- `cd test && deno task build` builds the sandbox site directly

Useful commands:

```sh
deno check
deno lint
deno task test
cd test && deno task build
```

## Public API

The main exports from `mod.ts` are:

- `Steno`
- `Theme`
- `render`
- `filters`
- `StenoTheme`

This lets you use the package as a library or as a runnable CLI entrypoint.

## Project status

The current implementation already includes:

- Markdown-to-HTML compilation
- theme loading and rendering
- asset copying
- a CLI
- live reload in dev mode
- a test suite

## License

MIT — see [`LICENSE.txt`.](LICENSE.txt)

## Sponsors

<div align="center">
  <a href="https://tuta.com">
<img width="233" alt="image" src="https://github.com/user-attachments/assets/4849c0dd-79a0-44a4-b6e8-12127559961f" />
  </a>
</div>
