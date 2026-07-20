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

## Scribe

`render({ template, context, components, filePath?, includeResolver? })` renders
a template. `components` is required (use `{}` when none). `filters` is the
mutable map of built-in filter functions, enabling applications to add filters
before rendering.

## Types

Exports include `SiteConfig`, `StenoTheme`, `StenoPlugin`, `StenoHooks`,
`PluginEntry`, `PluginSourcePolicy`, the deprecated `PluginSecurityConfig`
alias, `CollectionConfig`, `NavigationNode`, `ThemeConfigField`, `Collection`,
`CollectionItem`, and `CollectionMap`. The authoritative contracts are in
`src/types.ts` and are exported from `mod.ts`.
