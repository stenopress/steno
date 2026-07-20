# Plugins

Plugins extend the build pipeline. Configure a package string or a package plus
options; the module must default-export a factory that returns a `StenoPlugin`.

```yaml
plugins:
  - jsr:@example/links
  - package: npm:@example/minify
    options: { enabled: true }
```

```ts
import type { StenoPlugin } from "jsr:@steno/steno";

export default function createPlugin(
  options: Record<string, unknown>,
): StenoPlugin {
  return {
    name: "example",
    transformHtml: (html) =>
      html.replaceAll("TODO", String(options.label ?? "Done")),
  };
}
```

Available hooks are `beforeBuild(config)`, `transformAst(tokens)`,
`transformHtml(html)`, `afterPage({ path, html })`, and `afterBuild(config)`.
Plugins run in declaration order. AST/HTML transforms apply to page bodies and
collection content. Theme plugins run before configured site plugins and can be
disabled with `allowThemePlugins: false`.

Only `jsr:` and `npm:` plugin imports are allowed by default. Enable other
sources deliberately under `custom.pluginSecurity`; see
[Configuration](config_reference.md#plugin-security).
