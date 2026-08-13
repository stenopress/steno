import { fromFileUrl, isAbsolute, join, toFileUrl } from "@std/path";
import { Theme, bundledThemeLocalPath, bundledThemeSources } from "../theme/theme.ts";
import type { SiteConfig, StenoTheme } from "../types.ts";
import { errorMessage } from "../utils/text.ts";
import { resolveTheme, resolveThemeConfig } from "./config.ts";
import { DiagnosticBag } from "./diagnostics.ts";

export { bundledThemeLocalPath };

/** Whether `themeName` refers to a local filesystem path, not a package specifier. */
function isLocalThemePath(themeName: string): boolean {
  return themeName.startsWith(".") || themeName.startsWith("/") || themeName.startsWith("file://");
}

function resolveLocalThemeDir(themeName: string): string {
  return themeName.startsWith("file://")
    ? fromFileUrl(new URL(themeName))
    : isAbsolute(themeName)
      ? themeName
      : join(Deno.cwd(), themeName);
}

/**
 * Returns the local theme's directory to watch during `steno dev`, or
 * `undefined` when the configured theme isn't a local path — bundled/jsr/npm
 * themes aren't edited during a normal dev session, so there's nothing to
 * watch for them.
 */
export function resolveThemeWatchDir(config: SiteConfig): string | undefined {
  const themeName = resolveTheme(config);
  if (!themeName || !isLocalThemePath(themeName)) return undefined;
  return resolveLocalThemeDir(themeName);
}

/**
 * Imports `specifierUrl` bypassing Deno's module cache, by appending the
 * file's mtime as a query string. Dynamic `import()` of the exact same URL
 * always returns the previously cached module even after the file changes
 * on disk — verified directly, this is not a rare edge case — so a plain
 * `import()` of a local theme would silently keep serving stale code across
 * dev-server rebuilds. Only meaningful for local file:// specifiers.
 */
async function importFresh(specifierUrl: string): Promise<unknown> {
  let cacheBuster = "";
  try {
    const mtime = (await Deno.stat(fromFileUrl(specifierUrl))).mtime?.getTime();
    if (mtime !== undefined) cacheBuster = `?mtime=${mtime}`;
  } catch {
    // Not a statable local file:// path — import without busting the cache.
  }
  return await import(`${specifierUrl}${cacheBuster}`);
}

async function loadBundledTheme(
  themeName: string,
  themeConfig: Record<string, unknown> | undefined,
): Promise<Theme | undefined> {
  const localUrl = bundledThemeSources[themeName];
  if (!localUrl) return;
  const localPath = bundledThemeLocalPath(localUrl);
  if (!localPath) return;

  try {
    const stat = await Deno.stat(localPath);
    if (stat.isDirectory) {
      for (const themeFile of ["theme.yaml", "theme.yml"]) {
        try {
          if ((await Deno.stat(join(localPath, themeFile))).isFile) {
            return await Theme.loadFromDirectory(localPath, themeConfig);
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
  diagnostics: DiagnosticBag = new DiagnosticBag(),
): Promise<Theme | undefined> {
  const themeName = resolveTheme(config);
  if (!themeName) return;
  const themeConfig = resolveThemeConfig(config);

  try {
    const bundledTheme = await loadBundledTheme(themeName, themeConfig);
    if (bundledTheme) {
      return bundledTheme;
    }

    if (isLocalThemePath(themeName)) {
      const themeDir = resolveLocalThemeDir(themeName);

      const hasThemeYaml = ["theme.yaml", "theme.yml"].some((fileName) => {
        try {
          Deno.statSync(join(themeDir, fileName));
          return true;
        } catch {
          return false;
        }
      });

      if (hasThemeYaml) {
        return await Theme.loadFromDirectory(themeDir, themeConfig);
      }

      let resolvedPath = themeName.startsWith("file://")
        ? themeName
        : toFileUrl(isAbsolute(themeName) ? themeName : join(Deno.cwd(), themeName)).href;

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
          diagnostics.add({
            code: "theme-load-failed",
            severity: "error",
            message: `Could not find mod.ts, theme.ts, or index.ts in theme directory "${themeName}".`,
            file: themeName,
            hint: "A directory-based local theme needs a theme.yaml/theme.yml, or one of mod.ts/theme.ts/index.ts exporting a StenoTheme.",
          });
          return;
        }
      }

      const themeModule = (await importFresh(resolvedPath)) as {
        default?: StenoTheme;
      };
      const themeData = (themeModule.default || themeModule) as StenoTheme;
      return new Theme(themeData, themeConfig);
    }

    const themeModule = await import(themeName);
    const themeData = (themeModule.default || themeModule) as StenoTheme;
    return new Theme(themeData, themeConfig);
  } catch (error) {
    diagnostics.add({
      code: "theme-load-failed",
      severity: "error",
      message: `Failed to load theme "${themeName}": ${errorMessage(error)}`,
      file: themeName,
      hint: "Check the theme specifier and that its module/directory actually exports a valid StenoTheme.",
    });
  }
}
