# Getting started

Welcome! Steno turns Markdown files into a static website. Write a page in plain
Markdown, and Steno builds it into HTML you can put on any web host. No
experience with static site generators required.

## What you need

Steno runs on [Deno](https://deno.com/), a JavaScript and TypeScript runtime. If
you have never used Deno before, that is fine, you do not need to know
JavaScript to follow this guide. Think of Deno as the program that runs Steno,
the same way a web browser runs a website.

Install Deno first: follow the instructions at [deno.com](https://deno.com/).
Once that is done, you have everything you need. Steno itself does not need a
separate install step.

## Create your first site

Open a terminal in an empty folder and run:

```sh
deno create jsr:@steno/init
```

This asks a few questions (a title, a theme to start from, and so on) and then
creates your project. Press Enter to accept the default answer to any question
if you are not sure. When it is done, you will have a folder that looks like
this:

```text
my-site/
├── content/
│   ├── .steno/config.yml
│   └── index.md
```

`content/index.md` is your home page, written in Markdown.
`content/.steno/config.yml` is your site's configuration: its title,
description, and other settings. You do not need to touch either file yet.

## See your site as you write

From inside `my-site/`, run:

```sh
deno x jsr:@steno/steno dev
```

This builds your site and starts a local server. Open the link it prints
(`http://localhost:5735/` by default) in your browser. Now edit
`content/index.md`, save the file, and watch the browser update on its own. That
is the whole workflow: edit a Markdown file, save, see the result.

This also works for your config file: change something in
`content/.steno/config.yml` and it takes effect on the next save, no need to
stop and restart the command.

## Ship it

When you are ready to publish, run:

```sh
deno x jsr:@steno/steno build
```

This writes the final website into a `dist/` folder. That folder is your whole
site: plain HTML, CSS, and JavaScript files. Upload it to any static web host
(Netlify, Cloudflare Pages, GitHub Pages, or similar) and you are live. See
[Deploying](deploying.md) for step by step setup, including GitHub Actions.

Before you upload, you can double check exactly what will ship with:

```sh
deno x jsr:@steno/steno preview
```

This serves the `dist/` folder exactly as it is, without rebuilding anything, so
you see precisely what your visitors will see.

## What to read next

- [Configuration](config_reference.md): every setting your `config.yml` can
  have.
- [Content](content.md): frontmatter, data files, collections, and includes.
- [Themes and Tau](theme_development.md): how to customize the way your site
  looks.
- [Tau syntax](tau_syntax.md): the template language themes are written in.
- [Plugins](plugins.md): optional build-time extensions like Tailwind CSS.
- [Doctor](doctor.md): a command that checks your project for common mistakes.
- [Deploying](deploying.md): hosting your site on GitHub Pages, Vercel, Netlify,
  Cloudflare Pages, or your own server.
- [Recipes](recipes.md): copy-pasteable answers for common tasks, an RSS feed, a
  blog listing, dark mode, and more.
- [Troubleshooting](troubleshooting.md): what a given error message means and
  how to fix it.
- [Glossary](glossary.md): plain definitions for terms used throughout these
  docs.

## Going further

The two sections below cover less common paths. Skip them for now if you just
want to build a site, and come back if you need them later.

### Skipping the questions

`deno create jsr:@steno/init` normally asks you questions one at a time. If you
already know the answers, or you are scripting the setup (for example in CI),
you can answer them all up front with flags instead:

```sh
deno create jsr:@steno/init \
  --title "My Site" \
  --description "A concise description" \
  --author "Ada Lovelace" \
  --theme minimal \
  --plugins tailwind,shiki \
  --force
```

- `--theme` picks one of the official themes: `minimal`, `docs-minimal`, or
  `marketing-minimal`. See [Themes and Tau](theme_development.md) if you want to
  build your own instead.
- `--plugins` is a comma separated list of official plugins; see
  [Plugins](plugins.md) for what `tailwind` and `shiki` do, and how to write
  your own.
- `--force` overwrites files already in the target folder.
- Any flag you leave out just falls back to its normal question. Run with
  `--help` to see the full list.

### Building without any config file

If you just have a folder of Markdown files, with no `content/.steno/` folder
and no config, Steno can still build it. Run `steno build` or `steno dev`
directly in that folder and Steno figures out a sensible setup on its own: one
file becomes a simple page, a `docs/` folder or several files becomes a small
documentation site with automatic navigation.

A single page can still set a few basics, like its title, by adding a `steno`
block to its frontmatter. See
[Per-page configuration](content.md#per-page-configuration) for the full list of
fields (it is a smaller list than what a full config file supports).

This only kicks in outside a Deno/JavaScript project. If your folder already has
a `deno.json` or similar file, Steno assumes you meant to set up a real config
file and will ask you to create `content/.steno/config.yml` instead.
