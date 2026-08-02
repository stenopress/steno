# Theme specification

Themes are either modules that export a `StenoTheme` object or local directories
loaded with the conventions described in [Themes and Tau](theme_development.md).

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

`name`, `version`, and `layouts` are required. `assets` map output-relative
paths to strings, `Uint8Array`s, or URLs. Optional `plugins` are trusted,
in-process code and run with Steno's Deno permissions unless
`custom.pluginSourcePolicy.allowThemePlugins` is `false`.

`configSchema` declares `string`, `number`, `integer`, `boolean`, `array`, or
`object` settings. Fields support `required`, `default`, `description`, and
`enum`. Strings support `minLength`, `maxLength`, and `pattern`; numbers support
`minimum` and `maximum`; arrays support `items`, `minItems`, and `maxItems`;
objects support nested `properties` and `additionalProperties: false`.

Schema defaults, `defaultConfig`, and site `custom.themeConfig` are applied in
that order, then validated. The top-level merge is shallow, while schema
validation and defaults can be recursive. Undeclared top-level keys are allowed
for backwards compatibility. Invalid values fail theme loading with a path to
the offending setting.

## Resolution

`custom.theme` accepts, in order of how Steno tries to resolve it:

1. One of the three bundled theme specifiers, `jsr:@steno/theme-minimal`,
   `jsr:@steno/theme-docs-minimal`, or `jsr:@steno/theme-marketing-minimal`,
   which Steno loads from its own bundled copy without a network request.
2. A local path (starting with `.`, `/`, or `file://`). If the directory
   contains `theme.yaml` or `theme.yml`, it loads as a convention-based
   directory theme; see [Themes and Tau](theme_development.md). Otherwise Steno
   looks for `mod.ts`, `theme.ts`, or `index.ts`, in that order, and imports the
   first one found as a module exporting a `StenoTheme`. A local directory with
   neither a theme manifest nor one of those three files fails to load.
3. Any other specifier (`jsr:`, `npm:`, or `https:`) is imported directly as a
   module exporting a `StenoTheme`.
