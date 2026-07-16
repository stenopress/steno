# Steno Theme Specification

This document defines the structural, metadata, and runtime specifications for
Steno themes. It outlines how templates are resolved, the contracts required for
module-based layouts, and the rendering variables provided by the Scribe engine.

---

## Supported Theme Sources

Steno resolves themes dynamically from the `custom.theme` property in your
configuration file. The runtime supports two distinct theme formats:

### 1. Module-Based Themes

Themes can be distributed as compiled JavaScript or TypeScript modules published
to registry ecosystems like JSR, npm, or hosted at secure URLs. Steno resolves
these using dynamic runtime imports:

```typescript
await import(themeName);
```

### 2. Local Directory Themes

Themes can live locally in your workspace. A local theme is defined by a
directory containing a metadata manifest file named `theme.yaml` or `theme.yml`.

If a local theme directory does not contain a configuration manifest, Steno
automatically attempts to fallback and resolve it as a module entrypoint looking
for `mod.ts`, `theme.ts`, or `index.ts`.

---

## Theme Contract (StenoTheme)

Module-based themes must export an object implementing the `StenoTheme`
interface defined in `src/theme/types.ts`:

```typescript
export interface StenoTheme {
  name: string;
  version: string;
  layouts: Record<string, string>;
  components?: Record<string, string>;
  assets?: Record<string, string | Uint8Array | URL>;
  configSchema?: Record<string, any>;
  defaultConfig?: Record<string, any>;
}
```

### Key Contract Rules

- **Default Layout Resolution:** The default layout identifier is `layout`. This
  template is resolved automatically when a page's frontmatter does not
  explicitly declare a custom layout property.
- **Configuration Merging:** Values defined in `defaultConfig` serve as the
  baseline theme options. Custom variables defined by the user in
  `custom.themeConfig` will deep-merge and override these defaults.
- **Asset Distribution:** Static assets are automatically extracted and copied
  into the target production build directory under `dist/assets/` keeping their
  relative paths intact.

---

## Local Directory Theme Format

Local file-system themes rely on convention over configuration. The theme
manifest file provides metadata and explicitly registers components:

```yaml
# theme.yaml
name: "Steno Minimalist"
version: "1.0.0"
components:
  header: "components/header.scr"
  footer: "components/footer.scr"
defaultConfig:
  author: "Steno Creator"
```

### Directory Conventions

The local loader engine (`Theme.loadFromDirectory()`) scans and maps files based
on their location inside the theme folder:

| Path               | Purpose                    | Behavior                                                         |
| ------------------ | -------------------------- | ---------------------------------------------------------------- |
| `layouts/*.scr`    | Page layout templates      | Loaded into the runtime layouts map.                             |
| `components/*.scr` | Reusable UI components     | Normalizes keys to PascalCase (e.g., `header` becomes `Header`). |
| `assets/**`        | CSS, JS, fonts, and images | Copied recursively to `dist/assets/`.                            |

---

## Template Syntax

Steno layouts and components are compiled and rendered using the Scribe template
engine. Scribe supports declarative markup and logic control structures:

### Variables and Filters

Render variables safely using standard braces. Scribe supports Unix-style pipe
operators for formatting transformations:

```html
<h1>{ title | upper }</h1>
<p>{ date | date("MMMM D, YYYY") }</p>
```

### HTML Passthrough

To inject raw, unescaped markup (such as the compiled Markdown body), use the
`@html` directive:

```html
<article>
  {@html content}
</article>
```

### Conditional Blocks

Handle conditional template logic cleanly:

```html
{#if author}
  <span class="author">{ author }</span>
{:else}
  <span class="author">Guest Writer</span>
{/if}
```

### Iteration Loops

Loop through lists and arrays:

```html
{#each tags as tag}
  <span class="tag">{ tag }</span>
{/each}
```

### Custom Components

Invoke registered theme components using self-closing tags, with full support
for dynamic prop bindings:

```html
<Header />
<Card title={title} description={description} />
```

---

## Page Render Context

During a build compile cycle, the Scribe engine passes a structured, immutable
state object to your active layout template. The following root variables are
available in the template scope:

| Variable      | Type   | Description                                                                                                                         |
| ------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| `content`     | String | The fully compiled HTML body parsed from the Markdown file.                                                                         |
| `site`        | Object | Global site properties including title, description, and output directory.                                                          |
| `theme`       | Object | The active theme metadata merged with custom user configuration.                                                                    |
| `globals`     | Object | Global template variables registered under `custom.globals` in the config file.                                                     |
| `frontmatter` | Object | All key-value pairs defined in the page's YAML or TOML block are spread directly at the root level (e.g., `{ title }`, `{ date }`). |
