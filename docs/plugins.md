# Plugins

Plugins are trusted code that extend the build pipeline. Configure a package
string or a package plus options; the module must default-export a factory that
returns a `StenoPlugin`.

```yaml
plugins:
  - jsr:@example/links
  - package: npm:@example/minify
    mode: isolated
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

Build lifecycle hooks operate on Steno's staging output. `config.output` points
to that staging directory. Plugin `afterPage` receives the staging file as
`path` and its eventual published location as `finalPath`. Extensions must not
write directly to the final output; see
[Transactional builds](atomic_builds.md).

## Trust and permissions

Plugin factories and hooks run in the Steno process. They inherit every Deno
permission granted to Steno, including filesystem, network, environment,
subprocess, FFI, and Node compatibility access when those permissions are
available. A plugin can read or modify project files and generated output.
Theme-bundled plugins have the same trust level.

`custom.pluginSourcePolicy` is a top-level module source policy, not an
execution sandbox. It does not inspect a plugin's transitive imports and cannot
prevent an allowed JSR or npm plugin from importing another module or a Node
built-in.

Only `jsr:` and `npm:` top-level plugin specifiers are allowed by default.
Enable other sources deliberately under `custom.pluginSourcePolicy`; see
[Configuration](config_reference.md#plugin-source-policy).

Before adding a plugin or a theme:

- Review and trust its publisher and source.
- Pin a version instead of following a mutable tag or URL.
- Review updates before accepting them.
- Grant Steno only the Deno permissions required by the project.

Do not load untrusted plugins unless the entry explicitly sets `mode: isolated`.
See the [plugin sandbox](plugin_sandbox.md) for its permissions, guarantees, and
limitations.
