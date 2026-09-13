import { Theme as CoreTheme } from "@steno/core/theme";
import type { BundledThemeSources, ThemeConfig } from "@steno/core/theme";

export { bundledThemeLocalPath, mergeTheme } from "@steno/core/theme";
export type { PageRenderContext, ThemeConfig } from "@steno/core/theme";

/** Bundled theme locations remain relative to the Steno package. */
export const bundledThemeSources: Record<string, URL> = {
  "jsr:@steno/theme-minimal": new URL("../../packages/theme-minimal", import.meta.url),
  "jsr:@steno/theme-docs-minimal": new URL("../../packages/theme-docs-minimal", import.meta.url),
  "jsr:@steno/theme-marketing-minimal": new URL(
    "../../packages/theme-marketing-minimal",
    import.meta.url,
  ),
};

/** Shared theme behavior with Steno's bundled directory locations. */
export class Theme extends CoreTheme {
  /** Loads a directory theme, preserving Steno's bundled-theme resolution. */
  public static override loadFromDirectory(
    dir: string,
    userConfig: ThemeConfig = {},
    bundledThemes: BundledThemeSources = bundledThemeSources,
  ): Promise<Theme> {
    return super.loadFromDirectory(dir, userConfig, bundledThemes);
  }
}
