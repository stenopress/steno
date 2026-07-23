# @steno/theme-docs-minimal

A minimal documentation theme for Steno with the same editorial paper, ink,
serif-heading, and accent language as the Minimal and Marketing Minimal themes.
It preserves a dense nested documentation tree while keeping long-form content
quiet and highly readable.

## Usage

To use this theme, specify it in `content/.steno/config.yml`:

```yaml
custom:
  theme: jsr:@steno/theme-docs-minimal@^0.9.0
```

## Development

To develop on this theme, you can use the Steno development server:

```sh
deno task dev
```

This will serve a sample site using this theme.
