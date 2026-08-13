# Contributing to Steno

Thank you for helping build Steno. This guide covers how the project is laid out, how to work on it
locally, and what we expect from a pull request, so you can get moving quickly instead of guessing.

---

## Project architecture

Steno is split into clean, focused modules. Knowing where logic lives makes it much easier to write
code that's easy to find later:

```text
steno/
├── mod.ts               # Public SDK and CLI entrypoint
├── src/
│   ├── core/            # Config parsing, collection engines, and build orchestration
│   ├── plugins/         # Trusted and isolated plugin execution
│   ├── theme/            # Theme rendering runtime and Tau integrations
│   ├── utils/            # Parser utilities, CLI arguments, file systems, and dev servers
│   └── types.ts          # Shared public TypeScript type definitions and contracts
├── packages/             # Official themes and the init scaffolder
├── benchmarks/           # Benchmark suite, budgets, and report generation
├── integration/          # Real-site and ecosystem compatibility tests
└── test/                 # Unit test fixtures and the sandbox dev project
```

---

## Local workflow

Make sure you've got the latest Deno installed. Once you've cloned the repo, these are the tasks
you'll reach for most:

### Sandbox development

Want to try your changes against a live local project? Spin up the test sandbox:

```sh
deno task dev
```

### Running the test suite

Run the full suite before you open a pull request:

```sh
deno task test           # Unit tests: ./test.ts and ./src
deno task test:sites     # Builds real-world sample sites (integration/real_sites_test.ts)
deno task test:ecosystem # Official theme/plugin compatibility (integration/ecosystem_compat_test.ts)
deno task test:installed # Runs the CLI from a simulated `deno publish` (integration/installed_product_test.ts)
deno task test:all       # test + test:sites + test:installed
```

`test:sites`, `test:ecosystem`, and `test:installed` build real projects end to end, so give them
more time than the unit suite.

### Static analysis

Run the linters and type checker so obvious problems get caught before review:

```sh
deno lint
deno check mod.ts
deno task doc:check   # Lints public API doc comments with `deno doc --lint`
```

Or run everything CI runs, in one go:

```sh
deno task check
```

### Benchmarks

If you're touching the parser, renderer, or build pipeline, make sure you haven't regressed
performance. See [docs/benchmarks.md](docs/benchmarks.md) for the full methodology.

```sh
deno task bench         # Run the benchmark suite
deno task bench:check   # Assert performance budget thresholds
deno task bench:report  # Regenerate the published benchmark report
deno task bench:trends  # Compare recent benchmark runs
```

---

## Change checklist

Before you open a pull request, run through this list:

1. **Domain ownership.** Put new logic in the smallest, most specific module that actually owns
   it - don't scatter it across layers that only touch it in passing.
2. **Test coverage.** Add a focused test alongside whichever module or code path you changed.
   Touching the isolated plugin protocol (`src/plugins/isolated_protocol.ts`, `isolated_worker.ts`)
   needs coverage on both sides of the stdin/stdout boundary. Touching the Tau parser or compiler
   should add or update a fixture under `src/utils/fixtures/tau/`.
3. **Strict boundaries.** Export contracts as explicit `type` definitions where you can, and keep
   runtime imports one-way so you don't end up with circular dependencies down the line.
4. **Code formatting.** Run the formatter before you commit:

```sh
deno fmt
```
