# Transactional builds

You don't need to read this to use Steno day to day, `steno build` and `steno dev` already handle
everything below for you automatically. This page is for when you're writing a plugin or hook that
touches the filesystem, or you're curious what actually happens if a build fails partway through.

The short version: a build never overwrites your existing `dist/` folder until every single page,
asset, and hook has succeeded. If anything fails, your previous output is left exactly as it was,
nothing is half-written.

In detail: Steno builds every site into a temporary directory beside the configured output
directory. Pages, theme assets, redirects, and lifecycle hooks must all succeed before the staged
tree is promoted.

If parsing, rendering, a plugin, a hook, an asset copy, redirect generation, or promotion fails:

- the previous output remains available;
- the staging directory is removed;
- in-memory build state is not committed; and
- the persistent cache is not advanced.

Promotion moves the previous output to a sibling backup and then renames the staged tree into place.
If the second rename fails, Steno restores the backup. On the next build, Steno also recovers a
backup left by a process interruption during this narrow promotion window.

Because portable filesystems cannot replace a non-empty directory with one universal atomic syscall,
consumers may observe a brief path transition during promotion. Steno guarantees transactional
rollback and recovery, not a lock-free directory swap for concurrent readers. Deployment systems
that need zero-gap switching should publish the completed output as a versioned release and
atomically update their own symlink or release pointer.

## Plugin and hook paths

`beforeBuild` and `afterBuild` receive a copied `SiteConfig` whose `output` points to the staging
directory. Build extensions must write only within that directory.

Plugin `afterPage` hooks receive:

- `path`: the writable staging path;
- `finalPath`: the path after promotion; and
- `html`: the generated document.

Caller-provided `StenoHooks.afterPage` keeps `path` as the final path for compatibility and
additionally receives `stagingPath` for transactional writes. Writing directly to the final path
from trusted code bypasses Steno's transaction and is unsupported.

The `SiteConfig` passed to `beforeBuild` and `afterBuild` also carries a `pages` array, populated
just before rendering starts. Each entry has `slug` (the output-relative path), `title`, and
optional `description` and `date`, sourced from that page's frontmatter. Plugins and hooks can use
it to build a sitemap, an RSS feed, or a search index without re-scanning `contentDir`.

## Determinism and collisions

Fresh output trees remove stale pages and assets naturally. Steno rejects collisions between pages,
theme assets, and redirects instead of allowing the last writer to win. Clean builds with identical
inputs are tested for identical file paths and SHA-256 hashes.

When inputs are provably unchanged and no theme, plugin, lifecycle hook, redirect, data file, public
environment value, or include can produce additional output, Steno performs a no-op warm build
without materializing or promoting a new tree. Changed production builds remain transactional and
are reported separately as atomic incremental builds in the benchmark suite.

A warm build qualifies as a no-op only when all of the following hold: no theme is configured, no
plugins are configured, none of `beforeBuild`, `afterPage`, or `afterBuild` is set on the
caller-provided hooks, no `content/_data` files exist, no `PUBLIC_*` environment variables are set,
no `redirects` are configured, no active page's body contains `{@include`, and every previously
built page's source text and output path are unchanged and its output file still exists on disk. Any
one of these being false forces a full staged rebuild.

The filesystem root and the project working directory cannot be configured as the output because
neither can be safely promoted.

## Build cache

Steno keeps a build signature and per-page state in memory across `build()` calls on the same
`Steno` instance, and additionally persists it to `<contentDir>/.steno/build-cache.json` after every
committed build. On startup, if the in-memory state does not already match the current build
signature, Steno reads this file and reuses it when its signature matches. The file lets a warm
no-op build or a cache-assisted incremental build happen on the first `build()` call of a new
process, not only on a long-running `dev()` session. It is safe to delete; Steno rebuilds it on the
next build. Add `.steno/build-cache.json` to `.gitignore`.

The build signature that gates cache reuse is computed from the full site config, the theme's
layouts and components (sorted), the theme's resolved config, and the source text of every
configured hook and plugin hook function (via `Function.prototype.toString`). Editing an inline hook
or plugin function invalidates the cache; editing the internals of a function called _from_ that
hook, without changing the hook's own source text, does not.

Beyond that whole-build signature, each page has its own cache entry and is re-rendered individually
when its source text, output path, resolved theme assets, `{@include}`d partials (even though those
live in other files), or the site's `collections` map changed since it was last cached - not only
when the page's own frontmatter/body changed.

## Staging directory names

While a build runs, Steno creates a sibling directory next to the configured output directory named
`.<output-name>.steno-stage-<id>`. On promotion, the previous output is moved to
`.<output-name>.steno-backup` and then the staged tree is renamed into place; a leftover backup from
an interrupted promotion is named `.<output-name>.steno-backup.retired-<id>`. These directories live
beside `dist/` (or your configured output), not inside it. Add `.<output-name>.steno-stage-*`,
`.<output-name>.steno-backup`, and `.<output-name>.steno-backup.retired-*` to `.gitignore` and to
any custom watcher or deployment script alongside the output directory itself.
