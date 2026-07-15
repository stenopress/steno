# Steno Theme Development Guide

Steno's theming system is designed to be flexible, allowing you to define
layouts, components, and static assets to control the look and feel of your
site.

## Theme Structure

A Steno theme is typically a directory containing:

```
my-theme/
├── theme.yaml          # Theme metadata and configuration
├── layouts/            # Scribe templates for page layouts
│   ├── default.scr
│   └── post.scr
├── components/         # Scribe templates for reusable UI components
│   ├── Header.scr
│   └── Footer.scr
└── assets/             # Static assets (CSS, JS, images)
    ├── css/
    │   └── style.css
    └── js/
        └── main.js
```

## `theme.yaml`

This file defines your theme's metadata and default configuration.

```yaml
# theme/theme.yaml
name: "My Awesome Theme"
version: "1.0.0"
description: "A custom theme for Steno"

# Define components and their paths relative to the theme root
components:
  header: "components/Header.scr"
  footer: "components/Footer.scr"

# Define default configuration for your theme
defaultConfig:
  brand: "My Site Brand"
  menu:
    - name: "Home"
      url: "/"
    - name: "About"
      url: "/about"
```

## Layouts (`.scr` files)

Layouts are the main templates that wrap your content. They are Scribe templates
and typically reside in the `layouts/` directory.

When a Markdown file specifies `layout: "post"`, Steno will look for
`theme/layouts/post.scr`. If no layout is specified, it defaults to
`layout: "layout"` (or `default` if configured).

Inside a layout, you have access to several variables:

- **`site`**: Global site configuration (e.g., `site.title`, `site.description`,
  `site.author`, `site.custom`).
- **`theme`**: Theme metadata and merged theme configuration (e.g.,
  `theme.name`, `theme.version`, `theme.brand`, `theme.menu`).
- **`globals`**: Values from `custom.globals` in site config (e.g.,
  `globals.company`, `globals.tagline`).
- **Frontmatter keys**: All keys defined in the Markdown file's frontmatter
  (e.g., `title`, `date`, `tags`).
- **`content`**: The already-rendered HTML body of the Markdown file.

**Example (`layouts/default.scr`):**

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{ title } - { site.title }</title>
    <link rel="stylesheet" href="/assets/css/style.css">
  </head>
  <body>
    <header /> {# Render the Header component #}
    <main>
      <h1>{ title }</h1>
      {#if date}
      <p>Published on { date | date("MMMM D, YYYY") }</p>
      {/if} {@html content} {# Inject the Markdown content here #}
    </main>
    <footer /> {# Render the Footer component #}
  </body>
</html>
```

## Components (`.scr` files)

Components are reusable Scribe templates for smaller UI elements. They are
defined in `theme.yaml` and can be placed anywhere within your theme directory.

**Example (`components/Header.scr`):**

```html
<header>
  <nav>
    <a href="/">
      { theme.brand || site.title }
    </a>
    <ul>
      {#each theme.menu as item}
      <li><a href="{ item.url }">{ item.name }</a></li>
      {/each}
    </ul>
  </nav>
</header>
```

To use a component in a layout or another component, use its capitalized name as
a self-closing tag: `<Header />`.

## Assets (`assets/` directory)

The `assets/` directory holds your static files like CSS, JavaScript, images,
fonts, etc. Steno automatically copies the contents of this directory to
`dist/assets/` during the build process.

You can reference these assets in your layouts using relative paths from the
root of your site (e.g., `/assets/css/style.css`).

## Scribe Template Language

Steno uses a custom template language called Scribe. Here are some key features:

- **Expressions**: `{ variable }` or `{ variable | filterName("arg") }`
- **HTML Passthrough**: `{@html rawHtmlVariable}` (for injecting unescaped HTML,
  like your Markdown content)
- **Conditionals**: `{#if condition} ... {/if}`,
  `{#if condition} ... {#else} ... {/if}`
- **Loops**: `{#each array as item} ... {/each}`
- **Components**: `<ComponentName />`

### Built-in Filters

- **`date(format?: string)`**: Formats a `Date` object or date string. Uses
  `YYYY-MM-DD` by default, or a custom format string (e.g., `"MMMM D, YYYY"`).

## Using Your Theme

To use your custom theme, update your site's `content/.steno/config.yml`:

```yaml
# content/.steno/config.yml
custom:
  theme: "./theme" # Path to your theme directory
  themeConfig: # Optional: pass configuration to your theme
    brand: "My Custom Brand"
    menu:
      - name: "Home"
        url: "/"
      - name: "Blog"
        url: "/blog"
  globals: # Optional: global values available in every layout/component
    company: "My Company"
    tagline: "Ship docs fast"
```

Steno will automatically detect and load your theme from the specified local
path.
