# Getting started

Steno turns Markdown files into a static site. It can work from a configured
project, or discover Markdown in a directory without a config file.

## Install and run

Install [Deno](https://deno.com/), then create a project using the following
command:

```sh
deno create jsr:@steno/init
```

This command will create the following structure (might be different depending
on what options you chose):

```text
my-site/
├── content/
│   ├── .steno/config.yml
│   └── index.md
```

Build or develop from the project root:

```sh
deno x jsr:@steno/steno build
deno x jsr:@steno/steno dev
```

The build writes `dist/index.html`. With `shortUrls: true`, `content/about.md`
becomes `dist/about/index.html`; otherwise it becomes `dist/about.html`.

## Zero-config mode

Outside a Deno/JavaScript project, Steno can discover Markdown automatically.
With one Markdown file it uses `jsr:@steno/theme-minimal`; with a `docs/`
directory or multiple Markdown files it uses `jsr:@steno/theme-docs-minimal` and
generates navigation from the directory structure. A `steno` object in a single
page's frontmatter can set `title`, `description`, `author`, `output`,
`shortUrls`, `theme`, or `themeConfig`. This is a different, smaller field set
than the per-page `steno` namespace available in a configured project; see
[Per-page configuration](content.md#per-page-configuration).

Zero-config only applies outside a Deno project. If the root directory contains
`deno.json`, `deno.jsonc`, `mod.ts`, `mod.js`, `mod.mts`, or `mod.mjs`, Steno
assumes a configured project and requires `content/.steno/config.yml` (or
`--config`) to exist, even if no Markdown has been scanned yet.

Use `deno create jsr:@steno/init --plugins tailwind,shiki` to skip the
interactive plugin prompts, or add plugins after scaffolding. See
[Plugins](plugins.md) for the official `plugin-tailwind` and `plugin-shiki`
packages and how to write your own.

## What to read next

- [Configuration](config_reference.md) for site settings.
- [Content](content.md) for frontmatter, data, collections, and includes.
- [Themes and Tau](theme_development.md) to customize output.
- [Plugins](plugins.md) for build-time extensions.
- [Doctor](doctor.md) to diagnose a project before you build it.
