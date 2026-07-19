import { dirname, join } from "@std/path";
import { ensureDirSync } from "../../utils/fileUtils.ts";
import type { BuildStateEntry } from "./context.ts";

export interface PersistentBuildCache {
  version: 1;
  signature: string;
  pages: Array<{
    fullPath: string;
    relPath: string;
    outputPath: string;
    sourceText: string;
  }>;
}

export function resolveCachePath(contentDir: string): string {
  return join(contentDir, ".steno", "build-cache.json");
}

export function loadPersistentBuildCache(
  cachePath: string,
): PersistentBuildCache | null {
  let raw: string;
  try {
    raw = Deno.readTextFileSync(cachePath);
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return null;
    throw error;
  }

  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object") {
    throw new Error(`Invalid build cache file at "${cachePath}".`);
  }

  const cache = parsed as {
    version?: unknown;
    signature?: unknown;
    pages?: unknown;
  };

  if (cache.version !== 1 || typeof cache.signature !== "string") {
    throw new Error(`Invalid build cache metadata at "${cachePath}".`);
  }

  if (!Array.isArray(cache.pages)) {
    throw new Error(`Invalid build cache pages at "${cachePath}".`);
  }

  const pages: PersistentBuildCache["pages"] = [];
  for (const entry of cache.pages) {
    if (!entry || typeof entry !== "object") {
      throw new Error(`Invalid build cache page entry at "${cachePath}".`);
    }

    const typedEntry = entry as {
      fullPath?: unknown;
      relPath?: unknown;
      outputPath?: unknown;
      sourceText?: unknown;
    };

    if (
      typeof typedEntry.fullPath !== "string" ||
      typeof typedEntry.outputPath !== "string" ||
      typeof typedEntry.sourceText !== "string"
    ) {
      throw new Error(`Invalid build cache page fields at "${cachePath}".`);
    }

    pages.push({
      fullPath: typedEntry.fullPath,
      relPath: typeof typedEntry.relPath === "string"
        ? typedEntry.relPath
        : typedEntry.fullPath,
      outputPath: typedEntry.outputPath,
      sourceText: typedEntry.sourceText,
    });
  }

  return { version: 1, signature: cache.signature, pages };
}

export function toBuildStatePageMap(
  pages: PersistentBuildCache["pages"],
): Map<string, BuildStateEntry> {
  const pageMap = new Map<string, BuildStateEntry>();
  for (const page of pages) {
    const relPath = typeof page.relPath === "string"
      ? page.relPath
      : page.fullPath;
    pageMap.set(page.fullPath, {
      relPath,
      outputPath: page.outputPath,
      sourceText: page.sourceText,
    });
  }
  return pageMap;
}

export function savePersistentBuildCache(
  cachePath: string,
  signature: string,
  pages: Map<string, BuildStateEntry>,
): void {
  ensureDirSync(dirname(cachePath));
  const payload: PersistentBuildCache = {
    version: 1,
    signature,
    pages: [...pages.entries()].map(([fullPath, page]) => ({
      fullPath,
      relPath: page.relPath,
      outputPath: page.outputPath,
      sourceText: page.sourceText,
    })),
  };
  Deno.writeTextFileSync(cachePath, JSON.stringify(payload));
}
