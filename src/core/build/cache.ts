import { join } from "@std/path";
import type { BuildStateEntry } from "./context.ts";
import { ensureParentDirSync } from "../../utils/fs.ts";
import { STENO_DIR } from "../path_utils.ts";

export interface PersistentBuildCache {
  version: 1;
  signature: string;
  pages: Array<{
    fullPath: string;
    relPath: string;
    outputPath: string;
    sourceText: string;
    body?: string;
    htmlContent?: string;
    assetsSignature?: string;
  }>;
}

export function resolveCachePath(contentDir: string): string {
  return join(contentDir, STENO_DIR, "build-cache.json");
}

function resolveRelPath(page: { fullPath: string; relPath?: unknown }): string {
  return typeof page.relPath === "string" ? page.relPath : page.fullPath;
}

export async function loadPersistentBuildCache(
  cachePath: string,
): Promise<PersistentBuildCache | null> {
  let raw: string;
  try {
    raw = await Deno.readTextFile(cachePath);
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
      body?: unknown;
      htmlContent?: unknown;
      assetsSignature?: unknown;
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
      relPath: resolveRelPath({
        fullPath: typedEntry.fullPath,
        relPath: typedEntry.relPath,
      }),
      outputPath: typedEntry.outputPath,
      sourceText: typedEntry.sourceText,
      body: typeof typedEntry.body === "string" ? typedEntry.body : undefined,
      htmlContent: typeof typedEntry.htmlContent === "string" ? typedEntry.htmlContent : undefined,
      assetsSignature: typeof typedEntry.assetsSignature === "string"
        ? typedEntry.assetsSignature
        : undefined,
    });
  }

  return { version: 1, signature: cache.signature, pages };
}

export function toBuildStatePageMap(
  pages: PersistentBuildCache["pages"],
): Map<string, BuildStateEntry> {
  const pageMap = new Map<string, BuildStateEntry>();
  for (const page of pages) {
    pageMap.set(page.fullPath, {
      relPath: resolveRelPath(page),
      outputPath: page.outputPath,
      sourceText: page.sourceText,
      body: page.body,
      htmlContent: page.htmlContent,
      assetsSignature: page.assetsSignature,
    });
  }
  return pageMap;
}

export async function savePersistentBuildCache(
  cachePath: string,
  signature: string,
  pages: Map<string, BuildStateEntry>,
): Promise<void> {
  ensureParentDirSync(cachePath);
  const payload: PersistentBuildCache = {
    version: 1,
    signature,
    pages: [...pages.entries()].map(([fullPath, page]) => ({
      fullPath,
      relPath: page.relPath,
      outputPath: page.outputPath,
      sourceText: page.sourceText,
      body: page.body,
      htmlContent: page.htmlContent,
      assetsSignature: page.assetsSignature,
    })),
  };
  await Deno.writeTextFile(cachePath, JSON.stringify(payload));
}
