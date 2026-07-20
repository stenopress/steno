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
With one Markdown file it uses the minimal theme; with a `docs/` directory or
multiple Markdown files it uses the documentation theme and generates
navigation. A `steno` object in a single page's frontmatter can set `title`,
`description`, `author`, `output`, `shortUrls`, `theme`, or `themeConfig`.

## What to read next

- [Configuration](config_reference.md) for site settings.
- [Content](content.md) for frontmatter, data, collections, and includes.
- [Themes and Scribe](theme_development.md) to customize output.
- [Plugins](plugins.md) for build-time extensions.
