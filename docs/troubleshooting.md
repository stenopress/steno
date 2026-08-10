# Troubleshooting

Stuck on an error? Find the message below (or the closest match) for what it means and how to fix
it. If nothing here matches, run `steno doctor` first, it catches most common misconfigurations
before you even get to a build; see [Doctor](doctor.md).

## How Steno reports problems

A theme, plugin, data file, redirect, or the config itself failing to load is printed as a
`[steno:error]` or `[steno:warning]` line (for example `[theme-load-failed]`,
`[plugin-load-failed]`, `[data-file-invalid]`, `[redirect-invalid]`, `[config-invalid]`). What
happens next depends on the command and the severity:

- `steno build` fails the build on any `error`-severity line - a build that silently drops its
  configured theme or a plugin doesn't match its own config, which is worse than failing loudly. The
  thrown error is a `StenoDiagnosticError` (exported from `jsr:@steno/steno`), carrying every
  diagnostic found, not just the first.
- `steno dev` stays permissive: every error is still printed, but the dev server keeps running, so
  iterating on a broken theme or plugin doesn't require getting it right first.
- Config-shape problems (wrong-typed or missing fields) are the one exception - those are fatal in
  `dev` too, since a config that doesn't parse into its documented shape isn't something worth
  building from even provisionally.
- `warning`-severity lines (an unrecognized config key, a deprecated `custom.*` alias) never fail a
  build in any mode.

## "Configuration file not found at ..."

Steno looked for `content/.steno/config.yml` (or the path you gave with `--config`) and it wasn't
there. Either:

