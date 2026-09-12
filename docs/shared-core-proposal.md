# Proposal: the Stenopress family

Status: historical extraction proposal. The repository layout below has been superseded:
Core now lives in `stenopress/steno/packages/core` and remains the independent JSR
package `@steno/core`. Tau remains in `stenopress/tau` as `@steno/tau`.
See [the current release procedure](releasing-shared-packages.md).

The naming and repository direction is locked: four standalone repositories under `stenopress`,
with new packages under `@stenopress` and Steno retaining `@steno/steno`. Steno remains the purely
static builder. Press is the new
SSG + SSR + API framework. Both consume Core for identical content and extension semantics, and
Core consumes Tau for template rendering. Neither product maintains a separate copy of Core.

```text
stenopress/
├── tau       → @steno/tau
├── core      → @steno/core
├── steno     → @steno/steno (existing repository and package name)
└── press     → @stenopress/press (new repository)
```

Tau retains its name and `.tau` extension and has zero external runtime dependencies. Test and
benchmark dependencies do not become runtime dependencies. Repository creation, package publication,
and version numbers are implementation work; this document does not claim they already exist.

## Package boundaries

| Package        | Owns                                                                                                                                          | Does not own                                                         |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `@steno/tau`   | Parser, expressions, template rendering, escaping, filters, resource limits, compiled-template cache, errors                                  | Markdown, themes, routes, filesystem discovery, HTTP                 |
| `@steno/core`  | Shared contracts and schemas, frontmatter, content processing, collections, page context, theme composition, plugin execution, page rendering | Steno CLI, output directory transactions, HTTP server, API endpoints |
| `@steno/steno` | Zero-config SSG experience, CLI, build orchestration, incremental output cache, static file emission, development and preview servers         | Its own copies of template, theme, or plugin engines                 |

| `@stenopress/press` | Static builds, request rendering, HTTP routing, API handlers, middleware, deployment integration | Its own copies of content, template, theme, or plugin engines |

Dependency direction:

```text
Steno ────────────────┐
                     ├── Core ── Tau
Press ───────────────┘
```

Tau is also usable directly. Core must not import Steno. Neither Core nor Tau should initialize a
CLI, read process arguments, or start a server when imported.

Keep Steno in its existing repository. Extract Tau and Core into their own repositories, each with
its own package manifest, tests, CI, and release workflow. Create Press as a separate consumer once
the shared boundary is usable. Local sibling checkouts may use development import overrides;
published packages must depend on versioned JSR packages, never sibling filesystem paths.

## What the current code tells us

- `src/utils/tau.ts`, `tau_parser.ts`, `tau_expr.ts`, and `tau_error.ts` already form a small engine.
  Their few dependencies on `utils/text.ts` should become Tau-local helpers, without pulling CSS/HTML
  minification into Tau.
- `src/core/build/build.ts` combines reusable page rendering with collection setup, asset preparation,
  cache decisions, file writes, and build hooks. These responsibilities need separating before this
  pipeline can serve a request.
- `src/core/collections.ts` combines filesystem discovery with collection assembly and Markdown
  transforms. Collection types and assembly belong in the shared layer; disk scanning belongs in an
  explicit content loader.
- `src/theme/theme.ts` combines template rendering, directory loading, transpilation, and bundled-theme
  resolution. It also imports collection types from the current core directory. Shared types must move
  before these become real package boundaries.
- `src/types.ts` contains the existing ecosystem contract. `SiteConfig` includes output and dev-server
  settings; `GeneratedPage` includes staging and final filesystem paths. Moving these types alone
  does not make them request-compatible.
- Tau exposes a mutable global filter registry for compatibility. The extracted renderer also accepts
  a per-render filter registry alongside scoped theme functions, keeping request-specific helpers out
  of shared state without capturing them in compiled templates.

## Core structure

