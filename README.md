<div align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://github.com/user-attachments/assets/c8955414-6790-40fb-b38b-1a64cf11c0c3">
    <source media="(prefers-color-scheme: light)" srcset="https://github.com/user-attachments/assets/1659f847-7180-4539-8ce9-57b610669d51">
    <img width="233" height="81" alt="Steno Logo" src="https://github.com/user-attachments/assets/1659f847-7180-4539-8ce9-57b610669d51">
  </picture>
  <br><br>
  <p><strong>Fast sites. Safe builds. Flexible setup.</strong></p>
  <p>A fast, configurable static site generator powered by Deno.</p>
  <small>Sponsored by <a href="https://tuta.com">Tuta</a></small>
  <br><br>

[![JSR](https://jsr.io/badges/@steno/steno)](https://jsr.io/@steno/steno)
[![JSR Score](https://jsr.io/badges/@steno/steno/score)](https://jsr.io/@steno/steno)
![GitHub Actions Workflow Status](https://img.shields.io/github/actions/workflow/status/stenopress/steno/ci.yml)

</div>

<br>

Steno supports both configured projects and an optional zero-config mode. Use a configuration file
for structured content, themes, plugins, and project-wide settings, or build a single Markdown file
without any setup. Builds are incremental and transactional, so failed builds preserve the last
successful output.

Plugins can run in isolated, deny-by-default Deno subprocesses with explicit permissions, deadlines,
memory ceilings, output limits, cancellation, and crash containment. Trusted plugins remain
available when full in-process access is required.

## Quick Start

### Create a Configured Project

The interactive initializer creates a configured project with your selected theme, optional plugins,
structured content, and reusable tasks:

```sh
deno create jsr:@steno/init@0.10.0
```

The generated project is ready to run:

```sh
deno task dev
deno task build
```

### Use Zero-Config Mode

For a single page or a small experiment, create `my-site/content/index.md`:

```md
# Hello from Steno
```

From `my-site`, build it:

```sh
deno x jsr:@steno/steno@0.10.0 build
```

Steno detects the single Markdown file, applies the default theme, and writes:

```text
dist/
└── index.html
```

Zero-config mode is optional. Add `content/.steno/config.yml` whenever the site needs explicit
project settings.

## Why Steno

- **Flexible setup:** Use a full configuration file or optionally build from one Markdown file
  without configuration.
- **Transactional output:** A failed build preserves the last successful site.
- **Incremental compilation:** Unchanged pages reuse cached output.
- **Isolated plugins:** Deny filesystem, environment, network, subprocess, and FFI access until each
  capability is explicitly granted.
- **Tau templates:** Use expressions, components, loops, conditions, includes, filters, and
  contextual escaping.
- **Flexible themes:** Load bundled, local, JSR, npm, or HTTPS themes.
- **Structured content:** Use collections, data files, drafts, redirects, custom routes, and YAML or
  TOML frontmatter.
- **Development server:** Watch files and reload the browser as content changes.
- **Real-world testing:** Exercise complete sites and official plugins in CI, with additional
  cross-platform coverage on Linux, macOS, and Windows.

## Structured Project

A configured Steno project keeps content and configuration together:

```text
content/
├── .steno/
│   └── config.yml
└── index.md
```

Configure the site in `content/.steno/config.yml`:

```yaml
title: "My Steno Site"
description: "A site built with Steno"
author: "Your Name"
contentDir: "content"
output: "dist"

custom:
  shortUrls: true
  theme: "jsr:@steno/theme-minimal@^0.10.0"
```

Add frontmatter to `content/index.md` when the page needs metadata or a specific layout:

```md
---
title: Home
layout: layout
---

# Hello World

Welcome to a site powered by Steno and Tau.
```

Run the development server:

```sh
deno x jsr:@steno/steno@0.10.0 dev
```

Create production output:

```sh
deno x jsr:@steno/steno@0.10.0 build
```

## Themes and Tau

Themes can live in a local directory or be loaded from JSR, npm, or HTTPS. A theme contains
metadata, assets, layouts, and optional components:

```text
themes/minimalist/
├── theme.yaml
├── assets/
│   └── style.css
├── components/
│   └── header.tau
└── layouts/
    └── layout.tau
```

Tau is Steno's compiled template language:

```tau
{#if title}
  <Header />
{/if}

<main class="prose">
  {@html content}
</main>

{#each tags as tag}
  <span class="badge">{tag}</span>
{/each}
```

Regular interpolated expressions are HTML-escaped. `{@html expression}` deliberately emits raw HTML
and should only receive trusted or sanitized content. See the
[Tau syntax specification](docs/tau_syntax.md) for its complete semantics and security rules.

## Plugins and Isolation

Plugins can transform Markdown tokens and HTML, or run before and after builds. Pin plugin versions
so builds remain reproducible:

```yaml
plugins:
  - package: "jsr:@steno/plugin-shiki@1.0.0"
    mode: isolated
    options:
      theme: github-dark

  - package: "jsr:@steno/plugin-seo@0.7.0"
    mode: trusted
    options:
      siteUrl: "https://example.com"
```

Plugins configured with `mode: isolated` execute in a separate Deno process. Runtime capabilities
are denied unless the plugin entry grants them explicitly. Isolation also enforces hook deadlines,
bounded messages, a heap ceiling, cancellation, and crash containment.

String plugin entries and plugins configured with `mode: trusted` run in-process with Steno's
permissions. Themes and theme-provided plugins are also trusted. Only install trusted extensions
from sources you have reviewed.

Top-level plugin sources can be restricted independently of execution mode:

```yaml
custom:
  pluginSourcePolicy:
    allowLocal: false
    allowRemoteHttp: false
    allowNodeBuiltins: false
    allowThemePlugins: true
```

The source policy validates the configured top-level specifier. See the
[plugin sandbox threat model](docs/plugin_sandbox.md) for permission examples, transitive-import
behavior, integrity checks, and current limitations.

## Performance

Steno benchmarks cold, unchanged warm, and atomic incremental builds. The suite also includes a
4,000-page fixture, frontmatter parsing, the Markdown-to-Tau pipeline, and Tau rendering at multiple
scales.

Performance varies by machine and Deno version. The [benchmark report](docs/benchmarks.md) records
the test environment, averages, and tail latency instead of presenting one result as universal.

```sh
deno task bench
deno task bench:check
deno task bench:report
```

## CLI

```text
steno [command] [options]
```

| Command   | Description                                                     |
| --------- | --------------------------------------------------------------- |
| `build`   | Build the site. This is the default command.                    |
| `dev`     | Build, watch files, and serve with live reload.                 |
| `preview` | Serve an existing production build without watching.            |
| `doctor`  | Check the project for common configuration and security issues. |
| `help`    | Print CLI usage.                                                |

| Option                | Description                                     |
| --------------------- | ----------------------------------------------- |
| `-c, --config <path>` | Use a specific configuration file.              |
| `-p, --port <number>` | Select the preview port. The default is `4173`. |
| `-h, --help`          | Show CLI usage.                                 |

The default configuration path is `content/.steno/config.yml`. See the
[doctor guide](docs/doctor.md) for project diagnostics.

## Documentation

- [Getting started](docs/getting_started.md)
- [Configuration reference](docs/config_reference.md)
- [Content and collections](docs/content.md)
- [Tau syntax specification](docs/tau_syntax.md)
- [Plugin development](docs/plugins.md)
- [Plugin sandbox and threat model](docs/plugin_sandbox.md)
- [Theme development](docs/theme_development.md)
- [Theme specification](docs/theme-specification.md)
- [API reference](docs/api_reference.md)
- [Atomic build guarantees](docs/atomic_builds.md)
- [Performance methodology](docs/benchmarks.md)

## Contributing

The repository includes unit, conformance, security, real-site, ecosystem, and performance tests:

```sh
deno task dev
deno task test
deno task test:sites
deno task test:ecosystem
deno task check
deno task bench:check
```

Read [CONTRIBUTING.md](CONTRIBUTING.md) before submitting a change.

## Sponsors

<div align="center">
  <a href="https://tuta.com">
    <img width="233" alt="Tuta Logo" src="https://github.com/user-attachments/assets/4849c0dd-79a0-44a4-b6e8-12127559961f">
  </a>
</div>

## License

MIT © [Gabriel Cozma](https://gxbs.dev) and contributors. See [LICENSE.txt](LICENSE.txt) for
details.
