# API reference

The public module is `jsr:@steno/steno` (or this repository's `mod.ts`).

```ts
import { filters, render, Steno, Theme } from "jsr:@steno/steno";
import type { SiteConfig, StenoPlugin, StenoTheme } from "jsr:@steno/steno";
```

## `Steno`

`new Steno(configPath?, autoBuildOnInit?, hooks?)` creates the site generator.
`build()` compiles it, `dev()` starts the watched development server, and
`preview(port?)` serves the already-built production output without watching; it
throws if `build()` has not produced output yet. `cancel()` terminates active
isolated-plugin workers; it also runs automatically after every `build()` and
`dev()` rebuild, so calling it yourself is only needed to stop work early. The
default configuration path is `content/.steno/config.yml`. `hooks` may provide
`beforeBuild`, `afterPage`, and `afterBuild` callbacks; the `SiteConfig` passed
to `beforeBuild`/`afterBuild` includes a `pages` array (slug, title,
description, date) generated from the current page set, see
[Transactional builds](atomic_builds.md#plugin-and-hook-paths).

## `Theme`

`new Theme(themeData, userConfig?)` creates a theme. `Theme.loadFromDirectory`
loads a convention-based local theme. `renderLayout(name, content, variables)`
and `renderComponent(name, variables)` render templates and return
`Promise<string>`; `copyAssets(outputDir)` writes its assets.

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

Exports include `SiteConfig`, `StenoTheme`, `StenoPlugin`, `StenoHooks`,
`PluginEntry`, `PluginSourcePolicy`, the deprecated `PluginSecurityConfig`
alias, `IsolatedPluginPermissions`, `CollectionConfig`, `NavigationNode`,
`HeadTag`, `PageConfigOverrides`, `ThemeConfigField`, `MarkdownTokens`,
`TauOptions`, `TauLimits`, `TauCacheStats`, `TauErrorCode`, `Collection`,
`CollectionItem`, and `CollectionMap`. The authoritative contracts are exported
from `mod.ts`.
