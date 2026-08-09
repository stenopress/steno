# Plugins

A plugin is an optional piece of code that runs during your build and does
something extra: compile Tailwind CSS, highlight code blocks, optimize images,
and so on. Most people only ever add official plugins by name and never write
one themselves, that's covered first below. Writing your own plugin, and the
trust model behind running someone else's code, are covered further down for
when you need them.

## Using an official plugin

Steno publishes four official plugins under the `@steno/` scope:

- `jsr:@steno/plugin-tailwind` compiles Tailwind CSS as part of the build.
- `jsr:@steno/plugin-shiki` adds syntax highlighting to fenced code blocks in
  your Markdown.
- `jsr:@steno/plugin-seo` generates `sitemap.xml`, an RSS feed (`feed.xml`), and
  an Atom feed (`atom.xml`) from your pages.
- `jsr:@steno/plugin-image` optimizes and resizes images referenced by your
  theme.

`plugin-tailwind` and `plugin-shiki` are the two the scaffolder knows about
directly, add them by name when you create a project:

```sh
deno create jsr:@steno/init --plugins tailwind,shiki
```

Any of the four can also be added manually to an existing project's config, each
with its own `options`:

```yaml
plugins:
  - jsr:@steno/plugin-tailwind
  - jsr:@steno/plugin-shiki
  - package: jsr:@steno/plugin-seo
    options:
      siteUrl: https://example.com
      title: My Site
      description: A concise description
      authorName: Ada Lovelace
```

See each plugin's own JSR page for its full option list. The scaffolder pins an
exact version and runs `tailwind`/`shiki` in-process (`mode: trusted`); that's a
deliberate choice for those two, since they are maintained alongside Steno
itself and reviewed the same way. If you add any of the four manually, pin an
exact version too, rather than a version range. See
[Trust and permissions](#trust-and-permissions) below if you would rather run
one in the stricter sandboxed mode instead;
[Isolated plugin entries](config_reference.md#isolated-plugin-entries) lists the
exact permission fields to grant (each plugin's own docs list what filesystem
and network access it actually needs).

## Writing your own plugin

A plugin is a small package whose module default-exports a factory function.
That factory returns an object describing which parts of the build it wants to
hook into:

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

Add it to your config the same way as an official plugin, with an optional
`options` object that gets passed straight to your factory:

```yaml
plugins:
  - jsr:@example/links
  - package: npm:@example/minify
    mode: isolated
    options: { enabled: true }
```

The hooks available are `beforeBuild(config)`, `transformAst(tokens)`,
`transformHtml(html)`, `afterPage({ path, html })`, and `afterBuild(config)`.
Plugins run in the order they're declared. `transformAst` and `transformHtml`
apply to page bodies and collection content alike. A theme's own bundled plugins
run before your site's configured ones, and can be turned off entirely with
`allowThemePlugins: false`.

One important detail: build lifecycle hooks see Steno's temporary staging
output, not the final `dist/` folder, `config.output` in a hook points at that
staging directory. `afterPage` gets both the staging path (`path`) and the
file's eventual real location (`finalPath`). A plugin should never write
directly to the final output path itself; see
[Transactional builds](atomic_builds.md) for why.

## Trust and permissions

A plugin runs arbitrary code during your build, so it's worth understanding what
it can do before you add one, especially one you didn't write yourself. Every
plugin declares a `mode`:

- **`isolated`**: the plugin runs in its own separate process, with every
  capability (filesystem, network, environment variables, subprocesses, FFI)
  denied by default. You explicitly grant only what it actually needs under
  `permissions`. This is the recommended mode for any plugin you did not write
  yourself. See the [plugin sandbox](plugin_sandbox.md) for the full permission
  model.
- **`trusted`** (the default, kept for backward compatibility): the plugin runs
  inside Steno's own process and inherits every permission Steno has:
  filesystem, network, environment, subprocess, FFI, all of it. A trusted plugin
  can read or change any project file, or the generated output, without
  restriction. Theme-bundled plugins run at this level too, unless you turn them
  off with `allowThemePlugins: false`.

In `steno dev`, a trusted plugin's factory only runs again when `config.plugins`
actually changes - editing content doesn't re-trigger it, so a plugin with real
init cost (Shiki loading its grammars, for example) only pays that cost once per
dev session, not once per rebuild. Isolated plugins don't get this: their worker
is intentionally torn down at the end of every build (part of the sandbox's
threat model, see [plugin sandbox](plugin_sandbox.md)), so an isolated entry
always reloads on the next rebuild regardless. `steno build` is unaffected
either way - it loads plugins exactly once per process.

`pluginSourcePolicy` controls which kinds of module specifiers are allowed at
all (`jsr:` and `npm:` by default), it is a source filter, not a sandbox, and it
applies the same way to both modes. It does not look inside a plugin's own
dependencies, and can't stop an allowed plugin from importing something else
internally. See [Configuration](config_reference.md#plugin-source-policy) to
change it.

Before adding any plugin or theme, trusted or isolated:

- Review who publishes it and where its source lives.
- Pin an exact version instead of following a mutable tag or URL.
- Review what changed before accepting an update.
- Grant Steno itself, and any isolated plugin, only the permissions your project
  actually needs, nothing more.

Do not add a plugin you don't trust unless its entry explicitly sets
`mode: isolated`.
