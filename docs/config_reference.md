# Steno Configuration Reference

Steno's behavior is controlled by a configuration file, typically located at
`content/.steno/config.yml` (or `.toml`). This file defines global site
settings, output directories, and custom options for themes and build processes.

## Configuration File Location

By default, Steno looks for a configuration file at `content/.steno/config.yml`.
You can specify a different path using the `--config` CLI option.

Steno supports both **YAML** (`.yml`, `.yaml`) and **TOML** (`.toml`) formats
for the configuration file.

## Core Configuration Properties

These are the standard properties you can define in your `config.yml` (or
`.toml`):

- **`title`** (string, **required**): The main title of your site. Used in
  layouts and for SEO.
  ```yaml
  title: "My Awesome Steno Site"
  ```

- **`description`** (string, optional): A short description of your site. Useful
  for meta tags and SEO.
  ```yaml
  description: "A blog about Deno and static site generation."
  ```

- **`author`** (string, optional): The author of the site.
  ```yaml
  author: "Jane Doe"
  ```

- **`contentDir`** (string, optional): The directory where your Markdown content
  files are located.
  - **Default**: `"content"`
  ```yaml
  contentDir: "my_markdown_files"
  ```

- **`output`** (string, optional): The directory where the generated HTML and
  assets will be written.
  - **Default**: `"dist"`
  ```yaml
  output: "public"
  ```

- **`plugins`** (array, optional): Plugins to load during build.
  - String form:
    ```yaml
    plugins:
      - "jsr:@stenodevs/my-plugin"
    ```
  - Object form (with options passed to the plugin factory):
    ```yaml
    plugins:
      - package: "npm:@steno/html-minifier"
        options:
          collapseWhitespace: true
    ```

## `custom` Properties

The `custom` section is a flexible object where you can define additional,
non-standard configuration options. These are often used by themes or custom
plugins.

- **`custom.theme`** (string, optional): Specifies the theme to use for your
  site.
  - Can be a local path to a theme directory (e.g., `"./theme"`,
    `"/path/to/my-theme"`).
  - Can be a Deno module specifier (e.g. `"jsr:@steno/default-theme"`).
  ```yaml
  custom:
    theme: "./my-local-theme"
  ```

- **`custom.themeConfig`** (object, optional): An object containing
  configuration specific to your chosen theme. These values are passed directly
  to the theme and can be accessed within your theme's templates (e.g.,
  `theme.brand`).
  ```yaml
  custom:
    theme: "./my-local-theme"
    themeConfig:
      brand: "Steno Blog"
      menu:
        - name: "Home"
          url: "/"
        - name: "About"
          url: "/about"
  ```

- **`custom.globals`** (object, optional): Global variables available in every
  rendered page/layout context as `globals.<key>`.
  ```yaml
  custom:
    globals:
      company: "Steno"
      tagline: "Build fast"
      links:
        docs: "/docs/"
  ```

- **`custom.shortUrls`** (boolean, optional): If `true`, Steno will generate
  "short URLs" for non-root pages.
  - Instead of `post.html`, it will create a directory `post/` containing
    `index.html`. This allows for cleaner URLs like `/post/` instead of
    `/post.html`.
  - **Default**: `false`
  ```yaml
  custom:
    shortUrls: true
  ```

- **`custom.pluginSecurity`** (object, optional): Security policy for plugin
  module imports.
  - **Secure defaults**:
    - Local `file://` plugin imports are blocked.
    - Remote `http(s)://` plugin imports are blocked.
    - `node:` builtin plugin imports are blocked.
    - `data:` and `blob:` plugin imports are always blocked.
  - You can opt in per source type:
    ```yaml
    custom:
      pluginSecurity:
        allowLocal: true
        allowRemoteHttp: false
        allowNodeBuiltins: false
        allowThemePlugins: true
    ```
  - Set `allowThemePlugins: false` to disable plugins bundled by the active
    theme and only run explicitly listed site plugins.

## Example `config.yml`

```yaml
title: "My Steno Project"
description: "A simple static site."
author: "Steno User"
contentDir: "content"
output: "dist"

custom:
  theme: "./theme"
  themeConfig:
    brand: "Steno"
    social:
      twitter: "https://twitter.com/deno_land"
      github: "https://github.com/denoland/deno"
  globals:
    company: "Steno"
    tagline: "Build fast"
  shortUrls: true
```
