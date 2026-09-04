import { join, resolve } from "@std/path";
import type { StenoTheme } from "../types.ts";
import { mapWithConcurrency } from "../utils/concurrency.ts";
import { ensureParentDirSync } from "../utils/fs.ts";
import { minifyCss } from "../utils/text.ts";

const ASSET_COPY_CONCURRENCY = 32;
const HASHABLE_ASSET_PATTERN = /\.m?js$|\.css$/i;
const CSS_ASSET_PATTERN = /\.css$/i;

type ThemeAsset = NonNullable<StenoTheme["assets"]>[string];

async function hashContent(content: string | Uint8Array): Promise<string> {
  const bytes =
    typeof content === "string" ? new TextEncoder().encode(content) : new Uint8Array(content);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 8);
}

function insertAssetHash(relPath: string, hash: string): string {
  const slashIndex = relPath.lastIndexOf("/");
  const dir = slashIndex === -1 ? "" : relPath.slice(0, slashIndex + 1);
  const fileName = slashIndex === -1 ? relPath : relPath.slice(slashIndex + 1);
  const dotIndex = fileName.lastIndexOf(".");
  return dotIndex === -1
    ? `${dir}${fileName}.${hash}`
    : `${dir}${fileName.slice(0, dotIndex)}.${hash}${fileName.slice(dotIndex)}`;
}

async function resolveAssetContent(
  relPath: string,
  source: ThemeAsset,
): Promise<string | Uint8Array> {
  if (typeof source === "string" || source instanceof Uint8Array) return source;

  const response = await fetch(source);
  if (!response.ok) {
    throw new Error(`Failed to fetch theme asset "${relPath}": ${source.href}`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

export async function copyThemeAssets(
  assets: StenoTheme["assets"],
  outputDir: string,
  occupiedPaths: Set<string>,
  hashAssets: boolean,
  minifyCssAssets: boolean,
): Promise<Record<string, string>> {
  const manifest: Record<string, string> = {};
  if (!assets) return manifest;
  const assetsDir = join(outputDir, "assets");
  const entries = Object.entries(assets).sort(([left], [right]) => left.localeCompare(right));
  const resolvedAssets = new Array<{
    relPath: string;
    destRelPath: string;
    content: string | Uint8Array;
  }>(entries.length);

  await mapWithConcurrency(
    entries.map((entry, index) => ({ entry, index })),
    ASSET_COPY_CONCURRENCY,
    async ({ entry: [relPath, source], index }) => {
      let content = await resolveAssetContent(relPath, source);
      if (minifyCssAssets && CSS_ASSET_PATTERN.test(relPath)) {
        const text = typeof content === "string" ? content : new TextDecoder().decode(content);
        content = minifyCss(text);
      }
      const destRelPath =
        hashAssets && HASHABLE_ASSET_PATTERN.test(relPath)
          ? insertAssetHash(relPath, await hashContent(content))
          : relPath;
      resolvedAssets[index] = { relPath, destRelPath, content };
    },
  );

  const writeJobs: Array<{ destPath: string; content: string | Uint8Array }> = [];
  for (const { relPath, destRelPath, content } of resolvedAssets) {
    const destPath = join(assetsDir, destRelPath);
    const normalizedDestPath = resolve(destPath);
    if (occupiedPaths.has(normalizedDestPath)) {
      throw new Error(`Output collision: theme asset "${relPath}" would overwrite "${destPath}".`);
    }
    occupiedPaths.add(normalizedDestPath);
    ensureParentDirSync(destPath);
    manifest[relPath] = destRelPath;
    writeJobs.push({ destPath, content });
  }

  await mapWithConcurrency(writeJobs, ASSET_COPY_CONCURRENCY, async ({ destPath, content }) => {
    if (typeof content === "string") await Deno.writeTextFile(destPath, content);
    else await Deno.writeFile(destPath, content);
  });

  return manifest;
}
