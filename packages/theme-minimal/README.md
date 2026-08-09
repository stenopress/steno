# @steno/theme-minimal

A minimal theme for Steno static site generator.

## Usage

To use this theme, specify it in `content/.steno/config.yml`:

```yaml
theme: jsr:@steno/theme-minimal@^0.10.0
```

## Configuration

All fields are optional strings and can be set under `themeConfig`:

```yaml
theme: jsr:@steno/theme-minimal@^0.10.0
themeConfig:
  accent: "#7760a9"
  accentHover: "#5f488f"
  accentFg: "#ffffff"
  accentDark: "#9d86d0"
  accentDarkHover: "#b29ddd"
  accentDarkFg: "#09090b"
```

`accent`, `accentHover`, and `accentFg` set the light-mode accent color, its hover state, and the
foreground color used on top of it. `accentDark`, `accentDarkHover`, and `accentDarkFg` set the same
three for dark mode. Values default to the theme's own purple accent shown above.

## Development

To develop on this theme, you can use the Steno development server:

```sh
deno task dev
```

This will serve a sample site using this theme.
