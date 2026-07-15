import { dirname, join } from "@std/path";
import { marked } from "marked";
import type { CollectionMap } from "./collections.ts";
import { buildCollections, collectMarkdownPages } from "./collections.ts";
import { runAstTransforms, runHtmlTransforms } from "../plugins/plugins.ts";
import { ensureDirSync } from "../utils/fileUtils.ts";
import type { SiteConfig, StenoHooks, StenoPlugin } from "../types.ts";
import { Theme } from "../theme/theme.ts";
import {
  resolveMarkdownScanIgnorePaths,
  resolveOutputPath,
} from "./path_utils.ts";
import { loadDataFiles } from "./data.ts";

type BuildContext = {
  config: SiteConfig;
  theme?: Theme;
  plugins: StenoPlugin[];
  hooks: StenoHooks;
  state?: BuildState;
  pages?: import("./collections.ts").MarkdownPage[];
  dev?: boolean;
};

export interface BuildState {
  signature: string | null;
  pages: Map<string, BuildStateEntry>;
}

export interface BuildStateEntry {
  relPath: string;
  outputPath: string;
  sourceText: string;
  body?: string;
  htmlContent?: string;
}

interface PersistentBuildCache {
  version: 1;
  signature: string;
  pages: Array<{
    fullPath: string;
    relPath: string;
    outputPath: string;
    sourceText: string;
  }>;
}

function resolveConfigGlobals(config: SiteConfig): Record<string, unknown> {
  const globals = config.custom?.globals;
  if (globals === undefined) return {};
  if (!globals || typeof globals !== "object" || Array.isArray(globals)) {
    throw new Error("Invalid `custom.globals` in config: expected an object.");
  }
  return globals;
}

function fileExists(filePath: string): boolean {
  try {
    return Deno.statSync(filePath).isFile;
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      return false;
    }
    throw error;
  }
}

function createBuildSignature(
  config: SiteConfig,
  theme?: Theme,
  plugins: StenoPlugin[] = [],
): string {
  const pluginSignature = plugins.map((plugin) => ({
    name: plugin.name,
    transformAst: plugin.transformAst?.toString() ?? null,
    transformHtml: plugin.transformHtml?.toString() ?? null,
    beforeBuild: plugin.beforeBuild?.toString() ?? null,
    afterPage: plugin.afterPage?.toString() ?? null,
    afterBuild: plugin.afterBuild?.toString() ?? null,
  }));

  return JSON.stringify({
    config,
    theme: theme ? theme.getBuildSignatureData() : null,
    plugins: pluginSignature,
  });
}

function resolveCachePath(contentDir: string): string {
  return join(contentDir, ".steno", "build-cache.json");
}

function loadPersistentBuildCache(
  cachePath: string,
): PersistentBuildCache | null {
  let raw: string;
  try {
    raw = Deno.readTextFileSync(cachePath);
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      return null;
    }
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

  return {
    version: 1,
    signature: cache.signature,
    pages,
  };
}

function toBuildStatePageMap(
  pages: PersistentBuildCache["pages"],
): Map<string, BuildStateEntry> {
  const pageMap = new Map<string, BuildStateEntry>();
  for (const page of pages) {
    pageMap.set(page.fullPath, {
      relPath: page.relPath,
      outputPath: page.outputPath,
      sourceText: page.sourceText,
    });
  }
  return pageMap;
}

