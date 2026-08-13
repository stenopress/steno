# Theme specification

Themes are either modules that export a `StenoTheme` object or local directories loaded with the
conventions described in [Themes and Tau](theme_development.md).

```ts
import type { StenoTheme } from "jsr:@steno/steno";

export default {
  name: "my-theme",
  version: "1.0.0",
  layouts: { layout: "<main>{@html content}</main>" },
  components: { Header: "<header>{title}</header>" },
  assets: { "site.css": "main { max-width: 70ch }" },
  defaultConfig: { accent: "indigo" },
} satisfies StenoTheme;
```

`name`, `version`, and `layouts` are required. `assets` maps output-relative paths to strings,
`Uint8Array`s, or URLs. Optional `plugins` are trusted, in-process code, so they run with Steno's
own Deno permissions unless you set `pluginSourcePolicy.allowThemePlugins` to `false`.

`configSchema` declares `string`, `number`, `integer`, `boolean`, `array`, or `object` settings.
Fields support `required`, `default`, `description`, and `enum`. Strings support `minLength`,
`maxLength`, and `pattern`; numbers support `minimum` and `maximum`; arrays support `items`,
`minItems`, and `maxItems`; objects support nested `properties` and `additionalProperties: false`.

Schema defaults, `defaultConfig`, and site `themeConfig` get applied in that order, then validated.
The top-level merge is shallow, but schema validation and defaults can go recursive. Undeclared
top-level keys are allowed, for backwards compatibility. An invalid value fails theme loading with a
path straight to the offending setting - that fails `steno build` outright, and only prints as a
warning in `steno dev`; see
[How Steno reports problems](troubleshooting.md#how-steno-reports-problems).

## Extending a bundled theme

Each official theme's `mod.ts` exports its `StenoTheme` object as the module default, on top of
being loadable directly as `theme: jsr:@steno/theme-minimal`. Import that object and hand it to
`mergeTheme` to override or add to it, without repeating everything it already defines:

```ts
import { mergeTheme } from "jsr:@steno/steno";
import minimal from "jsr:@steno/theme-minimal";

export default mergeTheme(minimal, {
  layouts: {
    // Overrides "layout"; every other layout from `minimal` is untouched.
    layout: `<main class="custom">{@html content}</main>`,
  },
  defaultConfig: { accent: "indigo" },
}) satisfies StenoTheme;
```

`mergeTheme(base, overrides)` merges `layouts`, `components`, `assets`, `configSchema`, and
`defaultConfig` shallowly, key by key: a key present in `overrides` replaces that entry in `base`,
and every other key from `base` survives untouched. `name`, `version`, and `plugins` get replaced
wholesale when `overrides` sets them, otherwise `base`'s value sticks. This is exactly why
`mergeTheme` exists instead of a plain object spread: overriding one entry with
`{ ...minimal, layouts: { layout: "..." } }` replaces the whole `layouts` object, so any other
layout, component, or asset `base` ships (for example `theme-marketing-minimal`'s four separate
`assets` entries) would silently vanish too. `mergeTheme` merges each of those objects key by key
instead, so only the entry you actually named in `overrides` changes.

This only applies to module-based themes (an importable `StenoTheme` object). A directory-based
theme (`theme.yaml`) has its own equivalent - `extends` - covered next.

## Extending a directory theme

A directory theme (`theme.yaml`) overrides another directory theme by setting `extends`:

```yaml
# theme.yaml
name: My Minimal
version: 1.0.0
extends: jsr:@steno/theme-minimal
```

```text
theme/
├── theme.yaml
└── layouts/
    └── layout.tau   # overrides "layout"; every other layout from theme-minimal is untouched
```

`extends` accepts one of the three bundled specifiers (`jsr:@steno/theme-minimal`,
`jsr:@steno/theme-docs-minimal`, `jsr:@steno/theme-marketing-minimal`, resolved from Steno's own
packaged copy, no network request) or a local path starting with `.`, `/`, or `file://` - relative
paths resolve against the extending theme's own directory, not the current working directory, so
the theme keeps working regardless of where `steno build` runs from. Arbitrary `jsr:`, `npm:`, or
`https:` module specifiers aren't accepted here - a directory theme's `extends` always resolves to
another `theme.yaml` directory, never an importable `StenoTheme` module; use `mergeTheme` from a
module theme instead if you need that.

Layouts, components, assets, `configSchema`, and `defaultConfig` merge exactly like `mergeTheme`
above: a file the child theme redeclares (same layout name, same component key, same asset path)
replaces the base's, everything else survives. `name` and `version` always come from the child.
Chains can go more than one level deep (`extends` all the way up); a theme that appears twice in its
own chain fails to load with a clear "circular extends chain" error instead of hanging.

## Resolution

`theme` accepts a few different forms:

1. One of the three bundled theme specifiers, `jsr:@steno/theme-minimal`,
   `jsr:@steno/theme-docs-minimal`, or `jsr:@steno/theme-marketing-minimal`, which Steno loads from
   its own bundled copy without a network request.
2. A local path (starting with `.`, `/`, or `file://`). If the directory contains `theme.yaml` or
   `theme.yml`, it loads as a convention-based directory theme; see
   [Themes and Tau](theme_development.md). Otherwise Steno looks for `mod.ts`, `theme.ts`, or
   `index.ts`, in that order, and imports the first one found as a module exporting a `StenoTheme`.
   A local directory with neither a theme manifest nor one of those three files fails to load.
3. Any other specifier (`jsr:`, `npm:`, or `https:`) is imported directly as a module exporting a
   `StenoTheme`.