Core should have a small render entry point and explicit environment-dependent entry points. For
example, `@steno/core` exposes contracts and rendering, while `@steno/core/loaders/deno` exposes disk
content discovery, config/theme module loading, and Deno plugin isolation. These are entry-point
boundaries within one package, not additional ecosystem packages.

The extraction can remain Deno-first. Supporting every deployment runtime is not a prerequisite, and
the initial split should not claim portability that has not been tested.

The reusable render operation accepts prepared page source and metadata, resolved site settings,
collections/data, a theme, an asset URL manifest, and an application-owned plugin instance. It returns
rendered HTML and diagnostics without writing files. Concrete API names should be settled during
extraction, after the existing pipeline has been covered by compatibility tests.

Preserve the current processing order:

1. Resolve source/includes and parse Markdown.
2. Apply `transformAst`, render Markdown, then apply `transformHtml`.
3. Resolve page settings and construct the shared template context.
4. Render the layout, merge/inject head tags, and apply configured HTML minification.
5. Hand the result to the calling product.

Today `transformHtml` receives the Markdown body before layout rendering. Do not silently redefine it
as a complete-document transform. If needed later, add a separately named hook for that stage.

Steno writes the result through its existing staging transaction and invokes output hooks. Press
turns the same result into a response. Request routing, status codes, headers, cookies, API handlers, and middleware remain responsibilities of Press.

Share URL and content identity conventions, including short URLs, so switching products preserves
existing links. An HTTP router and deployment adapter do not need to be invented during this split.

## One ecosystem, explicit lifecycle semantics

Use one canonical set of plugin and theme contracts in Core. Steno re-exports its existing public
names so existing packages can keep importing `StenoPlugin` and `StenoTheme`. Preserve the current
signatures first; neutral names can be additive aliases. Keep the full legacy `SiteConfig` contract
available while introducing a smaller render configuration internally.

The compatibility promise must distinguish installation compatibility from execution capability:

| Extension behavior                           | Static build                            | Request rendering                                                    |
| -------------------------------------------- | --------------------------------------- | -------------------------------------------------------------------- |
| Tau layouts, components, theme configuration | Shared                                  | Shared                                                               |
| Markdown AST/body transforms                 | Runs when content is processed          | Same stage when content is processed; requires request-safe state    |
| `beforeBuild` / `afterBuild`                 | Existing build lifecycle                | Preparation/build lifecycle only; never synthesized for each request |
| `afterPage` with staging paths               | Runs after output is written            | No equivalent unless an actual static page is emitted                |
| Future HTTP middleware or API handlers       | Unsupported unless product adds support | Press capability                                                     |

A sitemap plugin can run during Press's preparation/static-output phase. A plugin that
edits emitted files cannot automatically modify dynamically served HTML. It needs a render hook for
that behavior. The loader should report unsupported required capabilities before serving traffic,
including requirements introduced by theme-bundled plugins.

Add explicit capability declarations when the second execution mode exists. Do not infer SSR safety
from a function's name or silently ignore required hooks. Legacy plugins continue to work unchanged in
Steno; their execution during requests is an explicit compatibility decision. A single ecosystem
means shared contracts and reusable packages, not that every extension runs in every phase.

Preserve plugin order, error reporting, trusted execution, and isolated execution semantics. The
current isolated-plugin implementation is Deno-specific; a future host must implement equivalent
enforcement or reject that execution mode, never fall back silently to trusted execution.

## Themes and request isolation

Keep the existing template vocabulary: `site`, `theme`, `globals`, `env`, `collections`, `data`,
`assets`, `title`, and layout `content`. Preserve frontmatter precedence and `steno.*` page overrides
as compatibility syntax. Migration must not require rewriting every template.

Separate asset preparation from rendering. Resolve, hash, and publish theme assets once; both static
pages and request-rendered pages receive the same asset URL manifest. Resolve bundled theme locations
through the product/loader configuration rather than relative paths into Steno's package tree.

Before enabling concurrent SSR:

- Supply scoped filter/function configuration for each render. Keep the existing global registry as a
  compatibility API, and do not mutate it with request-specific data. Compiled-template caches remain
  bounded and contain compiled code, not request contexts or rendered results.