- You meant to run in zero-config mode: make sure there is no `deno.json`, `mod.ts`, or similar file
  in the project root, since any of those makes Steno assume you have a real config and require one.
  See [Zero-config mode](getting_started.md#zero-config-mode).
- You meant to run in a configured project: create `content/.steno/config.yml`, or scaffold one with
  `deno create jsr:@steno/init`.
- You're running the command from the wrong folder. `cd` into your project root first.

## "No markdown files found for zero-config fallback in ..."

Zero-config mode needs at least one `.md` file somewhere in the project to build from. Add one, or
set up a real config file instead if your project genuinely has no content yet.

## "Output collision: ..."

Two different things want to write to the same output path, a page and a public asset, two pages, or
a theme asset and a redirect. Steno refuses to silently let one overwrite the other and fails the
build instead. The message names both the source and the destination path, use that to find the
conflict: usually two Markdown files that resolve to the same route (check
[Routes and permalinks](content.md#routes-and-permalinks)), or a file in `content/public/` with the
same name as a page or a theme asset.

## "Layout "X" not found in theme ..."

A page's frontmatter sets `layout: X`, but the active theme has no layout by that name. The error
lists which layouts the theme actually has, pick one of those, or add a `layouts/X.tau` file if
you're building the theme yourself. A page with no `layout` set uses `layout`, so a theme always
needs at least `layouts/layout.tau`. See [Themes and Tau](theme_development.md).

## "Component "X" not found in theme ..." / "Include "X" not found in theme ..."

Same idea as a missing layout, but for `<X />` or `{@include "X"}` in a template. Components must be
declared under `components:` in `theme.yaml` (or in the theme's `StenoTheme` object if it's module
based) before a template can reference them. Check the spelling and capitalization, a `theme.yaml`
key of `header` becomes `<Header />`, capitalized.

## "Invalid configuration for theme "X" at "themeConfig.Y": ..."

Your `themeConfig` (in site config, or a page's `steno.themeConfig`) has a value the theme's
`configSchema` rejects, wrong type, missing a required field, or outside an allowed range or `enum`.
The path after `at` tells you exactly which field, `themeConfig.Y` means the `Y` key you set. Check
the theme's documented options, or its `theme.yaml`/`configSchema` if it's your own.

## A Tau error (`TauError`, message starts with "Tau ...")

These come from your theme's templates. `TauError` always has a stable `code` and, when the problem
is traceable to a source file, a `filePath`, `line`, and `column` in the message. A few common ones:

- `TAU_RENDER_FAILED`, "Cannot read properties of undefined": you accessed a property on something
  that's `undefined` in this context, usually a typo in a variable name, or a value that isn't
  always set (use `?.` to make the access optional instead of erroring; see
  [Tau syntax](tau_syntax.md#expressions)).
- `TAU_PARSE_UNCLOSED_BLOCK`: an `{#if}` or `{#each}` is missing its matching `{/if}` or `{/each}`.
- `TAU_UNSAFE_EXPRESSION`: the template used something Tau deliberately blocks, like `constructor`
  or `eval`, even indirectly. This is almost always accidental, rename the variable or field
  involved.
- `TAU_UNKNOWN_FILTER`: a `| someFilter` in the template isn't registered. Built-ins are `date`,
  `truncate`, `upper`, `lower`, and `url`, anything else needs to be added to the `filters` export
  before rendering; see the [API reference](api_reference.md#tau).

See [Tau syntax](tau_syntax.md#errors) for the complete list of error codes.

## "port ... is in use, switched to ..."

Not actually an error, `dev` or `preview` couldn't bind the port you asked for (default 5735 for
`dev`, 4173 for `preview`) because something else is already using it, so Steno picked the next free
one instead and printed which one. If you need a specific port, stop whatever else is using it, or
set `devPort` in config for `dev` (there is no `--port` flag for `dev`, only for `preview`).

## My config changes aren't showing up

If you're running `dev`, this shouldn't happen, changes to `content/.steno/config.yml` take effect
on the next rebuild automatically, no restart needed. If you're seeing stale output anyway, check
that you actually saved the file, and that you're editing the config path Steno is actually using
(the one you passed to `--config`, if any). If you built once with `steno build` and are now looking
at that old `dist/` folder, you'll need to run `build` again, `build` does not watch for changes;
that's what `dev` is for.

## Deployed site shows old CSS or JavaScript after a redeploy

By default, Steno already solves this: theme CSS and JS files get a content hash in their filename
(`style.css` becomes something like `style.a1b2c3d4.css`), so a changed file gets a brand new URL
and no CDN purge is needed. If you're still seeing stale assets:

- Check you haven't set `hashAssets: false` in config.
- Check your HTML is actually being served fresh, hosts sometimes cache the HTML page itself too,
  not just the assets it links to. See [Deploying](deploying.md) for host-specific cache notes.
- If the asset is in `content/public/` rather than a theme asset, it isn't hashed, `hashAssets` only
  applies to theme-owned CSS and JS; see [Public assets](content.md#public-assets).

## A plugin failed to load

See [How Steno reports problems](#how-steno-reports-problems) above for what happens next - in
short, this fails `steno build` outright and only prints in `steno dev`.

- `[plugin-load-failed] Blocked plugin source "X": ...` means `pluginSourcePolicy` doesn't allow
  that specifier's source (a `file://` or `https://` plugin, for example, needs an explicit opt-in).
  See [Configuration](config_reference.md#plugin-source-policy).
- `[plugin-load-failed] Plugin "X" does not export a default function` or
  `... returned an invalid
  plugin object`: the package doesn't actually implement the
  `StenoPlugin` factory contract - check its own docs/version.
- `[plugin-entry-invalid] Invalid plugin entry in config: ...`: a `plugins` array entry isn't a
  package specifier string or an object with at least a `package` field.
- `Isolated registry plugin "X" must include an explicit version`: an isolated `jsr:`/`npm:` plugin
  needs a pinned version, like `jsr:@example/plugin@1.2.3`, not just `jsr:@example/plugin`.
- `Isolated URL plugin "X" must include a SHA-256 integrity value`: an isolated `https://` plugin
  needs an `integrity: sha256-<base64>` value so Steno can verify it before importing it.
- `Failed to load isolated plugin "X": ...`: the plugin itself threw during setup, or hit a
  permission it wasn't granted. Check the `permissions` block for that entry against what the
  plugin's own docs say it needs; see [Plugin sandbox](plugin_sandbox.md).

## Still stuck?

Run `steno doctor` for a project-wide check, it reports missing content directories, theme problems,
unsupported plugin specifiers, and `custom.*` fields that should be top-level. See
[Doctor](doctor.md) for everything it checks.

If even that doesn't fix the issue, please open an
[issue](https://github.com/stenopress/steno/issues/new) on GitHub explaing exactly what the issue
is.
