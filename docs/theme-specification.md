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
