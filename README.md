<div align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://github.com/user-attachments/assets/c8955414-6790-40fb-b38b-1a64cf11c0c3">
    <source media="(prefers-color-scheme: light)" srcset="https://github.com/user-attachments/assets/1659f847-7180-4539-8ce9-57b610669d51">
    <img width="233" height="81" alt="Steno Logo" src="https://github.com/user-attachments/assets/1659f847-7180-4539-8ce9-57b610669d51">
  </picture>
  <br><br>
  <p><strong>An ultra-lightweight, sub-millisecond static site generator powered by Deno.</strong></p>
  <small>Sponsored by <a href="https://tuta.com">Tuta</a></small>
  <br><br>

[![JSR](https://jsr.io/badges/@steno/steno)](https://jsr.io/@steno/steno)
[![JSR Score](https://jsr.io/badges/@steno/steno/score)](https://jsr.io/@steno/steno)
![GitHub Actions Workflow Status](https://img.shields.io/github/actions/workflow/status/stenopress/steno/ci.yml)

</div>

<br>

Steno is a high-performance, developer-first static site generator built on
Deno. By pairing an asynchronous file-system pipeline with Scribe (a custom
compiled templating runtime combining Svelte and Astro syntax), Steno compiles
thousands of pages in fractions of a second, shipping with a local dev server,
instant live-reloading, and near-zero external dependencies.

## Performance Benchmarks

Steno is engineered for speed. Built-in performance budgets are strictly
enforced via our local benchmark suite to prevent regression:

- **Compile speed:** Builds 1,000 Markdown pages in approximately 130 ms on
  modern hardware, with unchanged warm builds completing in approximately 30 ms.
- **Incremental Rebuilds:** Powered by a layered in-memory + on-disk cache to
  compile changes instantly.
- **Cold Starts:** Under 20ms startup time thanks to Deno's native TypeScript
  runtime and a zero-dependency architecture.

To run performance diagnostics locally:

```sh
deno task bench            # Run the benchmark suite
deno task bench:check      # Assert performance budget thresholds
```

---

## Features

- **Zero-Configuration Mode:** Compile on the fly. Run Steno with nothing but a
  single Markdown file, no config files or complex directory structures
  required.
- **Remote Theme Resolvers:** Load and share themes effortlessly. Steno supports
  importing themes directly from remote modules like JSR, npm, or secure HTTPS
  URLs, removing the need to manually clone or manage local theme folders.
- **Intelligent Port Auto-Recovery:** Never deal with crashed local servers due
  to blocked addresses. The dev server automatically detects if your preferred
  port (default 5735) is in use and seamlessly increments to the next available
  port.
- **Scribe Pipe-Syntax Filters:** Format your template variables elegantly.
  Scribe supports Unix-style pipes for clean, readable layout transformations
  like formatting dates or joining arrays inside your HTML.
- **Trusted Plugin Architecture:** Extend the build pipeline with compile-time
  plugins loaded from JSR, npm, or explicitly enabled sources.
- **Plugin Source Policy:** Restrict top-level plugin specifiers by protocol.
  Plugins execute in-process with Steno's Deno permissions, so only trusted
  packages should be configured.
- **Scribe Templating:** Premium Svelte and Astro style syntax parsing with
  native layout and component structures.
- **Double-Engine Frontmatter:** First-class, rapid parsing for both `---`
  (YAML) and `+++` (TOML).
- **Sub-Millisecond Live Reload:** Driven by a native Server-Sent Events (SSE)
  server for instant browser updates on `http://localhost:5735`.
- **Hybrid Caching:** Advanced recursive compilation with layered memory caching
  to only rebuild what changed.
- **Transactional Output:** Builds pages, assets, redirects, and plugin output
  in staging, then promotes the complete tree with rollback and interruption
  recovery.
- **Interactive Scaffolding:** Spin up modern theme templates instantly with a
  dedicated initializer.

---

## Quick Start

Steno is designed to get out of your way. You can run it in **zero-config mode**
with just a single Markdown file, or scale up to a fully structured project.

### Zero-Config (Single File)

If you just want to render a quick page, you do not need any config files.

1. Create a file named `content/index.md`:

```md
# My Page

Hello from Steno!
```

2. Compile it instantly:

```sh
deno run -A jsr:@steno/steno build
```

_Steno will automatically detect your file, apply default settings, and output
the static HTML directly to `dist/index.html`._

---

### Structured Project Setup

When you are ready to scale up to custom metadata, structured content
directories, and themes, initialize a standard project workspace:

```sh
deno run -Ar jsr:@steno/init
```

#### Manual Setup

If you prefer to configure your workspace manually, structure your directory
like this:

```text
.steno/
└── config.yml
content/
└── index.md
```

1. **Configure your site in content/.steno/config.yml. You can point to a local
   theme folder, or keep your project completely lightweight by referencing a
   remote theme directly from JSR:

```yaml
title: "My Steno Site"
description: "A high-performance blog"
author: "Your Name"
contentDir: "content"
output: "dist"

custom:
  shortUrls: true # Generates /about/index.html instead of /about.html
  theme: "jsr:@steno/minimal-theme" # Point to a remote JSR theme or local directory
```

2. **Write** your first document in `content/index.md`:

```md
---
title: Home
layout: layout
---

# Hello World

Welcome to an ultra-fast site powered by Steno and Scribe.
```

3. **Run** the development server with real-time live reload:

```sh
deno run -A jsr:@steno/steno dev
```

4. **Build** your production-ready static assets:

```sh
deno run -A jsr:@steno/steno build
```

---

## Themes & Scribe Templating

Steno themes are powered by **Scribe**, our custom compiled template engine.
Themes live in a directory or can be resolved as remote module imports (`jsr:`,
`npm:`, `https:`).

### Project Layout

```text
themes/minimalist/
├── theme.yaml
├── assets/
│   └── style.css
├── components/
│   └── header.scr
└── layouts/
    └── layout.scr
```

### Scribe Syntax Example

Write clean, declarative markup in your `.scr` templates:

```scr
{#if title}
  <Header/>
{/if}

<main class="prose">
  {@html content}
</main>

{#each tags as tag}
  <span class="badge">{tag}</span>
{/each}
```

---

## CLI Reference

The Steno command-line utility provides intuitive, clean endpoints for your
development workflows.

```sh
steno [command] [options]
```

### Commands

- `build` (default): Compiles the site into your distribution folder.
- `dev`: Spins up the local development server with file watching and SSE
  live-reloading.

### Options

- `-c, --config <path>`: Manually specify a path to your config file (defaults
  to `content/.steno/config.yml`).

---

## Plugins & Source Policy

Steno features an extensible, trusted plugin ecosystem. You can register custom
build pipeline plugins directly via JSR or npm inside your `config.yml`:

```yaml
# Add plugins directly to your build pipeline
plugins:
  - "jsr:@stenodevs/my-trusted-plugin@1.0.0"
  - package: "npm:@steno/html-minifier@1.0.0"
    mode: isolated
    options:
      collapseWhitespace: true

# Control import access policies for third-party extensions
custom:
  pluginSourcePolicy:
    allowLocal: false # Allow top-level file:// plugin specifiers
    allowRemoteHttp: false # Allow top-level HTTP(S) plugin specifiers
    allowNodeBuiltins: false # Allow top-level node: plugin specifiers
    allowThemePlugins: true # Enable/disable plugins bundled within themes
```

The source policy filters only the configured top-level specifier. Plugins
configured with `mode: isolated` run in a dedicated deny-by-default Deno
subprocess with explicit capability grants, hook deadlines, bounded messages, a
heap ceiling, and crash containment. String plugins and plugins configured with
`mode: trusted` run in-process with Steno's permissions.

Themes and theme-bundled plugins are currently trusted, not sandboxed. See the
[plugin sandbox](docs/plugin_sandbox.md) for the threat model and limitations.

---

## Developer Workflow

We love contributors. The Steno repository contains a fully configured workspace
so you can test changes immediately.

```sh
deno task dev     # Starts the sandbox development app under /test
deno task test    # Runs the complete test harness
deno lint         # Enforce standard code styling
deno check        # Type check the codebase
```

For a comprehensive guide on building themes, writing filters, or extending the
core compiler, see
[`CONTRIBUTING.md`](https://github.com/GabsEdits/steno/blob/main/CONTRIBUTING.md).

---

## License

MIT (c) [Gabriel Cozma](https://gxbs.dev) and Contributors. See
[`LICENSE.txt`](https://github.com/GabsEdits/steno/blob/main/LICENSE.txt) for
details.

---

## Sponsors

<div align="center">
  <a href="https://tuta.com">
<img width="233" alt="Tuta Logo" src="https://github.com/user-attachments/assets/4849c0dd-79a0-44a4-b6e8-12127559961f" />
  </a>
</div>
