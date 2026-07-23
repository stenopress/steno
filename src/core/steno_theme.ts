import { Theme } from "../theme/theme.ts";
import type { SiteConfig, StenoTheme } from "../types.ts";
import { fromFileUrl, isAbsolute, join, toFileUrl } from "@std/path";

const bundledThemeSources: Record<string, URL> = {
  "jsr:@steno/theme-minimal": new URL(
    "../../packages/theme-minimal",
    import.meta.url,
  ),
  "jsr:@steno/theme-docs-minimal": new URL(
    "../../packages/theme-docs-minimal",
    import.meta.url,
  ),
  "jsr:@steno/theme-marketing-minimal": new URL(
    "../../packages/theme-marketing-minimal",
    import.meta.url,
  ),
};

async function loadBundledTheme(
  themeName: string,
  themeConfig: Record<string, unknown> | undefined,
): Promise<Theme | undefined> {
  const localUrl = bundledThemeSources[themeName];
  if (!localUrl) return;
  const localPath = fromFileUrl(localUrl);

  try {
    const stat = await Deno.stat(localPath);
    if (stat.isDirectory) {
      for (const themeFile of ["theme.yaml", "theme.yml"]) {
        try {
          if ((await Deno.stat(join(localPath, themeFile))).isFile) {
            return Theme.loadFromDirectory(localPath, themeConfig);
          }
        } catch {
          // continue
        }
      }
      return;
    }

    const themeModule = await import(localUrl.href);
    const themeData = (themeModule.default || themeModule) as StenoTheme;
    return new Theme(themeData, themeConfig);
  } catch {
    return;
  }
}

export async function loadTheme(
  config: SiteConfig,
): Promise<Theme | undefined> {
  const themeName = config.custom?.theme;
  if (!themeName) return;

  try {
    const bundledTheme = await loadBundledTheme(
      themeName,
      config.custom?.themeConfig,
    );
    if (bundledTheme) {
      return bundledTheme;
    }

    const isLocalPath = themeName.startsWith(".") ||
      themeName.startsWith("/") ||
      themeName.startsWith("file://");

    if (isLocalPath) {
      const themeDir = themeName.startsWith("file://")
        ? fromFileUrl(new URL(themeName))
        : (isAbsolute(themeName) ? themeName : join(Deno.cwd(), themeName));

      let hasThemeYaml = false;
      try {
        Deno.statSync(join(themeDir, "theme.yaml"));
        hasThemeYaml = true;
      } catch {
        try {
          Deno.statSync(join(themeDir, "theme.yml"));
          hasThemeYaml = true;
        } catch {
          // ignore
        }
      }

      if (hasThemeYaml) {
        return Theme.loadFromDirectory(themeDir, config.custom?.themeConfig);
      }

      let resolvedPath = themeName.startsWith("file://")
        ? themeName
        : toFileUrl(
          isAbsolute(themeName) ? themeName : join(Deno.cwd(), themeName),
        ).href;

      let stat: Deno.FileInfo | undefined;
      try {
        stat = Deno.statSync(new URL(resolvedPath));
      } catch {
        // Stat failed, try importing directly.
      }

      if (stat?.isDirectory) {
        let found = false;
        for (const entry of ["mod.ts", "theme.ts", "index.ts"]) {
          const directoryUrl = new URL(
            resolvedPath.endsWith("/") ? resolvedPath : `${resolvedPath}/`,
          );
          const testUrl = new URL(entry, directoryUrl);
          try {
            Deno.statSync(testUrl);
            resolvedPath = testUrl.href;
            found = true;
            break;
          } catch {
            // ignore
          }
        }
        if (!found) {
          console.error(
            `Failed to load theme "${themeName}": Could not find mod.ts, theme.ts, or index.ts in theme directory "${themeName}"`,
          );
          return;
        }
      }

      const themeModule = await import(resolvedPath);
      const themeData = (themeModule.default || themeModule) as StenoTheme;
      return new Theme(themeData, config.custom?.themeConfig);
    }

    const themeModule = await import(themeName);
    const themeData = (themeModule.default || themeModule) as StenoTheme;
    return new Theme(themeData, config.custom?.themeConfig);
  } catch (error) {
    console.error(`Failed to load theme "${themeName}":`, error);
  }
}
