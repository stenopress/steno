<div align="center">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://github.com/user-attachments/assets/c8955414-6790-40fb-b38b-1a64cf11c0c3">
      <source media="(prefers-color-scheme: light)" srcset="https://github.com/user-attachments/assets/1659f847-7180-4539-8ce9-57b610669d51">
      <img alt="Steno logo" src="https://github.com/user-attachments/assets/1659f847-7180-4539-8ce9-57b610669d51" width="233">
    </picture>
<p>A fast, configurable static site generator powered by Deno.
<br><small>Sponsored by <a href="https://tuta.com">Tuta</a></small></p>

[![JSR](https://jsr.io/badges/@steno/steno)](https://jsr.io/@steno/steno)
[![JSR Score](https://jsr.io/badges/@steno/steno/score)](https://jsr.io/@steno/steno)
![GitHub Actions Workflow Status](https://img.shields.io/github/actions/workflow/status/stenopress/steno/ci.yml)

</div>

- Runs on Deno; no Node.js installation required.
- Written in TypeScript with unit, integration, and installed-product tests.
- Built-in dev server with live reload.
- Flexible themes from JSR, npm, or HTTPS.
- Zero-config mode or full structured setup.
- Sub-millisecond compilation per page in [recorded benchmarks](docs/benchmarks.md) (4k pages in 0.405s).
- Custom Tau template engine combining Svelte & Astro.
- Sandboxed plugins running in isolated Deno subprocesses.
- Transactional & incremental builds preserving last working site.

## Getting Started

### Installation

Create a new configured project using the interactive initializer:

```bash
deno create jsr:@steno/init
```

Or run the CLI directly in any site directory:

```bash
deno x jsr:@steno/steno build
```

You can also import Steno programmatically in TypeScript:

```typescript
import { Steno } from "jsr:@steno/steno";
```

### Zero-Config Mode

Build a single page or experiment with zero setup. Create `my-site/content/index.md`:

```markdown
# Hello from Steno

Welcome to my static site!
```

From `my-site`, build the site:

```bash
deno x jsr:@steno/steno build
```

Steno automatically detects the Markdown file, applies the default theme, and writes output to `dist/index.html`.

### Configured Project

For full control over content, themes, and plugins, create `content/.steno/config.yml`:

```yaml
title: "My Steno Site"
description: "A site built with Steno"
author: "Your Name"
output: "dist"
theme: "jsr:@steno/theme-minimal"
```

Add content in `content/index.md`:

```markdown
---
title: Home
layout: layout
---

# Hello World

Welcome to a site powered by Steno and Tau.
```

Start the development server with live reload:

```bash
deno x jsr:@steno/steno dev
```

### Tau Templates

Themes use Steno's Tau template engine (`.tau`) supporting expressions, control flow, and components:

```tau
{#if title}
  <Header title={title} />
{/if}

<main class="prose">
  {@html content}
</main>

{#each tags as tag}
  <span class="badge">{tag}</span>
{/each}
```

### Plugin Isolation

Secure third-party plugins with fine-grained capability isolation:

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

Isolated plugins run in separate processes with strictly denied filesystem, network, and environment permissions unless explicitly granted.

---

## CLI Reference

```text
steno [command] [options]
```

| Command   | Description                                          |
| --------- | ---------------------------------------------------- |
| `build`   | Build the site (default command).                    |
| `dev`     | Build, watch files, and serve with live reload.      |
| `preview` | Serve an existing production build without watching. |
| `doctor`  | Diagnose configuration and security issues.          |
| `help`    | Print CLI usage.                                     |
| `version` | Print the installed Steno version.                   |

| Option                | Description                                                        |
| --------------------- | ------------------------------------------------------------------ |
| `-c, --config <path>` | Path to configuration file (default: `content/.steno/config.yml`). |
| `-p, --port <number>` | Preview port; development uses `devPort`.                          |
| `-h, --help`          | Show CLI usage.                                                    |
| `-v, --version`       | Print installed version.                                           |

---

## Documentation

- [Getting Started](docs/getting_started.md)
- [Configuration Reference](docs/config_reference.md)
- [Content and Collections](docs/content.md)
- [Tau Syntax Specification](docs/tau_syntax.md)
- [Plugin Development](docs/plugins.md) & [Sandbox Threat Model](docs/plugin_sandbox.md)
- [Theme Development](docs/theme_development.md) & [Theme Specification](docs/theme-specification.md)
- [API Reference](docs/api_reference.md)
- [Project Diagnostics (`doctor`)](docs/doctor.md)
- [Atomic Build Guarantees](docs/atomic_builds.md)
- [Performance Methodology](docs/benchmarks.md)

---

## Know your rights

This project is under the [MIT License](LICENSE.txt):

- **Permissions**: Commercial use, Modification, Distribution, Private use.
- **Limitations**: Liability, Warranty.
- **Conditions**: License and copyright notice.

Read the full license [here](LICENSE.txt).

---

## Contributing

Please read the [CONTRIBUTING.md](CONTRIBUTING.md) file for more information.

To run the local test suite:

```bash
deno task dev        # Run test project with live reload
deno task test       # Run unit tests
deno task check      # Run full linting, formatting, and type checks
deno task bench      # Run performance benchmarks
```

---

## Sponsors

<div align="center">
  <a href="https://tuta.com">
    <img width="233" alt="Tuta Logo" src="https://github.com/user-attachments/assets/4849c0dd-79a0-44a4-b6e8-12127559961f">
  </a>
</div>
