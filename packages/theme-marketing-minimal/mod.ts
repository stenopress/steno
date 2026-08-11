/** A restrained editorial marketing theme for Steno. @module */
import type { StenoTheme, ThemeConfigField } from "@steno/steno";

const layout = await fetch(new URL("./layouts/layout.tau", import.meta.url)).then((response) =>
  response.text(),
);

const defaultConfig = {
  accent: "#7760a9",
  accentHover: "#5f488f",
  accentFg: "#ffffff",
  accentDark: "#a994d8",
  accentDarkHover: "#c0afe6",
  accentDarkFg: "#171519",
  eyebrow: "A clearer way forward",
  heroTitle: "Make the important thing impossible to miss.",
  heroDescription: "A focused, fast landing page for products, studios, and ideas worth sharing.",
  primaryLabel: "Get started",
  primaryUrl: "#content",
  secondaryLabel: "Learn more",
  secondaryUrl: "#content",
  githubUrl: "https://github.com/stenopress/steno",
  jsrUrl: "https://jsr.io/@steno/steno",
};

const configSchema = Object.fromEntries(
  Object.entries(defaultConfig).map(([key, value]) => [key, { type: "string", default: value }]),
) as Record<string, ThemeConfigField>;

/** Marketing-focused official Steno theme. */
const theme: StenoTheme = {
  name: "marketing-minimal",
  version: "0.11.0",
  layouts: { layout },
  assets: {
    "style.css": new URL("./assets/style.css", import.meta.url),
    "site.js": new URL("./assets/site.js", import.meta.url),
    "steno-logo.svg": new URL("./assets/steno-logo.svg", import.meta.url),
    "tau.svg": new URL("./assets/tau.svg", import.meta.url),
    "phosphor-icons.svg": new URL("./assets/phosphor-icons.svg", import.meta.url),
  },
  defaultConfig,
  configSchema,
};

export default theme;
