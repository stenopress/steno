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
│   ├── theme/           # Theme rendering runtime and Scribe integrations
│   ├── utils/           # Parser utilities, CLI arguments, file systems, and dev servers
│   └── types.ts         # Shared public TypeScript type definitions and contracts
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
deno task test
```

### Static Analysis

Run the built-in linters and type checkers to enforce code quality:

```sh
deno lint
deno check mod.ts
```

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
