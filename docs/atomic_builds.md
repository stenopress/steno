# Transactional builds

Steno builds every site into a temporary directory beside the configured output
directory. Pages, theme assets, redirects, and lifecycle hooks must all succeed
before the staged tree is promoted.

If parsing, rendering, a plugin, a hook, an asset copy, redirect generation, or
promotion fails:

- the previous output remains available;
- the staging directory is removed;
- in-memory build state is not committed; and
- the persistent cache is not advanced.

Promotion moves the previous output to a sibling backup and then renames the
staged tree into place. If the second rename fails, Steno restores the backup.
On the next build, Steno also recovers a backup left by a process interruption
during this narrow promotion window.

Because portable filesystems cannot replace a non-empty directory with one
universal atomic syscall, consumers may observe a brief path transition during
promotion. Steno guarantees transactional rollback and recovery, not a lock-free
directory swap for concurrent readers. Deployment systems that need zero-gap
switching should publish the completed output as a versioned release and
atomically update their own symlink or release pointer.

## Plugin and hook paths

`beforeBuild` and `afterBuild` receive a copied `SiteConfig` whose `output`
points to the staging directory. Build extensions must write only within that
directory.

Plugin `afterPage` hooks receive:

- `path`: the writable staging path;
- `finalPath`: the path after promotion; and
- `html`: the generated document.

Caller-provided `StenoHooks.afterPage` keeps `path` as the final path for
compatibility and additionally receives `stagingPath` for transactional writes.
Writing directly to the final path from trusted code bypasses Steno's
transaction and is unsupported.

## Determinism and collisions

Fresh output trees remove stale pages and assets naturally. Steno rejects
collisions between pages, theme assets, and redirects instead of allowing the
last writer to win. Clean builds with identical inputs are tested for identical
file paths and SHA-256 hashes.

When inputs are provably unchanged and no theme, plugin, lifecycle hook,
redirect, data file, public environment value, or include can produce additional
output, Steno performs a no-op warm build without materializing or promoting a
new tree. Changed production builds remain transactional and are reported
separately as atomic incremental builds in the benchmark suite.

The filesystem root and the project working directory cannot be configured as
the output because neither can be safely promoted.
