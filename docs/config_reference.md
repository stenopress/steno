# Configuration reference

Steno reads YAML (`.yml`/`.yaml`) or TOML from `content/.steno/config.yml` by
default. Pass another path with `--config`.

```yaml
title: My site
description: A concise description
author: Ada Lovelace
contentDir: content # default: content
output: dist # default: dist
head:
  - name: robots
    content: index,follow

custom:
  theme: ./theme
  themeConfig:
    accent: purple
  globals:
    repository: https://example.com/source
  stylesheets:
    - /assets/site.css
  shortUrls: true
  devPort: 5735

collections:
  posts:
    sortBy: date
    order: desc
    limit: 10
    filter: { draft: false }
    schema:
      title: { type: string }
      date: { type: string }
      tags: { type: array, required: false }

redirects:
  /old-url: /new-url
```

`title`, `description`, and `author` are the site fields exposed as `site` in
templates. `contentDir` and `output` are relative to the working directory
unless absolute. `navigation` optionally supplies a tree of
`{ title, url,
children }` nodes for themes.

## `custom`

`theme` accepts a local directory, a local module, or an importable `jsr:`,
`npm:`, or HTTPS module. `themeConfig` is merged shallowly with theme defaults.
`globals` are available both directly and as `globals` in page layouts.

`shortUrls` defaults to `false`. `devPort` selects the initial development
server port; Steno finds a later available port when necessary.

`stylesheets` is a theme-facing configuration value; Steno exposes it but does
not inject tags automatically.

## Plugin security

Plugins from `jsr:` and `npm:` are allowed. Local file URLs, HTTP(S), and
`node:` builtins require an explicit opt-in; `data:` and `blob:` are never
allowed.

```yaml
custom:
  pluginSecurity:
    allowLocal: true
    allowRemoteHttp: false
    allowNodeBuiltins: false
    allowThemePlugins: true # default
```

See [Plugins](plugins.md) before enabling sources that can execute arbitrary
code.

## CLI

```text
deno x jsr:@steno/steno [build|dev|doctor] [--config path]
```

`build` is the default. `dev` watches and serves the site; `doctor` reports
common project/configuration problems.
