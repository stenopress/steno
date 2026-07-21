# API reference

The public module is `jsr:@steno/steno` (or this repository's `mod.ts`).

```ts
import { filters, render, Steno, Theme } from "jsr:@steno/steno";
import type { SiteConfig, StenoPlugin, StenoTheme } from "jsr:@steno/steno";
```

## `Steno`

`new Steno(configPath?, autoBuildOnInit?, hooks?)` creates the site generator.
`build()` compiles it, and `dev()` starts the watched development server. The
default configuration path is `content/.steno/config.yml`. `hooks` may provide
`beforeBuild`, `afterPage`, and `afterBuild` callbacks.

## `Theme`

`new Theme(themeData, userConfig?)` creates a theme. `Theme.loadFromDirectory`
loads a convention-based local theme. `renderLayout(name, content, variables)`
and `renderComponent(name, variables)` render templates; `copyAssets(outputDir)`
writes its assets.

## Tau

`render({ template, context, components, filePath?, includeResolver?, limits? })`
renders a template. `components` is required (use `{}` when none). `filters` is
the mutable null-prototype map of built-in filter functions, enabling
applications to add filters before rendering.

Tau failures use `TauError`; its `code` property is a stable `TauErrorCode`.
`clearTauCache()` releases compiled templates and resets counters.
`getTauCacheStats()` reports the bounded cache's size, capacity, hits, misses,
and evictions. See the [Tau language specification](tau_syntax.md) for grammar,
value, escaping, URL, limit, and compatibility semantics.

## Types

Exports include `SiteConfig`, `StenoTheme`, `StenoPlugin`, `StenoHooks`,
`PluginEntry`, `PluginSourcePolicy`, the deprecated `PluginSecurityConfig`
alias, `CollectionConfig`, `NavigationNode`, `ThemeConfigField`, `TauOptions`,
`TauLimits`, `TauCacheStats`, `TauErrorCode`, `Collection`, `CollectionItem`,
and `CollectionMap`. The authoritative contracts are exported from `mod.ts`.
