# STENO HYBRID RUNTIME EXPERIMENT. NOT STABLE

<div align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://github.com/user-attachments/assets/c8955414-6790-40fb-b38b-1a64cf11c0c3">
    <source media="(prefers-color-scheme: light)" srcset="https://github.com/user-attachments/assets/1659f847-7180-4539-8ce9-57b610669d51">
    <img width="233" height="81" alt="Steno Logo" src="https://github.com/user-attachments/assets/1659f847-7180-4539-8ce9-57b610669d51">
  </picture>
  <br><br>
  <p><strong>An ultra-lightweight static site generator powered by the Steno Hybrid Runtime.</strong></p>
  <small>Sponsored by <a href="https://tuta.com">Tuta</a></small>
  <br><br>

[![JSR](https://jsr.io/badges/@steno/steno)](https://jsr.io/@steno/steno)
[![JSR Score](https://jsr.io/badges/@steno/steno/score)](https://jsr.io/@steno/steno)
![GitHub Actions Workflow Status](https://img.shields.io/github/actions/workflow/status/stenopress/steno/ci.yml)

</div>

<br>

Steno is a high-performance, developer-first static site generator built on the
**Steno Hybrid Runtime**: a native Rust build engine paired with a flexible Deno
runtime. Rust handles performance-critical Markdown processing and file output,
while Deno provides configuration, themes, plugins, hooks, the development
server, and live reload. Together with Scribe, Steno's custom template runtime,
the two engines compile thousands of pages in fractions of a second without
giving up TypeScript extensibility.

## Performance Benchmarks

Steno is engineered for speed. Built-in performance budgets are strictly
enforced via our local benchmark suite to prevent regression:

- **Compile Speed:** Built to handle scale, compiling **4,000+ rich markdown
  pages in <0.5 seconds**.
- **Incremental Rebuilds:** Powered by a layered in-memory + on-disk cache to
  compile changes instantly.
- **Cold Builds:** The native fast path builds 1,000 flat-URL pages in roughly
  55ms, or roughly 73ms with short URLs and their per-page directories, on the
  reference development machine.

To run performance diagnostics locally:

```sh
deno task bench            # Run the benchmark suite
deno task bench:check      # Assert performance budget thresholds
```

## Steno Hybrid Runtime

The **Steno Hybrid Runtime** is Steno's dual Rust/Deno architecture. It keeps
native compilation work close to the filesystem while retaining Deno's simple,
secure TypeScript extension model.

| Runtime               | Responsibilities                                                                                                                                                               |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Rust build engine** | Reads Markdown, validates YAML/TOML frontmatter, converts Markdown to HTML in parallel, resolves output paths, writes pages, and maintains the native build cache.             |
| **Deno runtime**      | Loads configuration and themes, runs plugins and hooks, renders Scribe layouts and collections, watches files, serves the development site, and broadcasts live-reload events. |

Steno selects the shortest valid execution path for each build:

- A site without a theme or page transforms uses the **native fast path**. Rust
  produces the final files directly, while Deno orchestrates the build and
  lifecycle hooks.
- A site using Scribe themes, collections, plugins, or page hooks uses the
  **hybrid path**. Rust performs the native Markdown stage, then Deno applies
  the features that require the TypeScript runtime.
- `steno dev` uses the same Rust-powered build pipeline. Deno owns file
  watching, the HTTP server, and SSE live reload; each initial or incremental
  build is delegated through the appropriate native or hybrid path.

Official JSR releases bundle precompiled native engines for macOS, Linux, and
Windows on both ARM64 and x64. Steno selects the matching library automatically,
so users get the hybrid runtime without installing Rust or running a setup step:

```sh
deno run -A jsr:@steno/steno dev
```

If the platform is unsupported or FFI permission is unavailable, Steno
gracefully uses its **portable Deno engine**. Builds, themes, plugins,
development serving, and live reload remain functional; only native acceleration
is unavailable.

Use the built-in diagnostics to see which engine is active:

```sh
deno run -A jsr:@steno/steno doctor
```

In a source checkout, `deno task setup` builds and selects the local native
engine automatically. The release library is written to
`crates/steno_core/target/release/` and loaded through Deno's native FFI.

Engine selection can also be controlled explicitly:

```sh
STENO_NATIVE=off       # Always use the portable engine
STENO_NATIVE=required  # Fail with setup guidance unless native loading succeeds
STENO_NATIVE_PATH=...  # Load a specific compatible library
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
- **Sandboxed Plugin Architecture:** Dynamically extend your build pipeline with
  modular compile-time plugins loaded directly from JSR or npm.
- **Strict Security Guardrails:** Out-of-the-box protection that sandboxes
  plugin environments, blocking unauthorized local filesystem, remote HTTP, or
  Node-builtin imports unless explicitly allowed.
- **Scribe Templating:** Premium Svelte and Astro style syntax parsing with
  native layout and component structures.
- **Dual-Format Frontmatter:** First-class, rapid parsing for both `---` (YAML)
  and `+++` (TOML).
- **Sub-Millisecond Live Reload:** Driven by a native Server-Sent Events (SSE)
  server for instant browser updates on `http://localhost:5735`.
- **Hybrid Caching:** Advanced recursive compilation with layered memory caching
  to only rebuild what changed.
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

## Plugins & Security Sandboxing

Steno features a robust, extensible plugin ecosystem alongside built-in security
profiles. You can register custom build pipeline plugins directly via JSR or npm
inside your `config.yml`:

```yaml
# Add plugins directly to your build pipeline
plugins:
  - "jsr:@stenodevs/my-plugin"
  - package: "npm:@steno/html-minifier"
    options:
      collapseWhitespace: true

# Control import access policies for third-party extensions
custom:
  pluginSecurity:
    allowLocal: false # Block/allow local file:// imports
    allowRemoteHttp: false # Block/allow untrusted remote HTTP imports
    allowNodeBuiltins: false # Prevent plugins from accessing Node.js system APIs
    allowThemePlugins: true # Enable/disable plugins bundled within themes
```

---

## Developer Workflow

We love contributors. The Steno repository contains a fully configured workspace
whose sandbox imports the local source rather than the published package.

```sh
deno task setup          # Build Rust and cache local Deno dependencies
deno task dev            # Build Rust, then start the local sandbox
deno task dev:portable   # Start the sandbox without requiring Rust
deno task test:native    # Require and test the native engine
deno task test:portable  # Test the JSR-compatible portable engine
deno task check          # Format, lint, and type-check the repository
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
