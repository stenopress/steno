# API reference

Most projects never need this page - the `deno x jsr:@steno/steno` CLI already covers building,
developing, and previewing a site. Read on if you're embedding Steno in your own script or tool,
writing a plugin, or calling `render()` directly instead of through a theme.

The public module is `jsr:@steno/steno` (or this repository's `mod.ts`). Every export from `mod.ts`
is listed on this page - nothing else in the package counts as public API, even if you can technically
reach it by import path.

```ts
import { filters, mergeTheme, render, Steno, Theme } from "jsr:@steno/steno";
import type { SiteConfig, StenoPlugin, StenoTheme } from "jsr:@steno/steno";
```

## Stability

- **Stable** - the everyday surface: construction, build/dev/preview, theme and plugin authoring,
  Tau rendering, and their supporting types. Breaking one of these is a breaking change to Steno
  itself.
- **Advanced** - real, supported exports for less common needs (embedding Steno's own CLI, Tau cache
  introspection). Still covered by the same compatibility promise, just narrower audiences.
- **Deprecated** - kept for backward compatibility, open-ended (no committed removal version yet).
  Only `PluginSecurityConfig` (the `custom.pluginSecurity` alias type) is in this tier today; see
  [Plugin source policy](config_reference.md#plugin-source-policy).

Nothing currently exported from `mod.ts` is internal-only; every export below is one of the first
two tiers.

## `Steno`

`new Steno(configPath?, autoBuildOnInit?, hooks?)` creates the site generator. The default
configuration path is `content/.steno/config.yml`.

- `ready()` resolves once construction-time work has settled, including the initial build if
  `autoBuildOnInit` is `true` (the default). Await this after constructing a `Steno` with
  `autoBuildOnInit: true` if you want to observe an initialization failure directly, instead of it
  surfacing as an unhandled rejection.
- `build()` compiles the site once.
- `dev()` starts the watched development server: it builds, serves the output, and rebuilds on every
  relevant file change, including the config file itself, until the process is stopped.
- `preview(port?)` serves the already-built production output without watching; it throws if
  `build()` has not produced output yet.
- `cancel()` terminates active isolated-plugin workers. It also runs automatically after every
  `build()` and `dev()` rebuild, so calling it yourself is only needed to stop work early.

`hooks` may provide `beforeBuild`, `afterPage`, and `afterBuild` callbacks (typed as `StenoHooks`);
the `SiteConfig` passed to `beforeBuild`/`afterBuild` includes a `pages` array (slug, title,
description, date) generated from the current page set, see
[Transactional builds](atomic_builds.md#plugin-and-hook-paths). `afterPage` receives a
`GeneratedPage` - the staging path (`path`), the file's eventual real location (`finalPath`), and
its rendered `html`.

**Advanced:** `runStenoCli(args)` runs the same CLI `mod.ts` runs when invoked directly (`build`,
`dev`, `preview`, `doctor`, `help`), for embedding Steno's own CLI in another tool instead of
constructing `Steno` yourself.

Errors that fail a production build - a theme, plugin, data file, or redirect that couldn't be
honored - throw `StenoDiagnosticError`, whose `diagnostics: Diagnostic[]` property carries every
problem found, not just the first. See
[How Steno reports problems](troubleshooting.md#how-steno-reports-problems) for the full model
(severity, and what's fatal in `dev` versus `build`).

## `Theme`

`new Theme(themeData, userConfig?)` creates a theme from a plain `StenoTheme` object.
`Theme.loadFromDirectory` loads a convention-based local theme (a folder with `theme.yaml`) instead.
`renderLayout(name, content, variables)` and `renderComponent(name, variables)` render templates and
return `Promise<string>`; `variables` is the `PageRenderContext` shape (site/theme/page data merged
for rendering). `copyAssets(outputDir, occupiedPaths?, hashAssets?)` writes the theme's assets to
disk and returns a manifest mapping each asset's source path to its (possibly content-hashed) output
path; see [Themes and Tau](theme_development.md#layout-context).

`mergeTheme(base, overrides)` merges a base `StenoTheme` (for example, one of the three official
themes' exported default) with overrides, producing a new `StenoTheme` for extending a bundled theme
instead of writing one from scratch. See
[Extending a bundled theme](theme-specification.md#extending-a-bundled-theme) for the merge rules
and a full example. `ThemeConfig` types a theme's resolved, validated configuration object.

## Tau

`render({ template, context, components, filePath?, includeResolver?, limits? })` renders a template
and returns `Promise<string>`. It is async because a template expression may call a context-supplied
function that returns a promise (`{someAsyncFn()}`); the result is awaited implicitly, so a sync
function works the same way. Filters may also return a promise. `components` is required (use `{}`
when none). `includeResolver` is a caller-supplied `(path: string) => string` function that resolves
`{@include "path"}` directives to template source; it is required only when a template uses
`{@include}`, and API consumers rendering templates directly (outside a theme) provide their own.
`filters` is the mutable null-prototype map of built-in filter functions, enabling applications to
add filters before rendering; `FilterFunction` types an entry in that map. `TauOptions` types
`render()`'s full parameter object; `TauLimits` types its `limits` field (nested render/include
depth, loop iterations, output size, template size).

Tau failures use `TauError`; its `code` property is a stable `TauErrorCode`, one of
`TAU_COMPONENT_CYCLE`, `TAU_COMPONENT_NOT_FOUND`, `TAU_INCLUDE_CYCLE`,
`TAU_INCLUDE_RESOLVER_MISSING`, `TAU_INVALID_IDENTIFIER`, `TAU_INVALID_LIMIT`, `TAU_LIMIT_DEPTH`,
`TAU_LIMIT_ITERATIONS`, `TAU_LIMIT_OUTPUT`, `TAU_LIMIT_TEMPLATE`, `TAU_PARSE_EMPTY`,
`TAU_PARSE_EXPECTED_TOKEN`, `TAU_PARSE_INVALID_EACH`, `TAU_PARSE_UNCLOSED_BLOCK`,
`TAU_RENDER_FAILED`, `TAU_UNKNOWN_FILTER`, `TAU_UNSAFE_EXPRESSION`, `TAU_UNSAFE_INCLUDE_PATH`,
`TAU_UNSAFE_PROP`, or `TAU_UNSAFE_URL`. Source-backed parse errors also carry a `TauErrorLocation`
(`filePath`, `line`, `column`). See the [Tau language specification](tau_syntax.md) for grammar,
value, escaping, URL, limit, and compatibility semantics.

**Advanced:** `clearTauCache()` releases compiled templates and resets counters.
`getTauCacheStats()` reports the bounded cache's size, its fixed capacity of 512 compiled templates
(least-recently-used eviction), hits, misses, and evictions; `TauCacheStats` types its return value.

## Collections

A `Collection` (typed `CollectionItem[]` under `name`) groups pages from one `contentDir`
subdirectory; `CollectionMap` is the full `{ [name]: Collection }` object exposed to templates as
`collections`. `CollectionConfig` types a `collections.<name>` entry in `SiteConfig` (`sortBy`,
`order`, `limit`, `filter`, `schema`); `CollectionFieldSchema` types one field of that `schema`. See
[Collections](content.md#collections).

## Markdown AST transformation (`transformAst`)

A `StenoPlugin`'s `transformAst(tokens)` hook receives - and must return - `marked`'s real lexer
output, typed as `MarkdownTokens` (a `MarkdownToken[]` plus a `links` map of reference-link
definitions). `MarkdownToken` only declares the fields every token kind is guaranteed to have
(`type`, `raw`, optional `text`/`tokens`) - it deliberately doesn't claim you can construct a plain
`{ type, raw }` object and get correct rendering back. The tokens flow straight into
`marked.parser()` afterward, which needs each token's real, kind-specific fields (a heading's
`depth`, a list's `ordered`/`items`, a code block's `lang`, and so on). To read or set those, narrow
on `type` and cast

- never build a plain object of this shape expecting it to render like a real token.

## Head tags

`HeadTag` is the union of `MetaHeadTag`, `LinkHeadTag`, and `ScriptHeadTag` (all extending the
common `HeadTagBase`), used for `config.head` and a page's `steno.head` frontmatter override; see
[Managed head tags](config_reference.md#managed-head-tags).

## Plugin and theme contracts

`StenoPlugin` types a plugin's hook object (`name`, `transformAst`, `transformHtml`, `beforeBuild`,
`afterPage`, `afterBuild`); `StenoTheme` types a module-based theme's exported shape (`layouts`,
`components`, `assets`, `configSchema`, `defaultConfig`, optional `plugins`); `PageRenderContext`
types the object passed into a layout/component render. `StenoHooks` types the `hooks` argument to
`new Steno(...)`.

`PluginEntry` types a `plugins` array entry in `SiteConfig` (`package`, `options`, `mode`,
`permissions`, and the isolated-mode fields); `IsolatedPluginPermissions` types its `permissions`
object; `PluginSourcePolicy` types `config.pluginSourcePolicy`. See
[Plugins](plugins.md#trust-and-permissions) and [Plugin sandbox](plugin_sandbox.md).

**Deprecated (open-ended):** `PluginSecurityConfig` types the historical `custom.pluginSecurity`
alias for `pluginSourcePolicy`. It has no committed removal version - it's kept working, just not
the type to reach for in new code.

## Configuration and navigation

`SiteConfig` types a full, resolved `config.yml`/`config.toml`; see
[Configuration reference](config_reference.md) for every field and its validated shape.
`ThemeConfigField` types one entry in a theme's `configSchema`. `NavigationNode` types a
`config.navigation` (or `steno.navigation` frontmatter) entry (`title`, `url?`, `children?`).
`PageConfigOverrides` types the resolved shape of a page's `steno.*` frontmatter namespace
(`title`/`description`/`author`/`head`/`navigation`/`themeConfig`/`globals` overrides).

## Diagnostics

`Diagnostic` types one problem found while resolving a project's theme, plugins, data files,
redirects, or config (`code`, `severity`, `message`, `file?`, `hint?`). `StenoDiagnosticError` is
the error a production build throws when any diagnostic is `error`-severity; its `diagnostics`
property carries all of them. See
[How Steno reports problems](troubleshooting.md#how-steno-reports-problems).
