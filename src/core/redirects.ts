import { join, resolve } from "@std/path";
import { ensureParentDirSync } from "../utils/fs.ts";
import { isPathInsideOrEqual } from "./path_utils.ts";
import { escapeHtml } from "../utils/tau.ts";
import { DiagnosticBag } from "./diagnostics.ts";

function buildRedirectHtml(to: string): string {
  const safeTo = escapeHtml(to);
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta http-equiv="refresh" content="0; url=${safeTo}" />
    <link rel="canonical" href="${safeTo}" />
    <title>Redirecting...</title>
  </head>
  <body>
    <p>Redirecting to <a href="${safeTo}">${safeTo}</a>...</p>
  </body>
</html>`;
}

/**
 * Computes the on-disk path a redirect's HTML file would be written to,
 * without touching the filesystem — callers must verify the result stays
 * inside `outputDir` (via `isPathInsideOrEqual`) before creating anything,
 * since `from` may contain `..` segments.
 */
function resolveRedirectOutputPath(
  outputDir: string,
  from: string,
  shortUrls: boolean,
): string {
  // normalise leading slash
  const clean = from.replace(/^\//, "");

  return shortUrls ? join(outputDir, clean, "index.html") : join(outputDir, `${clean}.html`);
}

/**
 * Writes meta-refresh HTML redirect files for each entry in the redirects map.
 *
 * @param outputDir - The root output directory (e.g. "dist").
 * @param redirects - Map of { "/old-path": "/new-path" }.
 * @param shortUrls - Whether the site uses short URL directory structure.
 */
export function buildRedirects(
  outputDir: string,
  redirects: Record<string, string>,
  shortUrls: boolean,
  occupiedPaths: Set<string> = new Set(),
  diagnostics: DiagnosticBag = new DiagnosticBag(),
): void {
  for (const [from, to] of Object.entries(redirects)) {
    if (!from.startsWith("/")) {
      diagnostics.add({
        code: "redirect-invalid",
        severity: "error",
        message: `Redirect "${from}" is invalid - redirect paths must start with "/".`,
      });
      continue;
    }

    if (!to) {
      diagnostics.add({
        code: "redirect-invalid",
        severity: "error",
        message: `Redirect "${from}" is invalid - its target cannot be empty.`,
      });
      continue;
    }

    const outputPath = resolveRedirectOutputPath(outputDir, from, shortUrls);
    const normalizedOutputPath = resolve(outputPath);
    if (!isPathInsideOrEqual(normalizedOutputPath, resolve(outputDir))) {
      diagnostics.add({
        code: "redirect-invalid",
        severity: "error",
        message: `Redirect "${from}" is invalid - it resolves outside the output directory.`,
      });
      continue;
    }
    if (occupiedPaths.has(normalizedOutputPath)) {
      throw new Error(
        `Output collision: redirect "${from}" would overwrite "${outputPath}".`,
      );
    }
    occupiedPaths.add(normalizedOutputPath);
    ensureParentDirSync(outputPath);
    Deno.writeTextFileSync(outputPath, buildRedirectHtml(to));
    console.log(`[redirects] ${from} → ${to}`);
  }
}
