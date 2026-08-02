# @steno/theme-marketing-minimal

A polished, content-driven landing-page theme for Steno with responsive product
sections, code examples, calls to action, and lightweight interactions.

```yaml
custom:
  theme: jsr:@steno/theme-marketing-minimal@^0.10.0
  themeConfig:
    githubUrl: https://github.com/your-org/your-project
    jsrUrl: https://jsr.io/@your-org/your-project
```

Write landing-page sections directly in Markdown or trusted HTML. The theme
supplies the responsive shell, visual system, footer, icons, and copy-command
interaction.

## Configuration

All fields are optional strings and can be set under `custom.themeConfig`.

```yaml
custom:
  themeConfig:
    accent: "#7760a9"
    accentHover: "#5f488f"
    accentFg: "#ffffff"
    accentDark: "#a994d8"
    accentDarkHover: "#c0afe6"
    accentDarkFg: "#171519"
    eyebrow: "A clearer way forward"
    heroTitle: "Make the important thing impossible to miss."
    heroDescription: "A focused, fast landing page for products, studios, and ideas worth sharing."
    primaryLabel: "Get started"
    primaryUrl: "#content"
    secondaryLabel: "Learn more"
    secondaryUrl: "#content"
    githubUrl: "https://github.com/stenopress/steno"
    jsrUrl: "https://jsr.io/@steno/steno"
```

`accent`, `accentHover`, and `accentFg` set the light-mode accent color, its
hover state, and the foreground color used on top of it; `accentDark`,
`accentDarkHover`, and `accentDarkFg` set the same three for dark mode.
`eyebrow` is the small label above the hero title. `heroTitle` and
`heroDescription` are the hero heading and its supporting paragraph.
`primaryLabel`/`primaryUrl` and `secondaryLabel`/`secondaryUrl` set the two hero
call-to-action buttons. `githubUrl` and `jsrUrl` link the header/footer icons;
set them to your own project instead of Steno's. Values shown above are the
theme's defaults.

## Development

To develop on this theme, you can use the Steno development server:

```sh
deno task dev
```

This will serve a sample site using this theme.
