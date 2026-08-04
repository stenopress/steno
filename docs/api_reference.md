# API reference

Most projects never need this page: the `deno x jsr:@steno/steno` CLI covers
building, developing, and previewing a site. Read this if you're embedding Steno
in your own script or tool, writing a plugin, or calling `render()` directly
instead of through a theme.

The public module is `jsr:@steno/steno` (or this repository's `mod.ts`).

```ts
import { filters, mergeTheme, render, Steno, Theme } from "jsr:@steno/steno";
import type { SiteConfig, StenoPlugin, StenoTheme } from "jsr:@steno/steno";
```

## `Steno`

`new Steno(configPath?, autoBuildOnInit?, hooks?)` creates the site generator.
The default configuration path is `content/.steno/config.yml`.

- `ready()` resolves once construction-time work has settled, including the
  initial build if `autoBuildOnInit` is `true` (the default). Await this after
  constructing a `Steno` with `autoBuildOnInit: true` if you want to observe an
  initialization failure directly, instead of it surfacing as an unhandled
  rejection.
- `build()` compiles the site once.
- `dev()` starts the watched development server: it builds, serves the output,
  and rebuilds on every relevant file change, including the config file itself,
  until the process is stopped.
- `preview(port?)` serves the already-built production output without watching;
  it throws if `build()` has not produced output yet.
- `cancel()` terminates active isolated-plugin workers. It also runs
  automatically after every `build()` and `dev()` rebuild, so calling it
  yourself is only needed to stop work early.

`hooks` may provide `beforeBuild`, `afterPage`, and `afterBuild` callbacks; the
`SiteConfig` passed to `beforeBuild`/`afterBuild` includes a `pages` array
(slug, title, description, date) generated from the current page set, see
[Transactional builds](atomic_builds.md#plugin-and-hook-paths).

## `Theme`

`new Theme(themeData, userConfig?)` creates a theme from a plain `StenoTheme`
object. `Theme.loadFromDirectory` loads a convention-based local theme (a folder
with `theme.yaml`) instead. `renderLayout(name, content, variables)` and
`renderComponent(name,
variables)` render templates and return
`Promise<string>`. `copyAssets(outputDir, occupiedPaths?, hashAssets?)` writes
the theme's assets to disk and returns a manifest mapping each asset's source
path to its (possibly content-hashed) output path; see
[Themes and Tau](theme_development.md#layout-context).

`mergeTheme(base, overrides)` merges a base `StenoTheme` (for example, one of
the three official themes' exported default) with overrides, producing a new
`StenoTheme` for extending a bundled theme instead of writing one from scratch.
See
[Extending a bundled theme](theme-specification.md#extending-a-bundled-theme)
for the merge rules and a full example.

## Tau

`render({ template, context, components, filePath?, includeResolver?, limits? })`
renders a template and returns `Promise<string>`. It is async because a template
expression may call a context-supplied function that returns a promise
(`{someAsyncFn()}`); the result is awaited implicitly, so a sync function works
the same way. Filters may also return a promise. `components` is required (use
`{}` when none). `includeResolver` is a caller-supplied
`(path: string) => string` function that resolves `{@include "path"}` directives
to template source; it is required only when a template uses `{@include}`, and
API consumers rendering templates directly (outside a theme) provide their own.
`filters` is the mutable null-prototype map of built-in filter functions,
enabling applications to add filters before rendering.

Tau failures use `TauError`; its `code` property is a stable `TauErrorCode`, one
of `TAU_COMPONENT_CYCLE`, `TAU_COMPONENT_NOT_FOUND`, `TAU_INCLUDE_CYCLE`,
`TAU_INCLUDE_RESOLVER_MISSING`, `TAU_INVALID_IDENTIFIER`, `TAU_INVALID_LIMIT`,
`TAU_LIMIT_DEPTH`, `TAU_LIMIT_ITERATIONS`, `TAU_LIMIT_OUTPUT`,
`TAU_LIMIT_TEMPLATE`, `TAU_PARSE_EMPTY`, `TAU_PARSE_EXPECTED_TOKEN`,
`TAU_PARSE_INVALID_EACH`, `TAU_PARSE_UNCLOSED_BLOCK`, `TAU_RENDER_FAILED`,
`TAU_UNKNOWN_FILTER`, `TAU_UNSAFE_EXPRESSION`, `TAU_UNSAFE_INCLUDE_PATH`,
`TAU_UNSAFE_PROP`, or `TAU_UNSAFE_URL`. `clearTauCache()` releases compiled
templates and resets counters. `getTauCacheStats()` reports the bounded cache's
size, its fixed capacity of 512 compiled templates (least-recently-used
eviction), hits, misses, and evictions. See the
[Tau language specification](tau_syntax.md) for grammar, value, escaping, URL,
limit, and compatibility semantics.

## Types

Exports include `SiteConfig`, `StenoTheme`, `ThemeConfig`, `StenoPlugin`,
`StenoHooks`, `PluginEntry`, `PluginSourcePolicy`, the deprecated
`PluginSecurityConfig` alias, `IsolatedPluginPermissions`, `CollectionConfig`,
`NavigationNode`, `HeadTag`, `PageConfigOverrides`, `ThemeConfigField`,
`MarkdownTokens`, `FilterFunction`, `TauOptions`, `TauLimits`, `TauCacheStats`,
`TauErrorCode`, `Collection`, `CollectionItem`, and `CollectionMap`, among
others. This list isn't exhaustive and Steno is still pre-1.0, so treat `mod.ts`
itself as the authoritative, up-to-date list of what's exported.
