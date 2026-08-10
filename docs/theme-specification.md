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

`name`, `version`, and `layouts` are required. `assets` map output-relative paths to strings,
`Uint8Array`s, or URLs. Optional `plugins` are trusted, in-process code and run with Steno's Deno
permissions unless `pluginSourcePolicy.allowThemePlugins` is `false`.

`configSchema` declares `string`, `number`, `integer`, `boolean`, `array`, or `object` settings.
Fields support `required`, `default`, `description`, and `enum`. Strings support `minLength`,
`maxLength`, and `pattern`; numbers support `minimum` and `maximum`; arrays support `items`,
`minItems`, and `maxItems`; objects support nested `properties` and `additionalProperties: false`.

Schema defaults, `defaultConfig`, and site `themeConfig` are applied in that order, then validated.
The top-level merge is shallow, while schema validation and defaults can be recursive. Undeclared
top-level keys are allowed for backwards compatibility. Invalid values fail theme loading with a
path to the offending setting - which fails `steno build` outright and only prints in `steno dev`;
see [How Steno reports problems](troubleshooting.md#how-steno-reports-problems).

## Extending a bundled theme

Each official theme's `mod.ts` exports its `StenoTheme` object as the module default, in addition to
being loadable directly as `theme:
jsr:@steno/theme-minimal`. Import that object and pass it to
`mergeTheme` to override or add to it without repeating everything it already defines:

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
`defaultConfig` shallowly by key: a key present in `overrides` replaces that entry in `base`; every
other key from `base` survives untouched. `name`, `version`, and `plugins` are replaced wholesale
when `overrides` sets them, otherwise `base`'s value is kept. This is why `mergeTheme` exists
instead of a plain object spread: overriding one entry with
`{ ...minimal, layouts: { layout: "..." } }` replaces the whole `layouts` object, so any other
layout, component, or asset `base` ships (for example `theme-marketing-minimal`'s four separate
`assets` entries) would silently disappear too. `mergeTheme` merges each of those objects key by key
instead, so only the entry actually named in `overrides` changes.

This only applies to module-based themes (an importable `StenoTheme` object). A directory-based
theme (`theme.yaml`) has no equivalent object to import and merge - copy or `{@include}` from it
instead; see [Themes and Tau](theme_development.md).

## Resolution

`theme` accepts, in order of how Steno tries to resolve it:

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
