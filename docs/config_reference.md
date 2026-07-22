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
  - property: og:type
    content: website
  - tag: link
    rel: canonical
    href: https://example.com/
  - tag: script
    src: /assets/app.js
    defer: true

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

## Managed head tags

`head` entries are injected into the rendered document independently of the
active theme. A meta entry may use `name`, `property` (including Open Graph),
`httpEquiv`, or `charset`. Link entries require `tag: link`, `rel`, and `href`.
Script entries use `tag: script` with `src` or inline `content`, and support
`type`, `async`, `defer`, `noModule`, `integrity`, `crossOrigin`, and
`referrerPolicy`.

Pages can add or replace entries through `steno.head` frontmatter. Meta tags are
matched by name/property, canonical links by `rel`, and external scripts by
`src`. Set an explicit `key` to control replacement for any entry. Unmatched
entries are appended in declaration order.

## `custom`

`theme` accepts a local directory, a local module, or an importable `jsr:`,
`npm:`, or HTTPS module. `themeConfig` is merged shallowly with theme defaults.
`globals` are available both directly and as `globals` in page layouts.

`shortUrls` defaults to `false`. `devPort` selects the initial development
server port; Steno finds a later available port when necessary.

`stylesheets` is a theme-facing configuration value; Steno exposes it but does
not inject tags automatically.

## Plugin source policy

Top-level plugin specifiers from `jsr:` and `npm:` are allowed. Local file URLs,
HTTP(S), and `node:` specifiers require an explicit opt-in; `data:` and `blob:`
are never allowed.

```yaml
custom:
  pluginSourcePolicy:
    allowLocal: true
    allowRemoteHttp: false
    allowNodeBuiltins: false
    allowThemePlugins: true # default
```

These settings are source filters rather than a runtime sandbox. They do not
inspect transitive imports or reduce plugin permissions. All configured and
theme-bundled plugins run in-process with the permissions granted to Steno.

The historical `custom.pluginSecurity` name remains accepted as a deprecated
compatibility alias. New projects should use `custom.pluginSourcePolicy`.

`allowNodeBuiltins` controls only a configured top-level `node:` specifier. It
cannot prevent a JSR, npm, file, or HTTP(S) plugin from importing a Node
built-in internally.

See [Plugins](plugins.md) before enabling or installing code that executes
during a build.

### Isolated plugin entries

Object plugin entries can set `mode: isolated`. Isolated plugins accept
`permissions` allowlists for `read`, `write`, `net`, `env`, `run`, `ffi`, `sys`,
and remote `import` hosts. They also accept `timeoutMs`, `maxOutputBytes`,
`memoryMb`, `lockFile`, and an optional `integrity` value.

String entries and entries without a mode remain `trusted` and run in-process
for compatibility. See the [plugin sandbox](plugin_sandbox.md) before granting
capabilities.

## CLI

```text
deno x jsr:@steno/steno [build|dev|doctor] [--config path]
```

`build` is the default. `dev` watches and serves the site; `doctor` reports
common project/configuration problems.