function savePersistentBuildCache(
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

export async function buildSite({
  config,
  theme,
  plugins,
  hooks,
  state,
  pages,
  dev = false,
}: BuildContext): Promise<void> {
  for (const plugin of plugins) {
    await plugin.beforeBuild?.(config);
  }
  await hooks.beforeBuild?.(config);

  const contentDir = config.contentDir || "content";
  const outputDir = config.output || "dist";
  const data = loadDataFiles(contentDir);
  const globalVars = resolveConfigGlobals(config);
  const shortUrls = config.custom?.shortUrls ?? false;
  const cachePath = resolveCachePath(contentDir);
  const scannedPages = pages ?? await collectMarkdownPages(
    contentDir,
    { ignorePaths: resolveMarkdownScanIgnorePaths(contentDir, outputDir) },
  );
  const buildSignature = createBuildSignature(config, theme, plugins);
  const usingInMemoryState = state?.signature === buildSignature;
  const previousPages = new Map<string, BuildStateEntry>();
  if (usingInMemoryState) {
    for (const [fullPath, page] of state.pages.entries()) {
      previousPages.set(fullPath, page);
    }
  } else {
    const diskCache = loadPersistentBuildCache(cachePath);
    if (diskCache && diskCache.signature === buildSignature) {
      for (
        const [fullPath, page] of toBuildStatePageMap(diskCache.pages).entries()
      ) {
        previousPages.set(fullPath, page);
      }
    }
  }
  let collections: CollectionMap | undefined;
  const getCollections = async (): Promise<CollectionMap> => {
    if (collections) return collections;
    collections = await buildCollections(
      contentDir,
      config,
      plugins,
      scannedPages,
    );
    return collections;
  };
  const nextPages = new Map<string, BuildStateEntry>();
  ensureDirSync(outputDir);

  const currentPagePaths = new Set(scannedPages.map((page) => page.fullPath));
  for (const [fullPath, cachedPage] of previousPages.entries()) {
    if (!currentPagePaths.has(fullPath) && fileExists(cachedPage.outputPath)) {
      Deno.removeSync(cachedPage.outputPath);
    }
  }

  for (const page of scannedPages) {
    const outputFilePath = resolveOutputPath(
      outputDir,
      page.relPath,
      shortUrls,
    );
    const cachedPage = previousPages.get(page.fullPath);
    const needsRender = !cachedPage ||
      cachedPage.sourceText !== page.sourceText ||
      cachedPage.outputPath !== outputFilePath ||
      !fileExists(outputFilePath);

    if (page.frontmatter.draft === true && !dev) {
      continue;
    }

    let htmlContent: string | undefined;
    if (needsRender) {
      htmlContent = cachedPage?.body === page.body &&
          typeof cachedPage.htmlContent === "string"
        ? cachedPage.htmlContent
        : undefined;
      if (htmlContent === undefined) {
        let tokens = marked.lexer(page.body);
        tokens = await runAstTransforms(tokens, plugins);
        const parsedHtmlContent = marked.parser(tokens);
        htmlContent = await runHtmlTransforms(parsedHtmlContent, plugins);
      }
      const finalHtmlContent = htmlContent;

      ensureDirSync(dirname(outputFilePath));

      const layoutName = typeof page.frontmatter.layout === "string"
        ? page.frontmatter.layout
        : "layout";

      const renderedContent = theme
        ? theme.renderLayout(layoutName, finalHtmlContent, {
          ...globalVars,
          globals: globalVars,
          site: { ...config },
          theme: {
            name: theme.name,
            version: theme.version,
            ...theme.config,
          },
          collections: await getCollections(),
          data,
          title: page.frontmatter.title || page.title || config.title,
          ...page.frontmatter,
        })
        : finalHtmlContent;

      Deno.writeTextFileSync(outputFilePath, renderedContent);

      await hooks.afterPage?.({
        path: outputFilePath,
        html: renderedContent,
      });
      for (const plugin of plugins) {
        await plugin.afterPage?.({
          path: outputFilePath,
          html: renderedContent,
        });
      }
    }

    nextPages.set(page.fullPath, {
      relPath: page.relPath,
      outputPath: outputFilePath,
      sourceText: page.sourceText,
      body: page.body,
      htmlContent: needsRender ? htmlContent : cachedPage?.htmlContent,
    });
  }

  if (theme) {
    await theme.copyAssets(outputDir);
  }

  for (const plugin of plugins) {
    await plugin.afterBuild?.(config);
  }

  await hooks.afterBuild?.(config);

  if (state) {
    state.signature = buildSignature;
    state.pages.clear();
    for (const [fullPath, cachedPage] of nextPages.entries()) {
      state.pages.set(fullPath, cachedPage);
    }
  }
  savePersistentBuildCache(cachePath, buildSignature, nextPages);

  console.log("Build complete.");
}
