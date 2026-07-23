/** A restrained editorial marketing theme for Steno. @module */
import type { StenoTheme, ThemeConfigField } from "@steno/steno";

const layout = await fetch(new URL("./layouts/layout.tau", import.meta.url))
  .then((response) => response.text());

const defaultConfig = {
  accent: "#7760a9",
  accentHover: "#5f488f",
  accentFg: "#ffffff",
  accentDark: "#a994d8",
  accentDarkHover: "#c0afe6",
  accentDarkFg: "#171519",
  eyebrow: "A clearer way forward",
  heroTitle: "Make the important thing impossible to miss.",
  heroDescription:
    "A focused, fast landing page for products, studios, and ideas worth sharing.",
  primaryLabel: "Get started",
  primaryUrl: "#content",
  secondaryLabel: "Learn more",
  secondaryUrl: "#content",
};

const configSchema = Object.fromEntries(
  Object.entries(defaultConfig).map(([key, value]) => [
    key,
    { type: "string", default: value },
  ]),
) as Record<string, ThemeConfigField>;

const theme: StenoTheme = {
  name: "marketing-minimal",
  version: "0.9.0",
  layouts: { layout },
  assets: { "style.css": new URL("./assets/style.css", import.meta.url) },
  defaultConfig,
  configSchema,
};

export default theme;
