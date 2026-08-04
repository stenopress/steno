# Plugins

Plugins extend the build pipeline. Configure a package string or a package plus
options; the module must default-export a factory that returns a `StenoPlugin`.

Every plugin declares an execution `mode`: `trusted` (the default, in-process,
full Deno permissions) or `isolated` (a dedicated subprocess with every
capability denied until explicitly granted). Prefer `isolated` for any plugin
you did not write yourself - see [Trust and permissions](#trust-and-permissions)
below and the [plugin sandbox](plugin_sandbox.md) for the full model.

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

**`mode: isolated`** runs the plugin in a dedicated subprocess with every
capability - filesystem, network, environment, subprocess, FFI - denied by
default. Grant only what the plugin actually needs under `permissions`. This is
the recommended mode for any plugin you did not write yourself. See the
[plugin sandbox](plugin_sandbox.md) for its full permission model, guarantees,
and limitations.

**`mode: trusted`** (the default, kept for compatibility) runs the plugin's
factory and hooks in the Steno process itself. It inherits every Deno permission
granted to Steno, including filesystem, network, environment, subprocess, FFI,
and Node compatibility access when those permissions are available. A trusted
plugin can read or modify project files and generated output without
restriction. Theme-bundled plugins run at this same trust level unless disabled
with `allowThemePlugins: false`.

`pluginSourcePolicy` is a top-level module source policy, not an execution
sandbox - it applies to both modes equally. It does not inspect a plugin's
transitive imports and cannot prevent an allowed JSR or npm plugin from
importing another module or a Node built-in.

Only `jsr:` and `npm:` top-level plugin specifiers are allowed by default.
Enable other sources deliberately under `pluginSourcePolicy`; see
[Configuration](config_reference.md#plugin-source-policy).

Before adding any plugin or theme, trusted or isolated:

- Review and trust its publisher and source.
- Pin a version instead of following a mutable tag or URL.
- Review updates before accepting them.
- Grant Steno, and any isolated plugin, only the permissions the project
  actually requires.

Do not load untrusted plugins unless the entry explicitly sets `mode: isolated`.

## Official plugins

Steno publishes two official plugins, installable directly or through the
`--plugins tailwind,shiki` flag of `deno create jsr:@steno/init`:

- `jsr:@steno/plugin-tailwind` compiles Tailwind CSS during the build.
- `jsr:@steno/plugin-shiki` highlights fenced code blocks with Shiki.

Both are declared with `mode: trusted` by the scaffolder and run in-process -
they are maintained in the same project and reviewed alongside Steno itself, so
this is a deliberate choice, not the general recommendation above. Pin an exact
version rather than a range when adding them manually. Either can also be
configured with `mode: isolated` if you prefer the stricter default; see
[Isolated plugin entries](config_reference.md#isolated-plugin-entries) for the
permission fields to grant (each plugin's own docs list what filesystem and
network access it actually needs).