- Keep request data out of shared mutable template, theme, and plugin state. Preserve sequential hook
  order within each render; that alone does not make concurrent renders safe.
- Reuse compiled templates, not personalized rendered HTML. Response caching belongs to Press
  and requires an explicit cache policy.
- Load only the intended public environment values into template context. Request secrets and server
  environment objects must not be automatically spread into it.

## Migration sequence and acceptance gates

1. **Extract Tau without changing behavior.** Move the engine and conformance fixtures into the Tau repository;
   retain compatibility re-exports for existing imports. Validate renderer tests, error identity,
   cache behavior, and Tau benchmarks. Avoid shipping duplicate engine instances through old/new paths.
2. **Extract shared contracts and extension execution.** Move canonical types and plugin validation/
   transforms to the Core repository. Retain Steno re-exports. Run existing API fixtures and add cross-entry-point
   type/identity checks. Keep legacy output-hook types intact.
3. **Extract rendering and preparation boundaries.** Separate theme loading/assets from rendering and
   collection discovery from assembly. Make Steno call the shared render operation. Compare complete
   generated sites, hook traces, diagnostics, assets, and incremental invalidation with the baseline.
4. **Make the packages independently installable.** Configure each repository's explicit package
   exports/dependencies and independent CI. Release in dependency order: Tau, Core, then Steno/Press.
   Update publishing and initializer templates. Test published-style installs without local overrides
   so sibling checkouts cannot conceal missing files or dependencies.
5. **Prove reuse before expanding Press.** Add a small in-memory request-rendering fixture
   using Core without importing Steno. Render the same content/theme/plugin through both paths and
   compare HTML. Exercise concurrent contexts and filters, lifecycle capability errors, and asset URLs.
   This fixture is a compatibility proof, not a production server release.

For each stage, run the relevant existing unit, API, architecture, ecosystem, real-site, and installed
product checks. Extend architecture checks beyond `src` to include package graphs and prohibit
Core-to-Steno or Tau-to-Core imports. Existing architecture checks currently inspect only `src`.

Record baseline benchmarks before changes. For rendering, collection, and cache changes, add relevant
benchmark assertions and pass `bench:check`; include cold and incremental static builds. Keep static
build caches in Steno and compiled-template caches in Tau. Do not add request machinery to the SSG hot
path merely to anticipate the future framework.

## User migration and scope

The intended migration is: retain content, themes, plugins, template context, and URL conventions;
switch the product entry point; then opt selected pages into request rendering and add API routes.
Static pages remain prerendered by default in Press. Dynamic routes require their own
data/loading and cache policies, and output-dependent plugins may need adaptation.

The first implementation should deliver independently consumable Tau and Core packages with Steno
using them and its behavior preserved. SSR/API routing, hydration, streaming, deployment adapters,
are subsequent work. The key milestone is proving that two callers can use
the same rendering and extension implementation without Steno-specific assumptions leaking into it.

## Package migration and CLI ergonomics

Both product packages should expose a side-effect-free SDK at `.` and an explicit executable at
`./cli`. The current Steno manifest exports only `./mod.ts`; adding `./cli` is part of the migration,
not an existing capability. Preserve the old entry point's CLI behavior for compatibility.

Target static project configuration:

```json
{
  "imports": {
    "steno": "jsr:@steno/steno@^1.0.0"
  },
  "tasks": {
    "build": "deno run -A jsr:@steno/steno@^1.0.0/cli build"
  }
}
```

Target Press configuration:

```json
{
  "imports": {
    "press": "jsr:@stenopress/press@^0.1.0"
  },
  "tasks": {
    "dev": "deno run -A jsr:@stenopress/press@^0.1.0/cli dev",
    "build": "deno run -A jsr:@stenopress/press@^0.1.0/cli build"
  }
}
```

These are proposed release versions. CLI specifiers include the same version range as the SDK;
an unversioned task URL would not inherit the version from the `imports` alias.

