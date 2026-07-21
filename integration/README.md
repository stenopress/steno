# Real-site integration suite

`deno task test:sites` builds every directory under `integration/sites/` using
the current checkout's CLI. These tests complement unit and parser conformance
tests by exercising complete projects.

Every site is checked for:

- expected pages, assets, and semantic content;
- valid internal `href` and `src` targets;
- byte-identical clean and warm builds;
- a successful incremental content update;
- preservation of the last successful output after a malformed build; and
- absence of transaction staging or backup paths inside published output.

The `single-file` fixture is a genuine zero-config project: it contains one
Markdown source file, invokes `steno build` without `--config`, and verifies the
same lifecycle as configured sites.

The suite runs on every pull request through `ci.yml`, which also makes it part
of the reusable release/publish gate. `real-sites.yml` repeats it nightly on
Linux, macOS, and Windows and can be started manually.

## Adding a site

Create `integration/sites/<name>/` with a normal `content/` tree and a
`site.expected.json` file:

```json
{
  "files": {
    "index.html": ["Expected heading"],
    "assets/style.css": []
  },
  "zeroConfig": false,
  "mutableSource": "content/page.md",
  "mutableOutput": "page/index.html",
  "originalText": "Original sentence.",
  "changedText": "Incrementally changed sentence."
}
```

Fixtures must be hermetic: use bundled or repository-local themes and plugins,
pin dependencies, and do not require credentials or external services.
