# Steno API Reference

This document provides a detailed reference for Steno's public API, including
classes, functions, and types available for programmatic use and theme
development.

## Core Classes

### `Steno`

The main orchestrator class for building and serving your static site.

- **`constructor(configPath?: string, autoBuildOnInit?: boolean)`**: Initializes
  a new Steno instance.
  - `configPath`: Path to the site config file (default:
    `"content/.steno/config.yml"`).
  - `autoBuildOnInit`: If `true`, triggers a build immediately on instantiation
    unless in dev mode (default: `true`).
- **`build(): Promise<void>`**: Compiles Markdown files into the final HTML
  output directory.
- **`dev(): Promise<void>`**: Starts a development server with automatic file
  watching and rebuilding.

### `Theme`

Manages theme templates, components, assets, and rendering logic.

- **`constructor(themeData: StenoTheme, userConfig?: ThemeConfig)`**: Creates a
  new Theme instance.
  - `themeData`: The base configuration/templates of the theme.
  - `userConfig`: Optional overrides for the theme defaults.
- **`static loadFromDirectory(dir: string, userConfig?: ThemeConfig): Theme`**:
  Helper to load a filesystem-based theme directory using a `theme.yaml` file.
  - `dir`: The path to the theme directory.
  - `userConfig`: Optional overrides for the theme configuration.
- **`renderLayout(layoutName: string, content: string, variables: Record<string, unknown>): string`**:
  Renders a layout template with content and page variables using Scribe.
- **`renderComponent(componentName: string, variables: Record<string, unknown>): string`**:
  Renders a theme component using Scribe.
- **`copyAssets(outputDir: string): Promise<void>`**: Copies all theme assets to
  the output directory (e.g., `dist/assets/`).

## Scribe Rendering Utilities

### `render(options: ScribeOptions): string`

The core Scribe rendering function.

- **`options`**: An object containing:
  - `template`: The Scribe template string.
  - `context`: An object providing data to the template.
  - `components`: Optional object of component templates.
  - `filePath`: Optional file path for error reporting.

### `filters`

An object containing built-in Scribe filters.

- **`date(value: string | Date, format?: string): string`**: Formats a date.
- _(More filters will be documented here as they are added)_

## Types

### `SiteConfig`

Interface representing the structure of the site's configuration.

```typescript
interface SiteConfig {
  title: string;
  description?: string;
  author?: string;
  contentDir?: string; // Default: "content"
  output?: string; // Default: "dist"
  custom?: {
    theme?: string; // Path or URL to theme
    themeConfig?: Record<string, unknown>; // Theme-specific config
    globals?: Record<string, unknown>; // Global template variables
    shortUrls?: boolean; // If true, generates directory URLs (e.g., /post/index.html)
    // ... other custom properties
  };
  // ... other standard properties
}
```

### `StenoTheme`

Interface representing the structure of a theme's data.

```typescript
interface StenoTheme {
  name: string;
  version: string;
  layouts?: Record<string, string>; // Layout templates by name
  components?: Record<string, string>; // Component templates by name
  assets?: Record<string, string | Uint8Array | URL>; // Static assets
  defaultConfig?: Record<string, unknown>; // Default theme configuration
}
```

### `ScribeOptions`

Interface for the options passed to the `render` function.

```typescript
interface ScribeOptions {
  template: string;
  context: Record<string, unknown>;
  components?: Record<string, string>;
  filePath?: string;
}
```

---

_This API Reference is generated from the project's JSDoc/TypeDoc comments. For
the most up-to-date and detailed information, please refer to the source code
and generated documentation._
