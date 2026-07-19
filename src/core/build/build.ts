import { dirname } from "@std/path";
import { marked } from "marked";
import type { CollectionMap } from "../collections.ts";
import { buildCollections, collectMarkdownPages } from "../collections.ts";
import { runAstTransforms, runHtmlTransforms } from "../../plugins/plugins.ts";
import { ensureDirSync } from "../../utils/fileUtils.ts";
import { processIncludes } from "../includes.ts";
import { buildRedirects } from "../redirects.ts";
import { loadDataFiles } from "../data.ts";
import { buildComplete } from "../../utils/output.ts";
import {
  resolveMarkdownScanIgnorePaths,
  resolveOutputPath,
} from "../path_utils.ts";
import type { BuildContext, BuildStateEntry } from "./context.ts";
import {
  loadPersistentBuildCache,
  resolveCachePath,
  savePersistentBuildCache,
  toBuildStatePageMap,
} from "./cache.ts";
import { createBuildSignature } from "./signature.ts";
import { getPublicEnvVars, resolveConfigGlobals } from "./env.ts";

export type { BuildContext, BuildState, BuildStateEntry } from "./context.ts";

function fileExists(filePath: string): boolean {
  try {
    return Deno.statSync(filePath).isFile;
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return false;
    throw error;
  }
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
  // ── lifecycle: beforeBuild ────────────────────────────────────────
  for (const plugin of plugins) await plugin.beforeBuild?.(config);
  await hooks.beforeBuild?.(config);

  // ── setup ─────────────────────────────────────────────────────────
  const contentDir = config.contentDir || "content";
  const outputDir = config.output || "dist";
  const data = loadDataFiles(contentDir);
  const globalVars = resolveConfigGlobals(config);
  const publicEnv = getPublicEnvVars();
  const shortUrls = config.custom?.shortUrls ?? false;
  const cachePath = resolveCachePath(contentDir);

  const scannedPages = pages ?? await collectMarkdownPages(contentDir, {
    ignorePaths: resolveMarkdownScanIgnorePaths(contentDir, outputDir),
  });

  // ── cache resolution ──────────────────────────────────────────────
  const buildSignature = createBuildSignature(config, theme, plugins);
  const previousPages = new Map<string, BuildStateEntry>();

  if (state?.signature === buildSignature) {
    for (const [k, v] of state.pages) previousPages.set(k, v);
  } else {
    const diskCache = loadPersistentBuildCache(cachePath);
    if (diskCache?.signature === buildSignature) {
      for (const [k, v] of toBuildStatePageMap(diskCache.pages)) {
        previousPages.set(k, v);
      }
    }
  }

  // ── collections (lazy) ────────────────────────────────────────────
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

  // ── output dir + stale page cleanup ───────────────────────────────
  ensureDirSync(outputDir);
  const currentPagePaths = new Set(scannedPages.map((p) => p.fullPath));
  for (const [fullPath, cached] of previousPages) {
    if (!currentPagePaths.has(fullPath) && fileExists(cached.outputPath)) {
      Deno.removeSync(cached.outputPath);
    }
  }

  // ── page render loop ──────────────────────────────────────────────
  const nextPages = new Map<string, BuildStateEntry>();

  const fireAfterPage = async (path: string, html: string) => {
    await hooks.afterPage?.({ path, html });
    for (const plugin of plugins) await plugin.afterPage?.({ path, html });
  };

  for (const page of scannedPages) {
    if (page.frontmatter.draft === true && !dev) continue;

    const outputFilePath = resolveOutputPath(
      outputDir,
      page.relPath,
      shortUrls,
    );
    const cachedPage = previousPages.get(page.fullPath);
    const processedBody = processIncludes(page.body, page.fullPath, contentDir);

    const needsRender = !cachedPage ||
      cachedPage.sourceText !== page.sourceText ||
      cachedPage.outputPath !== outputFilePath ||
      !fileExists(outputFilePath);

    let htmlContent: string | undefined;

    if (needsRender) {
      htmlContent = cachedPage?.body === processedBody &&
          typeof cachedPage.htmlContent === "string"
        ? cachedPage.htmlContent
        : undefined;

      if (htmlContent === undefined) {
        let tokens = marked.lexer(processedBody);
        tokens = await runAstTransforms(tokens, plugins);
        htmlContent = await runHtmlTransforms(marked.parser(tokens), plugins);
      }

      ensureDirSync(dirname(outputFilePath));

      const layoutName = typeof page.frontmatter.layout === "string"
        ? page.frontmatter.layout
        : "layout";

      const pageContext = {
        ...globalVars,
        ...publicEnv,
        env: publicEnv,
        globals: globalVars,
        site: { ...config },
        theme: theme
          ? { name: theme.name, version: theme.version, ...theme.config }
          : undefined,
        collections: await getCollections(),
        data,
        title: page.frontmatter.title || page.title || config.title,
        ...page.frontmatter,
      };

      const renderedContent = theme
        ? theme.renderLayout(layoutName, htmlContent, pageContext)
        : htmlContent;

      Deno.writeTextFileSync(outputFilePath, renderedContent);
      await fireAfterPage(outputFilePath, renderedContent);
    }

    nextPages.set(page.fullPath, {
      relPath: page.relPath,
      outputPath: outputFilePath,
      sourceText: page.sourceText,
      body: processedBody,
      htmlContent: needsRender ? htmlContent : cachedPage?.htmlContent,
    });
  }

  // ── post-build ────────────────────────────────────────────────────
  if (theme) await theme.copyAssets(outputDir);

  for (const plugin of plugins) await plugin.afterBuild?.(config);

  if (config.redirects && Object.keys(config.redirects).length > 0) {
    buildRedirects(outputDir, config.redirects, shortUrls);
  }

  await hooks.afterBuild?.(config);

  // ── persist state ─────────────────────────────────────────────────
  if (state) {
    state.signature = buildSignature;
    state.pages.clear();
    for (const [k, v] of nextPages) state.pages.set(k, v);
  }

  savePersistentBuildCache(cachePath, buildSignature, nextPages);

  buildComplete(
    [...nextPages.values()].filter((p) => p.htmlContent !== undefined).length,
  );
}
