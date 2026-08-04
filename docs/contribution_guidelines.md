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
├── mod.ts               # Public SDK and CLI entrypoint
├── src/
│   ├── core/            # Config parsing, collection engines, and build orchestration
│   ├── plugins/         # Trusted and isolated plugin execution
│   ├── theme/           # Theme rendering runtime and Tau integrations
│   ├── utils/           # Parser utilities, CLI arguments, file systems, and dev servers
│   └── types.ts         # Shared public TypeScript type definitions and contracts
├── packages/             # Official themes and the init scaffolder
├── benchmarks/           # Benchmark suite, budgets, and report generation
├── integration/          # Real-site and ecosystem compatibility tests
└── test/                 # Unit test fixtures and the sandbox dev project
```

---

## Local Workflow

Ensure you have the latest version of Deno installed. Once the repository is
cloned, use the following native tasks for development:

### Sandbox Development

To test your changes against a live local project, spin up the test sandbox:

```sh
deno task dev
```

### Running the Test Suite

Always ensure all tests pass before submitting a pull request:

```sh
deno task test           # Unit tests: ./test.ts and ./src
deno task test:sites     # Builds real-world sample sites (integration/real_sites_test.ts)
deno task test:ecosystem # Official theme/plugin compatibility (integration/ecosystem_compat_test.ts)
deno task test:all       # test + test:sites
```

`test:sites` and `test:ecosystem` build real projects end to end; expect them to
take longer than the unit suite.

### Static Analysis

Run the built-in linters and type checkers to enforce code quality:

```sh
deno lint
deno check mod.ts
deno task doc:check   # Lints public API doc comments with `deno doc --lint`
```

Or run everything CI runs in one step:

```sh
deno task check
```

### Benchmarks

Changes to the parser, renderer, or build pipeline should not regress
performance. See [docs/benchmarks.md](docs/benchmarks.md) for the full
methodology.

```sh
deno task bench         # Run the benchmark suite
deno task bench:check   # Assert performance budget thresholds
deno task bench:report  # Regenerate the published benchmark report
deno task bench:trends  # Compare recent benchmark runs
```

---

## Change Checklist

To maintain a clean codebase, please ensure your pull request adheres to these
architectural guidelines:

1. **Domain Ownership:** Place new logic in the smallest, most specific module
   that owns the responsibility.
2. **Test Coverage:** Add a focused test alongside the exact module or code path
   you modified. Changes to the isolated plugin protocol
   (`src/plugins/isolated_protocol.ts`, `isolated_worker.ts`) need coverage on
   both sides of the stdin/stdout boundary. Changes to the Tau parser or
   compiler should add or update a fixture under `src/utils/fixtures/tau/`.
3. **Strict Boundaries:** Prefer exporting contracts as explicit `type`
   definitions and keep runtime imports strictly one-way to prevent circular
   dependency issues.
4. **Code Formatting:** Run the native formatter on your workspace before
   committing your changes:

```sh
deno fmt
```
