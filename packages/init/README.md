# @steno/init

Interactive scaffolder for new [Steno](https://jsr.io/@steno/steno) static-site
projects.

## Usage

```sh
deno run -Ar jsr:@steno/init
```

The wizard asks for:

- **Site title**
- **Site description**
- **Author name**
- **Theme** — choose _Starter Theme_ (more coming soon)
- **Plugins** — optionally add _Tailwind CSS_ and/or _Shiki_

You can also skip the prompts with `--plugins tailwind,shiki`.

It then generates the following structure in your current directory:

```
my-site/
├── deno.json
├── mod.ts
├── content/
│   ├── .steno/
│   │   └── config.yml
│   └── index.md
└── themes/
    └── starter/
        ├── theme.yaml
        ├── assets/
        │   └── style.css
        ├── components/
        │   ├── footer.scr
        │   └── header.scr
        └── layouts/
            └── layout.scr
```

## Next steps after scaffolding

```sh
deno task build   # build the site into dist/
deno task dev     # start the live-reload dev server
```

## License

MIT
