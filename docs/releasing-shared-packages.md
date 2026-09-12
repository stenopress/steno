# Releasing the shared packages

Steno remains `@steno/steno`. Its shared dependencies are `@steno/core` and
`@steno/tau`. Publish in dependency order: Tau, Core, then Steno.

## Before publishing

1. Commit Core changes under `packages/core` together with their Steno integration.
   Tau remains a separate repository and needs its own commit.
2. Push the branches to `stenopress/tau` and `stenopress/steno`.
   Set the GitHub Actions repository variable `TAU_REF` to the full
   reviewed commit SHA. Without this variable, workflows use
   `v0.1.0`. Never create a stable tag merely to make a checkout step pass.
3. Run `deno task check` in Steno and Tau, and
   `deno task --cwd packages/core check` in Steno. Also run
   `deno task test:ecosystem` and `deno task bench:check`.
4. Compare repeated benchmarks with the original Steno revision on the same
   machine and Deno version. Run the two versions sequentially, without other
   tests running. Absolute performance budgets alone do not establish parity.

## Prerelease rehearsal

Choose explicit prerelease versions before creating releases. Update package
versions, dependency specifiers, and lockfiles together.
Publish Tau first; publish Core only after its Tau version is
available. Use the GitHub repository publishing authorization configured in JSR.

Core is published independently from `packages/core`. In Steno's **Publish**
workflow, select the manual `core` target. If JSR's Core package is linked to
the old repository, update its publishing authorization to `stenopress/steno`
before using this workflow. Moving source does not change already published versions;
bump Core's version for the next publication.

With Core and Tau published, run in Steno:

```sh
deno task check:registry
deno task test:registry
```

The second command copies the publishable Steno and theme files into a temporary
installation, removes Steno's local dependency links, and uses a fresh Deno cache.
It tests build, doctor, an isolated plugin, and each official theme's public module.
The manual **Registry integration** workflow runs these checks in GitHub Actions.
The Steno publishing workflow also requires them.

This checks the candidate Steno file set against published dependencies. After
publishing a Steno prerelease, separately build an existing site using that exact
JSR version from a directory without local links. Compare its output with the
stable build, exercise its plugins, and preview it before deploying.

## Stable release

Repeat the dependency-order publication and registry checks for the exact stable
versions. Keep the previous application lockfile and deployed artifact available
for rollback. Publishing packages does not deploy an existing site; update and
preview that site's dependency separately.

## Cache behavior

Filter additions, replacements, and removals invalidate build caches. Custom
filter closures receive process-local identities, so their disk caches are not
reused across processes. Unchanged built-in filters retain persistent caching.
Mutable state inside an unchanged closure is not detectable: replace the filter
when changing its captured configuration.
