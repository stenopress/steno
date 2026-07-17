import { dirname, join } from "@std/path";
import { marked } from "marked";
import {
  buildCollections,
  collectMarkdownFilePaths,
  collectMarkdownPages,
  type MarkdownFilePath,
  type MarkdownPage,
} from "./collections.ts";
import { runAstTransforms, runHtmlTransforms } from "../plugins/plugins.ts";
import { ensureDirSync } from "../utils/fileUtils.ts";
import type { SiteConfig, StenoHooks, StenoPlugin } from "../types.ts";
import type { Theme } from "../theme/theme.ts";
import { getNativeBuildInfo, performBuild } from "./native.ts";
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
  pages?: MarkdownPage[];
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
    body?: string;
    htmlContent?: string;
  }>;
}

let portableEngineNoticeShown = false;

function getPublicEnvVars(): Record<string, string> {
  const publicVars: Record<string, string> = {};
  try {
    for (const [key, value] of Object.entries(Deno.env.toObject())) {
      if (key.startsWith("PUBLIC_")) {
        publicVars[key] = value;
      }
    }
  } catch (_error) {
    // Environment access is optional for permission-restricted builds.
  }
  return publicVars;
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
    if (error instanceof Deno.errors.NotFound) return false;
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
  try {
    const raw = Deno.readTextFileSync(cachePath);
    return JSON.parse(raw) as PersistentBuildCache;
  } catch {
    return null;
  }
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

function canUseNativeOutput(context: BuildContext): boolean {
  return !context.theme &&
    !context.hooks.afterPage &&
    context.plugins.every((plugin) =>
      !plugin.transformAst && !plugin.transformHtml && !plugin.afterPage
    );
}

async function finishNativeBuild(
  context: BuildContext,
  cachePath: string,
  buildSignature: string,
): Promise<void> {
  const cache = loadPersistentBuildCache(cachePath);
  if (!cache || cache.signature !== buildSignature) {
    throw new Error("Rust cache signature mismatch or missing!");
  }

  if (context.state) {
    context.state.signature = buildSignature;
    context.state.pages.clear();
    for (const page of cache.pages) {
      context.state.pages.set(page.fullPath, {
        relPath: page.relPath,
        outputPath: page.outputPath,
        sourceText: page.sourceText,
        body: page.body,
        htmlContent: page.htmlContent,
      });
    }
  }

  for (const plugin of context.plugins) {
    await plugin.afterBuild?.(context.config);
  }
  await context.hooks.afterBuild?.(context.config);
  console.log("Build complete (Rust Engine).");
}

export async function buildSite(context: BuildContext): Promise<void> {
  const { config, theme, plugins, hooks, pages, dev } = context;

  // 1. Setup & Pre-build
  for (const plugin of plugins) await plugin.beforeBuild?.(config);
  await hooks.beforeBuild?.(config);

  const contentDir = config.contentDir || "content";
  const scanOptions = {
    ignorePaths: resolveMarkdownScanIgnorePaths(
      contentDir,
      config.output || "dist",
    ),
  };
  const nativeInfo = getNativeBuildInfo();
  const nativeOutput = nativeInfo.available && canUseNativeOutput(context);
  const scannedPages: MarkdownPage[] | MarkdownFilePath[] = pages ??
    (nativeInfo.available && nativeOutput
      ? await collectMarkdownFilePaths(contentDir, scanOptions)
      : await collectMarkdownPages(contentDir, scanOptions));

  if (!nativeInfo.available) {
    if (!portableEngineNoticeShown) {
      portableEngineNoticeShown = true;
      console.log(
        `Native acceleration unavailable for ${nativeInfo.target}; using the portable Deno engine.`,
      );
    }
    await runTypeScriptLoop(context, scannedPages as MarkdownPage[]);
    return;
  }

  // 2. Load old cache BEFORE Rust overwrites it (for change detection)
  const cachePath = resolveCachePath(config.contentDir || "content");
  const oldCache = loadPersistentBuildCache(cachePath);
  const oldSignature = oldCache?.signature;

  // 3. Always use Rust for markdown→HTML conversion (parallel + fast)
  const buildSignature = createBuildSignature(config, theme, plugins);
  const signatureChanged = !!(oldSignature && oldSignature !== buildSignature);
  const manifest = {
    config: config as unknown as Record<string, unknown>,
    pages: scannedPages.map((p) => ({
      fullPath: p.fullPath,
      relPath: p.relPath,
    })),
    signature: buildSignature,
  };

  if (!performBuild(manifest, dev ?? false, cachePath)) {
    throw new Error(
      `Rust native build failed while processing: ${
        manifest.pages.map((page) => page.fullPath).join(", ")
      }`,
    );
  }
  console.log("Markdown→HTML conversion complete (Rust Engine).");

  if (nativeOutput) {
    await finishNativeBuild(context, cachePath, buildSignature);
    return;
  }

  // 4. TypeScript handles complex features (drafts, themes, plugins, hooks)
  await runTypeScriptThemeAndPluginLoop(
    context,
    scannedPages as MarkdownPage[],
    buildSignature,
    oldCache,
    signatureChanged,
  );
}

// Full original loop logic encapsulated
async function runTypeScriptLoop(
  context: BuildContext,
  scannedPages: MarkdownPage[],
) {
  const { config, theme, plugins, hooks, state, dev } = context;
  const contentDir = config.contentDir || "content";
  const outputDir = config.output || "dist";
  const data = loadDataFiles(contentDir);
  const globalVars = resolveConfigGlobals(config);
  const publicEnv = getPublicEnvVars();
  const shortUrls = config.custom?.shortUrls ?? false;
  const cachePath = resolveCachePath(contentDir);
  const buildSignature = createBuildSignature(config, theme, plugins);
  const usingInMemoryState = state?.signature === buildSignature;
  const previousPages = new Map<string, BuildStateEntry>();

  if (usingInMemoryState) {
    for (const [fullPath, page] of state!.pages.entries()) {
      previousPages.set(fullPath, page);
    }
  } else {
    const diskCache = loadPersistentBuildCache(cachePath);
    if (diskCache?.signature === buildSignature) {
      for (
        const [fullPath, page] of toBuildStatePageMap(diskCache.pages).entries()
      ) previousPages.set(fullPath, page);
    }
  }

  const siteCollections = await buildCollections(
    contentDir,
    config,
    plugins,
    scannedPages,
  );
  const nextPages = new Map<string, BuildStateEntry>();
  ensureDirSync(outputDir);

  const currentPagePaths = new Set(scannedPages.map((p) => p.fullPath));
  for (const [fullPath, cached] of previousPages.entries()) {
    if (!currentPagePaths.has(fullPath) && fileExists(cached.outputPath)) {
      Deno.removeSync(cached.outputPath);
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
      cachedPage.sourceText !== page.sourceText || !fileExists(outputFilePath);

    if (page.frontmatter.draft === true && !dev) continue;

    let htmlContent: string | undefined;

    if (needsRender) {
      htmlContent = (cachedPage && cachedPage.body === page.body)
        ? cachedPage.htmlContent
        : undefined;
      if (htmlContent === undefined) {
        let tokens = marked.lexer(page.body);
        tokens = await runAstTransforms(tokens, plugins);
        htmlContent = await runHtmlTransforms(marked.parser(tokens), plugins);
      }

      ensureDirSync(dirname(outputFilePath));
      const renderedContent = theme
        ? theme.renderLayout(
          page.frontmatter.layout as string ?? "layout",
          htmlContent!,
          {
            ...globalVars,
            ...publicEnv,
            env: publicEnv,
            globals: globalVars,
            site: { ...config },
            theme: {
              name: theme.name,
              version: theme.version,
              ...theme.config,
            },
            collections: siteCollections,
            data,
            title: page.frontmatter.title || page.title || config.title,
            ...page.frontmatter,
          },
        )
        : htmlContent!;

      Deno.writeTextFileSync(outputFilePath, renderedContent);
      await hooks.afterPage?.({ path: outputFilePath, html: renderedContent });
      for (const p of plugins) {
        await p.afterPage?.({ path: outputFilePath, html: renderedContent });
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

  if (theme) await theme.copyAssets(outputDir);
  for (const p of plugins) await p.afterBuild?.(config);
  await hooks.afterBuild?.(config);

  if (state) {
    state.signature = buildSignature;
    state.pages.clear();
    for (const [full, page] of nextPages) state.pages.set(full, page);
  }
  savePersistentBuildCache(cachePath, buildSignature, nextPages);
  console.log("Build complete (TypeScript Engine).");
}

// New loop that uses Rust-built cache
async function runTypeScriptThemeAndPluginLoop(
  context: BuildContext,
  scannedPages: MarkdownPage[],
  rustBuildSignature: string,
  oldCache: PersistentBuildCache | null,
  signatureChanged: boolean,
) {
  const { config, theme, plugins, hooks, state, dev } = context;
  const contentDir = config.contentDir || "content";
  const outputDir = config.output || "dist";
  const data = loadDataFiles(contentDir);
  const globalVars = resolveConfigGlobals(config);
  const publicEnv = getPublicEnvVars();
  const shortUrls = config.custom?.shortUrls ?? false;
  const cachePath = resolveCachePath(contentDir);

  // Load the Rust-built cache
  const rustCache = loadPersistentBuildCache(cachePath);
  if (!rustCache || rustCache.signature !== rustBuildSignature) {
    throw new Error("Rust cache signature mismatch or missing!");
  }

  const rustCacheByPath = new Map(
    rustCache.pages.map((p) => [p.fullPath, p] as const),
  );

  // Load previous cache to detect which pages changed
  const previousPages = new Map<string, BuildStateEntry>();

  // First try in-memory state
  if (state?.signature === rustBuildSignature && state?.pages) {
    for (const [fullPath, page] of state.pages.entries()) {
      previousPages.set(fullPath, page);
    }
  } else if (oldCache) {
    // Fall back to old disk cache to detect changes across process boundaries
    for (const cacheEntry of oldCache.pages) {
      previousPages.set(cacheEntry.fullPath, {
        relPath: cacheEntry.relPath,
        outputPath: cacheEntry.outputPath,
        sourceText: cacheEntry.sourceText,
        body: cacheEntry.body || "",
        htmlContent: cacheEntry.htmlContent || "",
      });
    }
  }

  const siteCollections = await buildCollections(
    contentDir,
    config,
    plugins,
    scannedPages,
  );
  const nextPages = new Map<string, BuildStateEntry>();
  ensureDirSync(outputDir);

  const currentPagePaths = new Set(scannedPages.map((p) => p.fullPath));

  // Delete pages that are drafts in production (regardless of old cache)
  for (const [_fullPath, rustEntry] of rustCacheByPath) {
    const page = scannedPages.find((p) => p.fullPath === _fullPath);
    const isDraft = page?.frontmatter.draft === true;
    const shouldSkipInProduction = isDraft && !dev;

    if (shouldSkipInProduction && fileExists(rustEntry.outputPath)) {
      Deno.removeSync(rustEntry.outputPath);
    }
  }

  // Also delete pages that existed in old cache but no longer exist in source
  if (oldCache) {
    for (const oldEntry of oldCache.pages) {
      if (!currentPagePaths.has(oldEntry.fullPath)) {
        if (fileExists(oldEntry.outputPath)) {
          Deno.removeSync(oldEntry.outputPath);
        }
      }
    }
  }

  for (const page of scannedPages) {
    const outputFilePath = resolveOutputPath(
      outputDir,
      page.relPath,
      shortUrls,
    );

    // Skip drafts in production
    if (page.frontmatter.draft === true && !dev) continue;

    const rustEntry = rustCacheByPath.get(page.fullPath);
    if (!rustEntry) {
      throw new Error(`Rust cache missing page: ${page.fullPath}`);
    }

    // Detect if page changed: either content changed OR build signature changed (theme/plugins)
    const previousPage = previousPages.get(page.fullPath);
    const pageContentChanged = !previousPage ||
      previousPage.sourceText !== rustEntry.sourceText;
    const shouldCallHooks = pageContentChanged || signatureChanged;

    let htmlContent = rustEntry.htmlContent || "";

    // Apply plugin transforms if needed
    const hasAstOrHtmlTransforms = plugins.some(
      (p) => p.transformAst || p.transformHtml,
    );
    if (hasAstOrHtmlTransforms && rustEntry.body) {
      let tokens = marked.lexer(rustEntry.body);
      tokens = await runAstTransforms(tokens, plugins);
      htmlContent = await runHtmlTransforms(marked.parser(tokens), plugins);
    }

    ensureDirSync(dirname(outputFilePath));
    const renderedContent = theme
      ? theme.renderLayout(
        page.frontmatter.layout as string ?? "layout",
        htmlContent,
        {
          ...globalVars,
          ...publicEnv,
          env: publicEnv,
          globals: globalVars,
          site: { ...config },
          theme: {
            name: theme.name,
            version: theme.version,
            ...theme.config,
          },
          collections: siteCollections,
          data,
          title: page.frontmatter.title || page.title || config.title,
          ...page.frontmatter,
        },
      )
      : htmlContent;

    // Always write the file (could have theme/plugin changes)
    Deno.writeTextFileSync(outputFilePath, renderedContent);

    // Only call hooks if page actually changed
    if (shouldCallHooks) {
      await hooks.afterPage?.({ path: outputFilePath, html: renderedContent });
      for (const p of plugins) {
        await p.afterPage?.({ path: outputFilePath, html: renderedContent });
      }
    }

    nextPages.set(page.fullPath, {
      relPath: page.relPath,
      outputPath: outputFilePath,
      sourceText: rustEntry.sourceText,
      body: rustEntry.body || "",
      htmlContent,
    });
  }

  if (theme) await theme.copyAssets(outputDir);
  for (const p of plugins) await p.afterBuild?.(config);
  await hooks.afterBuild?.(config);

  if (state) {
    state.signature = rustBuildSignature;
    state.pages.clear();
    for (const [full, page] of nextPages) state.pages.set(full, page);
  }

  // Save updated cache for next build
  savePersistentBuildCache(cachePath, rustBuildSignature, nextPages);
  console.log("Theme & plugins applied. Build complete.");
}
