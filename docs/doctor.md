# Doctor

`deno x jsr:@steno/steno doctor` inspects a configured project and prints a
report without building it. It exits after printing; it does not modify the
project.

## Checks

- **Deno version**: warns if the runtime is older than 2.0.0.
- **Config file**: fails and stops immediately if the config path (default
  `content/.steno/config.yml`, or `--config`) does not exist or fails to parse.
- **Content directory**: fails if `contentDir` does not exist.
- **Markdown pages**: warns if no `.md` files are found under `contentDir`.
- **Output directory**: informational only. Reports whether `output` already
  exists; it is created on build either way.
- **Data directory**: informational. Reports whether `contentDir/_data` exists;
  it is optional.
- **Theme**: warns if no `custom.theme` is declared, since pages then render as
  plain HTML with no layout. If the theme is a local path (starts with `.` or
  `/`), fails when that directory does not exist.
- **Plugins**: reports the declared count, and how many are `isolated` versus
  `trusted`. Trusted plugins produce a warning, since they run in-process with
  Steno's own Deno permissions. Each plugin specifier is checked against the
  supported formats (`jsr:`, `npm:`, `file://`, `https://`); an unsupported
  format fails the check.
- **Plugin source policy**: warns when `pluginSourcePolicy.allowLocal` or
  `allowRemoteHttp` is enabled, since both widen which plugin sources may load
  in-process code. Also warns that `allowNodeBuiltins` only filters the
  top-level specifier and does not control transitive imports.
- **Collections**: informational. Reports the number of explicitly configured
  collections; collections are otherwise auto-detected from content
  subdirectories regardless of this count.
- **Redirects**: reports the declared redirect count when greater than zero.

## Exit behavior

A failing check (missing config, missing content directory, missing local theme
directory, or an unsupported plugin specifier) marks the run as having errors
and prints a summary line asking you to fix them and try again. Any other check
produces an informational or warning line but does not fail the run. `doctor`
does not currently return a non-zero process exit code; treat the printed
summary as the result.
