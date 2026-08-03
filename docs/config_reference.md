# Configuration reference

Steno reads YAML (`.yml`/`.yaml`) or TOML from `content/.steno/config.yml` by
default. Pass another path with `--config`.

```yaml
title: My site
description: A concise description
author: Ada Lovelace
contentDir: content # default: content
output: dist # default: dist
publicDir: public # default: public; set to false to disable
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

theme: ./theme
themeConfig:
  accent: purple
globals:
  repository: https://example.com/source
shortUrls: true
devPort: 5735

custom:
  stylesheets:
    - /assets/site.css

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

## Redirects

Each `redirects` entry writes a static meta-refresh HTML page rather than a
server-level redirect. `from` must start with `/`; entries that do not are
skipped with a console warning. An empty `to` value is skipped the same way.
`shortUrls` controls the emitted path: with `shortUrls: true`, `/old-url`
becomes `<output>/old-url/index.html`; otherwise it becomes
`<output>/old-url.html`. Redirects participate in the same output-collision
detection as pages and theme assets, so a redirect that would overwrite an
existing page or asset fails the build with an `Output collision` error.

`title`, `description`, and `author` are the site fields exposed as `site` in
templates. `contentDir` and `output` are relative to the working directory
unless absolute. `publicDir` is relative to `contentDir`; files under it are
copied verbatim to the output root (see
[Public assets](content.md#public-assets)). `navigation` optionally supplies a
tree of `{ title, url,
children }` nodes for themes.

## Managed head tags

`head` entries are injected into the rendered document independently of the
active theme. A meta entry may use `name`, `property` (including Open Graph),
`httpEquiv`, or `charset`. Link entries require `tag: link`, `rel`, and `href`.
Script entries use `tag: script` with `src` or inline `content`, and support
`type`, `async`, `defer`, `noModule`, `integrity`, `crossOrigin`, and
`referrerPolicy`.

Pages can add or replace entries through `steno.head` frontmatter. A page entry
replaces a site entry when they share the same identity, and is otherwise
appended in declaration order. Identity is, in priority order: an explicit `key`
if either entry sets one; for a meta tag, its `name`, `property`, or `httpEquiv`
value lowercased (a `charset` meta is always its own single identity); for a
link tag, `rel: canonical` is always one shared identity regardless of `href`,
while any other `rel` is identified by `rel` and `href` together; for a script
tag, its `src`. Inline scripts without `src` and link tags without a recognized
`rel` have no identity and are always appended. A meta entry must set exactly
one of `name`, `property`, `httpEquiv`, or `charset`.

## Theme, globals, and other core settings

`theme` accepts a local directory, a local module, or an importable `jsr:`,
`npm:`, or HTTPS module. `themeConfig` is merged shallowly with theme defaults.
`globals` are available both directly and as `globals` in page layouts.

`shortUrls` defaults to `false`. `devPort` selects the initial development
server port (default 5735). If it is unavailable, Steno scans forward one port
at a time up to 65535 and binds the first free one.

These fields, along with `pluginSourcePolicy` (below), used to live nested under
a `custom` object. That nesting is deprecated: set them at the top level of the
config instead. `steno doctor` warns if it finds any of them still under
`custom`.

## `custom`

`custom` is reserved for free-form, project-specific values that aren't part of
Steno's own config surface — for example a theme-facing `stylesheets` list that
Steno exposes but never reads itself. Anything Steno interprets directly
(`theme`, `themeConfig`, `shortUrls`, `devPort`, `globals`,
`pluginSourcePolicy`) belongs at the top level, not under `custom`.

## Plugin source policy

Top-level plugin specifiers from `jsr:` and `npm:` are allowed. Local file URLs,
HTTP(S), and `node:` specifiers require an explicit opt-in; `data:` and `blob:`
are never allowed.

```yaml
pluginSourcePolicy:
  allowLocal: true
  allowRemoteHttp: false
  allowNodeBuiltins: false
  allowThemePlugins: true # default
```

These settings are source filters rather than a runtime sandbox. They do not
inspect transitive imports or reduce plugin permissions. All configured and
theme-bundled plugins run in-process with the permissions granted to Steno.

The historical `custom.pluginSourcePolicy` and `custom.pluginSecurity` names
remain accepted as deprecated compatibility aliases. New projects should use
top-level `pluginSourcePolicy`.

`allowNodeBuiltins` controls only a configured top-level `node:` specifier. It
cannot prevent a JSR, npm, file, or HTTP(S) plugin from importing a Node
built-in internally.

See [Plugins](plugins.md) before enabling or installing code that executes
during a build.

### Isolated plugin entries

Object plugin entries can set `mode: isolated`. Isolated plugins accept
`permissions` allowlists for `read`, `write`, `net`, `env`, `run`, `ffi`, `sys`,
and remote `import` hosts. They also accept `timeoutMs`, `maxOutputBytes`,
`memoryMb`, `lockFile`, and an optional `integrity` value. When omitted,
`timeoutMs` defaults to 5000, `maxOutputBytes` to 4194304 (4 MiB), and
`memoryMb` to 128.

String entries and entries without a mode remain `trusted` and run in-process
for compatibility. See the [plugin sandbox](plugin_sandbox.md) before granting
capabilities.

### Plugin integrity

Any object plugin entry, `trusted` or `isolated`, may set
`integrity:
sha256-<base64>`. Steno verifies the digest of a `file://` or
`https://` plugin's source before importing it and fails the build on a
mismatch. `jsr:` and `npm:` specifiers cannot be verified this way; pin their
exact version and use a frozen Deno lockfile (`lockFile`, isolated mode only) to
protect their dependency graph instead.

## CLI

```text
deno x jsr:@steno/steno [build|dev|preview|doctor|help] [--config path] [--port number]
```

`build` is the default. `dev` watches and serves the site, `preview` serves the
already-built production output without watching, and `doctor` reports common
project/configuration problems; see [Doctor](doctor.md) for the full check list.
`--port` selects the preview port, which defaults to 4173 and searches upward
for the next available port the same way the dev server does. `preview` requires
a prior `build`: it fails with an error naming the missing output directory if
`dist/` does not exist yet. `preview` always binds to `127.0.0.1`; `dev` binds
to `0.0.0.0`.
