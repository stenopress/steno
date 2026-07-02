import { Theme } from "../theme/theme.ts";
import type { SiteConfig, StenoTheme } from "../types.ts";
import { isAbsolute, join } from "@std/path";

export async function loadTheme(config: SiteConfig): Promise<Theme | undefined> {
  const themeName = config.custom?.theme;
  if (!themeName) return;

  try {
    const isLocalPath = themeName.startsWith(".") ||
      themeName.startsWith("/") ||
      themeName.startsWith("file://");

    if (isLocalPath) {
      const themeDir = themeName.startsWith("file://")
        ? new URL(themeName).pathname
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
        : `file://${
          isAbsolute(themeName) ? themeName : join(Deno.cwd(), themeName)
        }`;

      let stat: Deno.FileInfo | undefined;
      try {
        stat = Deno.statSync(new URL(resolvedPath));
      } catch {
        // Stat failed, try importing directly.
      }

      if (stat?.isDirectory) {
        let found = false;
        for (const entry of ["mod.ts", "theme.ts", "index.ts"]) {
          const testPath = `${resolvedPath.replace(/\/$/, "")}/${entry}`;
          try {
            Deno.statSync(new URL(testPath));
            resolvedPath = testPath;
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