Steno keeps its existing `@steno/steno` package name. There is no namespace migration or replacement
package for Steno users. Existing imports and CLI commands remain supported; the proposed `./cli`
entry point is additive, and users do not need to adopt it for the extraction to work.

## Implementation status

The standalone local Git repositories are `../tau` and `../core`. Steno consumes their versioned
package specifiers through development links. Its existing public and internal compatibility exports
delegate to the extracted implementations. The `@steno/steno` name, root CLI entry, plugin lifecycle,
and staging/output orchestration are preserved.

Core now owns contracts, frontmatter, collections, URL rules, config validation, diagnostics, theme
composition/rendering, asset helpers, and trusted/isolated plugin execution. Steno still owns project
discovery, configuration orchestration, build scheduling/caching, output transactions, CLI, and dev
server behavior. Shared page rendering can run without output writes or build hooks, as exercised by
the Core-only rendering fixture.

The standalone Tau engine has no external runtime imports. Core supplies `markdown_inline`, keeping
it available through the existing Steno renderer. Core and Tau have standalone tests, package
manifests, licenses, documentation, and CI/release workflows. Steno's package-boundary and cycle checks
now inspect all three source graphs; performance budgets include the shared page-render path.

Before merging/releasing the extraction:

1. Commit and push the new repositories to `stenopress/tau` and `stenopress/core` and create their
   matching `v0.1.0` tags. Hosted CI checks out these exact versions; those remote artifacts have not
   been created by this implementation.
2. Publish Tau, then Core. Run `deno task check:registry` in Steno to verify actual registry imports
   with local links disabled. Steno's release workflow requires this check before publication.
3. Run hosted CI, including cross-platform site builds, against those repositories/tags. Local tests
   do not establish Windows/Linux behavior or registry installation by themselves.
4. Complete the existing Steno release process only after those gates pass.

Installed-package tests currently materialize only the publishable file sets of all three packages
into clean temporary sibling directories. They test missing-file and local-path regressions without
requiring an early registry release. They do not substitute for the registry gate above.

Local verification on macOS with Deno 2.9.4:

- Steno's full `deno task check` passes: formatting, lint, types, API documentation/compatibility,
  architecture, maintainability, 438 unit tests, 3 representative-site tests, 6 installed-package
  tests, and 8 benchmark-safeguard tests.
- All 10 ecosystem compatibility tests pass, including Tailwind with its toolchain install permitted.
- Core's standalone check passes with 60 tests; Tau's passes with 64 tests.
- Both new packages pass publication dry-runs. Tau's module graph contains no external dependencies.
- Performance budgets pass, including the shared page path at approximately 99 microseconds against
  a 250-microsecond budget. The 4,000-page cold build is approximately 440 milliseconds against an
  800-millisecond budget. These are local measurements, not cross-platform guarantees.
- The registry gate currently fails with `JSR package not found: @steno/core`, correctly
  preventing a Steno release before its dependency is published.

Press itself is not implemented by this extraction. Request routing, API endpoints, streaming, and
deployment adapters remain separate product work. The original root CLI remains unchanged; the
`./cli` examples above describe an additive future entry point, not a newly shipped command.

**Acceptance target: existing static `content/` and `themes/` require zero changes when switching
from Steno to Press.** Press must preserve directory discovery, config-file locations, frontmatter
schemas, `.tau` syntax, layout resolution, public template context, asset paths, and URL conventions.
Keep accepting existing `.steno` configuration and `steno.*` overrides rather than requiring a rename.
Test this with unchanged site fixtures under both products, including theme-bundled plugins.

This target covers existing static behavior. Opting into request-specific data or API handlers adds
new behavior and configuration. Plugins requiring emitted files retain their static-build semantics;
they need an appropriate render capability if their effect must also apply to dynamic responses.
Shared Core versions must be tested across supported Steno/Press releases so independent releases
do not silently diverge in schemas or rendering behavior.
