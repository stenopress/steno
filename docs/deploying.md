# Deploying

`steno build` writes plain files into `dist/` (or whatever you set `output` to):
HTML, CSS, JavaScript, images. There is no server, no database, and nothing that
needs to keep running. That means you can put it on almost any host built for
static files. This page walks through the common ones.

Every option below runs the same two commands, they just differ in where those
commands run and where the result ends up:

```sh
deno install # only needed if the project has dependencies to fetch first
deno task build
```

If your project doesn't have a `deno task build` (for example, you didn't
scaffold it with `deno create jsr:@steno/init`), use
`deno run --allow-read --allow-write --allow-net --allow-env jsr:@steno/steno build`
instead.

## GitHub Actions

This workflow builds your site on every push to `main` and publishes it to
GitHub Pages. Save it as `.github/workflows/deploy.yml`:

```yaml
name: Deploy

on:
  push:
    branches: [main]

permissions:
  contents: read
  pages: write
  id-token: write

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: denoland/setup-deno@v2
        with:
          deno-version: v2.x
      - run: deno task build
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

Then turn on GitHub Pages for the repository (Settings, then Pages, then set
Source to "GitHub Actions"). If your project doesn't have a `deno task
build`,
replace that step's `run:` line with the `deno run ...` command above.

You don't have to deploy to GitHub Pages specifically, this same
`build`-then-`upload-pages-artifact` shape works with almost any GitHub Actions
deploy step; swap the last job for whatever your host's official action is (see
Vercel, Netlify, and Cloudflare Pages below, most of them publish one).

## Vercel, Netlify, and Cloudflare Pages

These three all work the same way: point them at your repository, tell them how
to build your site and where the result lands, and they take care of the rest,
including a new deployment on every push.

Whichever one you use, the settings are the same:

- **Build command**: `deno task build` (or the `deno run ...` command above if
  your project doesn't define that task)
- **Output directory**: `dist`
- **Framework preset**: pick "Other" (or "None") since none of them know Steno
  specifically

The one thing to check is that Deno itself is available during the build. Some
hosts have it preinstalled; if yours doesn't, add an install step before the
build command:

```sh
curl -fsSL https://deno.land/install.sh | sh -s -- --yes
export PATH="$HOME/.deno/bin:$PATH"
deno task build
```

If you're on Cloudflare Pages (or any CDN in front of your site) and worried
about stale cached CSS or JavaScript after a redeploy, you don't need to do
anything extra: Steno already gives theme CSS and JS files a content hash in
their filename by default, so a changed file gets a brand new URL automatically.
See `hashAssets` in
[Configuration](config_reference.md#theme-globals-and-other-core-settings) if
you ever want to turn that off.

## Self-hosting (a server or a Docker container)

If you're running your own server, a VPS, or a platform like Dokploy or Coolify
that expects a long-running container, build the site the same way and then
serve the `dist/` folder with any static file server. Don't use `steno preview`
for this: it only listens on `127.0.0.1` (your own machine), by design, so it is
meant for a final local check before you ship, not for serving real traffic.

A minimal `Dockerfile` that builds the site and serves it with
[Caddy](https://caddyserver.com/):

```dockerfile
FROM denoland/deno:2.9.4 AS build
WORKDIR /app
COPY . .
RUN deno task build

FROM caddy:2-alpine
COPY --from=build /app/dist /usr/share/caddy
```

Any other static file server works just as well, nginx, `serve`, Caddy, or your
platform's built-in one, as long as it binds to `0.0.0.0` (all interfaces)
rather than `127.0.0.1`, so traffic from outside the container can actually
reach it.

## What to read next

- [Configuration](config_reference.md) for `output` and other build-time
  settings.
- [Transactional builds](atomic_builds.md) for what happens if a build fails
  partway through, useful context if you're scripting deploys yourself.
