import { dirname, join, resolve } from "@std/path";
import { ensureDirSync } from "../utils/fileUtils.ts";

function buildRedirectHtml(to: string): string {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta http-equiv="refresh" content="0; url=${to}" />
    <link rel="canonical" href="${to}" />
    <title>Redirecting...</title>
  </head>
  <body>
    <p>Redirecting to <a href="${to}">${to}</a>...</p>
  </body>
</html>`;
}

function resolveRedirectOutputPath(
  outputDir: string,
  from: string,
  shortUrls: boolean,
): string {
  // normalise leading slash
  const clean = from.replace(/^\//, "");

  if (shortUrls) {
    const dir = join(outputDir, clean);
    ensureDirSync(dir);
    return join(dir, "index.html");
  }

  const filePath = join(outputDir, `${clean}.html`);
  ensureDirSync(dirname(filePath));
  return filePath;
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
): void {
  for (const [from, to] of Object.entries(redirects)) {
    if (!from.startsWith("/")) {
      console.warn(
        `[redirects] Skipping "${from}" — redirect paths must start with "/".`,
      );
      continue;
    }

    if (!to) {
      console.warn(
        `[redirects] Skipping "${from}" — redirect target cannot be empty.`,
      );
      continue;
    }

    const outputPath = resolveRedirectOutputPath(outputDir, from, shortUrls);
    const normalizedOutputPath = resolve(outputPath);
    if (occupiedPaths.has(normalizedOutputPath)) {
      throw new Error(
        `Output collision: redirect "${from}" would overwrite "${outputPath}".`,
      );
    }
    occupiedPaths.add(normalizedOutputPath);
    Deno.writeTextFileSync(outputPath, buildRedirectHtml(to));
    console.log(`[redirects] ${from} → ${to}`);
  }
}
