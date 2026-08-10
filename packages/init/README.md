# @steno/init

Interactive scaffolder for new [Steno](https://jsr.io/@steno/steno) static-site projects.

## Usage

```sh
deno create jsr:@steno/init
```

The wizard asks for:

- **Site title**
- **Site description**
- **Author name**
- **Plugins** - toggle any official plugin with an arrow-key checkbox list, or add your own
  community plugin package
- **Theme** - choose an official theme, or a community/local theme

Run with `--advanced` (or `-a`) to also be asked for the content/output directories, short URLs, dev
server port, a local theme path, and version pinning for `@steno/steno` and the selected official
theme:

```sh
deno create jsr:@steno/init --advanced
```

Every prompt can be skipped with a flag - run `deno create jsr:@steno/init
--help` for the full
list, including `--plugins`, `--community-plugins`, `--theme`, `--community-theme`, `--local-theme`,
`--content-dir`, `--output-dir`, `--dev-port`, `--short-urls`, `--steno-version`, and
`--theme-version`.

It then generates the following structure in your current directory:

```
my-site/
├── deno.json
└── content/
    ├── .steno/
    │   └── config.yml
    └── index.md
```

Themes and plugins are loaded directly from JSR (or wherever the community package specifier
points) - no local theme or plugin files are created unless you choose a local theme path. The
generated project pins `@steno/steno` to `^0.11.2` and official themes to `^0.10.0` by default;
override with `--advanced` or the `--steno-version`/`--theme-version` flags.

## Themes

| Key                 | Package                              | Description                                             |
| ------------------- | ------------------------------------ | ------------------------------------------------------- |
| `minimal`           | `jsr:@steno/theme-minimal`           | Clean, simple theme for personal sites and blogs        |
| `docs-minimal`      | `jsr:@steno/theme-docs-minimal`      | Minimal theme optimised for documentation sites         |
| `marketing-minimal` | `jsr:@steno/theme-marketing-minimal` | Editorial landing-page theme for products and campaigns |

Each is pinned to `^0.10.0` unless overridden. You can also pass any `jsr:`/`npm:`/HTTPS package as
a **community theme**, or a path inside your project as a **local theme**.

## Plugins

| Key        | Package                      | Description                                                    |
| ---------- | ---------------------------- | -------------------------------------------------------------- |
| `tailwind` | `jsr:@steno/plugin-tailwind` | Compiles Tailwind utility classes during the build             |
| `shiki`    | `jsr:@steno/plugin-shiki`    | Highlights fenced code blocks with VS Code grammars and themes |
| `seo`      | `jsr:@steno/plugin-seo`      | Generates a sitemap, RSS/Atom feeds, and robots.txt            |
| `docs`     | `jsr:@steno/plugin-docs`     | Mirrors markdown from an external directory into `contentDir`  |
| `search`   | `jsr:@steno/plugin-search`   | Generates a JSON search index from rendered HTML               |
| `og`       | `jsr:@steno/plugin-og`       | Auto-generates Open Graph preview images and `og:image` tags   |
| `image`    | `jsr:@steno/plugin-image`    | Resizes and optimizes images referenced by your theme's assets |

Official plugins are declared as `mode: trusted` and run in-process with the permissions granted to
Steno. **Community plugins** (any package specifier you type in) are declared as `mode: isolated`
and run in a separate Deno process instead - see [plugin sandbox](../../docs/plugin_sandbox.md).

## Building a theme or plugin

`deno create jsr:@steno/init` scaffolds a whole site. To start a standalone theme or plugin package
instead — a real, working starting point, not a toy example — use:

```sh
deno run -A jsr:@steno/init/create-theme my-theme
deno run -A jsr:@steno/init/create-plugin my-plugin
```

`create-theme` generates `mod.ts` (a `StenoTheme` export), a Tau layout, and a stylesheet — the same
shape as the bundled themes above. `create-plugin` generates `mod.ts` (a factory returning a
`StenoPlugin`) plus a starter test. Both accept `--dir <path>` to change where they scaffold, and
`--force` to overwrite existing files.

Point a site's `config.yml` at a local theme with a relative path (`theme: ./my-theme`) —
`steno dev` watches it and reloads on change. A local plugin is stricter: steno blocks bare relative
plugin paths by default, so it needs an absolute `file://` URL plus an explicit opt-in (see the
scaffolded plugin's own README for the exact config).

## Next steps after scaffolding

```sh
deno task build   # build the site into dist/
deno task dev     # start the live-reload dev server
```

Steno's CI scaffolds and builds a project with every official theme to ensure generated projects
work without manual changes.

## License

MIT
