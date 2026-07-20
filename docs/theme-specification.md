# Theme specification

Themes are either modules that export a `StenoTheme` object or local directories
loaded with the conventions described in
[Themes and Scribe](theme_development.md).

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
paths to strings, `Uint8Array`s, or URLs. Optional `plugins` run with the site's
plugins unless `custom.pluginSecurity.allowThemePlugins` is `false`.

`configSchema` declares string, number, or boolean settings with optional
defaults/descriptions. Schema defaults, `defaultConfig`, and site
`custom.themeConfig` are applied in that order. This merge is shallow.
