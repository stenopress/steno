# Contributing to Steno

## Project layout

- `mod.ts` is the public entrypoint.
- `src/core/` holds config, collections, and build orchestration.
- `src/utils/` holds parsing, CLI, file, and server helpers.
- `src/theme/` holds theme runtime code.
- Shared public types live in `src/types.ts`.

## Local workflow

```sh
deno task dev
deno task test
```

## Change checklist

1. Put new logic in the smallest module that owns it.
2. Add a focused test alongside the code you touched.
3. Prefer `type` exports for shared contracts and keep runtime imports one-way.
4. Use `deno fmt` before sending a change.
