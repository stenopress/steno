# Glossary

Plain-language definitions for terms used across these docs, especially the ones
that assume you've used a tool like this before. If a word here trips you up
somewhere else in the docs, this is the page to check first.

**Static site generator (SSG)**: a tool that turns source files (Markdown, in
Steno's case) into plain HTML files ahead of time, once, at build time, rather
than building each page on the fly when a visitor requests it. The result is
just files: fast to serve, no server-side code needed at runtime.

**Deno**: the JavaScript and TypeScript runtime Steno is built on and runs
inside. Similar in spirit to Node.js, but with different defaults (secure by
default, no separate package manager step for most things). You need it
installed to run Steno; see [Getting started](getting_started.md#what-you-need).

**JSR**: the [JavaScript Registry](https://jsr.io/), where Steno and its
official themes and plugins are published. A specifier like `jsr:@steno/steno`
tells Deno to fetch a package from there, the same way `npm:some-package` would
fetch from npm.

**Markdown**: the plain-text format you write your pages in, `# Heading`,
`**bold**`, `[link](url)`, and so on. Steno compiles each Markdown file into one
HTML page.

**Frontmatter**: the block of settings at the very top of a Markdown file,
between `---` lines, that describes that one page: its title, date, layout, and
so on. See [Frontmatter](content.md#frontmatter).

**Content directory**: the folder Steno scans for Markdown files, `content/` by
default. Set with `contentDir` in config.

**Config file**: `content/.steno/config.yml`, the file that describes your whole
site: its title, its theme, its plugins, and so on. Not required for very small
projects, see [Zero-config mode](getting_started.md#zero-config-mode).

**Build**: the act of turning your Markdown and theme into a finished website,
`steno build`. The result lands in an output folder, `dist/` by default.

**Dev server**: `steno dev`, a local server that builds your site, serves it in
your browser, and rebuilds automatically every time you save a change. For
working on a site, not for publishing it.

**Theme**: the thing that turns your Markdown content into a full HTML page with
a header, navigation, styling, and so on. Steno ships three official themes and
you can also write your own. See [Themes and Tau](theme_development.md).

**Layout**: one template within a theme, the outer HTML shell a page's content
gets placed inside. A theme can have more than one, an article layout and a
homepage layout, for example.

**Component**: a small, reusable piece of a template, a header or a card, that a
layout (or another component) can include by name, `<Header />`.

**Tau**: the template language Steno's themes are written in, `.tau` files.
Similar in spirit to JSX or Vue templates: mostly HTML, with `{ }` expressions
and `{#if}`/`{#each}` blocks mixed in. See [Tau syntax](tau_syntax.md).

**Plugin**: optional code that runs during a build to do something extra,
compile Tailwind CSS, highlight code blocks, generate an RSS feed. See
[Plugins](plugins.md).

**Collection**: an automatic grouping of pages by folder, every page under
`content/posts/` becomes part of `collections.posts`, ready to loop over in a
template. See [Collections](content.md#collections).

**Frontmatter schema / `configSchema`**: a set of rules (type, required, allowed
values) that either a collection's items or a theme's settings must follow,
checked automatically at build time so a typo fails loudly instead of silently
breaking your site.

**Permalink / route**: the URL a page ends up at. Usually derived automatically
from the file's path, but a page can set its own with `steno.permalink`. See
[Routes and permalinks](content.md#routes-and-permalinks).

**Short URLs**: with `shortUrls: true`, a page is written so its URL has no
`.html` in it (`/about` instead of `/about.html`), which is how most modern
sites look.

**Redirect**: a small page Steno generates at an old URL that automatically
sends visitors on to a new one, for when you rename or move a page. See
[Redirects](content.md#redirects).

**Output directory**: where the finished, built site is written, `dist/` by
default. This is the folder you actually deploy, see [Deploying](deploying.md).

**Trusted / isolated plugin**: two ways a plugin can run. A trusted plugin runs
inside Steno itself with full access to your machine, the same as Steno has. An
isolated plugin runs in its own locked-down process that starts with no
permissions at all, until you explicitly grant some. See
[Trust and permissions](plugins.md#trust-and-permissions).

**Content hash / cache busting**: baking a short hash of a file's own content
into its filename (`style.css` becomes `style.a1b2c3d4.css`), so that when the
file changes, its URL changes too. This is how Steno makes sure visitors (and
CDNs) always get your latest CSS and JavaScript after a redeploy, without you
having to manually clear a cache. See `hashAssets` in
[Configuration](config_reference.md#theme-globals-and-other-core-settings).

**CDN**: a content delivery network, a layer (Cloudflare, for example) that sits
in front of your host and caches your site's files close to visitors around the
world, for speed. Relevant here mainly because CDNs cache aggressively, which is
exactly what content hashing above solves for.
