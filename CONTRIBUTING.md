# Contributing to Steno

Thank you for helping build Steno. This guide outlines the project architecture,
local development workflows, and standard contribution guidelines to help you
get started quickly.

---

## Project Architecture

Steno is structured into clean, modular domains. Understanding where logic lives
makes it easier to write focused, maintainable code:

```text
steno/
├── mod.ts               # Public SDK and CLI entry point
├── crates/steno_core/   # Rust Markdown, output, and cache engine
├── scripts/             # Cross-platform contributor helpers
├── src/
│   ├── core/            # Project resolution and hybrid build orchestration
│   ├── theme/           # Theme rendering runtime and Scribe integrations
│   ├── utils/           # Parser utilities, CLI arguments, file systems, and dev servers
│   └── types.ts         # Shared public TypeScript type definitions and contracts
└── test/                 # Local sandbox application importing ../mod.ts
```

The main build flow is intentionally narrow:

1. `src/core/steno.ts` coordinates a project build or dev session.
2. `src/core/steno_build.ts` selects the native, hybrid, or portable path.
3. `src/core/native.ts` resolves an optional platform library and owns the FFI
   boundary.
4. `crates/steno_core/src/lib.rs` performs native Markdown and filesystem work.

Keep platform detection and unsafe FFI details inside `native.ts` and the Rust
crate. Themes, plugins, and public APIs must not depend directly on the native
library so the portable engine remains fully functional.

---

## Local Workflow

The portable workflow only requires Deno. Native development additionally
requires a stable Rust toolchain with Cargo.

For a fresh clone, run:

```sh
deno task setup
deno task doctor
```

`setup` builds the release-mode Rust library and caches the local TypeScript
entry points. If you do not have Rust installed, skip setup and use the portable
commands below.

### Sandbox Development

To test your changes against a live local project, spin up the test sandbox:

```sh
deno task dev
```

This incrementally rebuilds the Rust crate before starting `test/`. The sandbox
resolves `@steno/steno` to the repository's `mod.ts`, so edits are reflected
immediately. To work without native acceleration:

```sh
deno task dev:portable
```

### Running the Test Suite

Always ensure all tests pass before submitting a pull request:

```sh
deno task test:native
deno task test:portable
```

Both commands run the same behavioral suite. The native command fails if the
library cannot load; the portable command disables FFI explicitly. For a quick
local check, `deno task test` auto-selects the best available engine.

### Static Analysis

Run the built-in linters and type checkers to enforce code quality:

```sh
deno task check
```

### Release Packaging

Published releases must include native libraries for the six supported
OS/architecture combinations. Creating a GitHub release runs the native matrix,
loads each library on its matching runner, generates `native/manifest.json` with
SHA-256 checksums, checks the JSR package, and only then publishes it.

Do not publish directly from a developer machine: a local checkout normally has
only one native target. The release workflow intentionally fails when a binary
is missing, empty, too large, unloadable, or does not match the package version.

---

## Change Checklist

To maintain a clean codebase, please ensure your pull request adheres to these
architectural guidelines:

1. **Domain Ownership:** Place new logic in the smallest, most specific module
   that owns the responsibility.
2. **Test Coverage:** Add a focused test alongside the exact module or code path
   you modified.
3. **Strict Boundaries:** Prefer exporting contracts as explicit `type`
   definitions and keep runtime imports strictly one-way to prevent circular
   dependency issues.
4. **Code Formatting:** Run the native formatter on your workspace before
   committing your changes:

```sh
deno fmt
```
