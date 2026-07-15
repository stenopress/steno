# @steno/init

Interactive scaffolder for new [Steno](https://jsr.io/@steno/steno) static-site
projects.

## Usage

```sh
deno x jsr:@steno/init
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

Themes are loaded directly from JSR — no local theme files are created.

## Themes

| Key            | Package                         | Description                                      |
| -------------- | ------------------------------- | ------------------------------------------------ |
| `minimal`      | `jsr:@steno/theme-minimal`      | Clean, simple theme for personal sites and blogs |
| `docs-minimal` | `jsr:@steno/theme-docs-minimal` | Minimal theme optimised for documentation sites  |

## Plugins

| Key        | Package                      |
| ---------- | ---------------------------- |
| `tailwind` | `jsr:@steno/plugin-tailwind` |
| `shiki`    | `jsr:@steno/plugin-shiki`    |

## Next steps after scaffolding

```sh
deno task build   # build the site into dist/
deno task dev     # start the live-reload dev server
```

## License

MIT
