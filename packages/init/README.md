# @steno/init

Interactive scaffolder for new [Steno](https://jsr.io/@steno/steno) static-site
projects.

## Usage

```sh
deno run -Ar jsr:@steno/init@^0.8.0
```

The wizard asks for:

- **Site title**
- **Site description**
- **Author name**
- **Theme** — choose between _Minimal_ and _Docs Minimal_
- **Plugins** — optionally add _Tailwind CSS_ and/or _Shiki_

You can also skip the plugin prompts with `--plugins tailwind,shiki`.

It then generates the following structure in your current directory:

```
my-site/
├── deno.json
└── content/
    ├── .steno/
    │   └── config.yml
    └── index.md
```

Themes are loaded directly from JSR — no local theme files are created. The
generated project pins Steno, themes, and selected plugins to the compatible
v0.8 release line.

## Themes

| Key            | Package                                | Description                                      |
| -------------- | -------------------------------------- | ------------------------------------------------ |
| `minimal`      | `jsr:@steno/theme-minimal@^0.8.0`      | Clean, simple theme for personal sites and blogs |
| `docs-minimal` | `jsr:@steno/theme-docs-minimal@^0.8.0` | Minimal theme optimised for documentation sites  |

## Plugins

| Key        | Package                             |
| ---------- | ----------------------------------- |
| `tailwind` | `jsr:@steno/plugin-tailwind@^0.8.0` |
| `shiki`    | `jsr:@steno/plugin-shiki@^0.8.0`    |

Official plugins selected by the wizard are declared explicitly as
`mode: trusted`. They run in-process with the permissions granted to Steno.

## Next steps after scaffolding

```sh
deno task build   # build the site into dist/
deno task dev     # start the live-reload dev server
```

## License

MIT
