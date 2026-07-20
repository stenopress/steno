import { dirname, resolve } from "@std/path";
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
import type { SiteConfig } from "../../types.ts";
import {
  beginOutputTransaction,
  commitOutputTransaction,
  rollbackOutputTransaction,
} from "./output_transaction.ts";

export type { BuildContext, BuildState, BuildStateEntry } from "./context.ts";
const STAGING_COPY_CONCURRENCY = 128;

function fileExists(filePath: string): boolean {
  try {
    return Deno.statSync(filePath).isFile;
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return false;
    throw error;
  }
}

async function copyFilesToStaging(
  files: Array<{ source: string; destination: string }>,
): Promise<void> {
  let nextIndex = 0;
  const workerCount = Math.min(STAGING_COPY_CONCURRENCY, files.length);
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (true) {
        const index = nextIndex++;
        if (index >= files.length) return;
        const file = files[index];
        await Deno.copyFile(file.source, file.destination);
      }
    }),
  );
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
  const contentDir = config.contentDir || "content";
  const transaction = beginOutputTransaction(config.output || "dist");
  const outputDir = transaction.outputDir;
  const stagingDir = transaction.stagingDir;
  const stagedConfig: SiteConfig = { ...config, output: stagingDir };
  let committed = false;

  try {
    for (const plugin of plugins) await plugin.beforeBuild?.(stagedConfig);
    await hooks.beforeBuild?.(stagedConfig);

    const data = loadDataFiles(contentDir);
    const globalVars = resolveConfigGlobals(config);
    const publicEnv = getPublicEnvVars();
    const shortUrls = config.custom?.shortUrls ?? false;
    const cachePath = resolveCachePath(contentDir);

    const scannedPages = pages ?? await collectMarkdownPages(contentDir, {
      ignorePaths: resolveMarkdownScanIgnorePaths(contentDir, outputDir),
    });

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

    const activePages = scannedPages.filter((page) =>
      page.frontmatter.draft !== true || dev
    );
    const canSkipUnchangedBuild = theme === undefined &&
      plugins.length === 0 &&
      hooks.beforeBuild === undefined &&
      hooks.afterPage === undefined &&
      hooks.afterBuild === undefined &&
      Object.keys(data).length === 0 &&
      Object.keys(publicEnv).length === 0 &&
      !config.redirects &&
      activePages.every((page) => !page.body.includes("{@include")) &&
      previousPages.size === activePages.length &&
      activePages.every((page) => {
        const cached = previousPages.get(page.fullPath);
        const expectedOutput = resolveOutputPath(
          outputDir,
          page.relPath,
          shortUrls,
        );
        return cached?.sourceText === page.sourceText &&
          cached.outputPath === expectedOutput &&
          fileExists(expectedOutput);
      });

    if (canSkipUnchangedBuild) {
      rollbackOutputTransaction(transaction);
      committed = true;
      buildComplete(0);
      return;
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
    const occupiedPaths = new Set<string>();
    const unchangedFiles: Array<{ source: string; destination: string }> = [];

    const fireAfterPage = async (
      finalPath: string,
      stagingPath: string,
      html: string,
    ) => {
      await hooks.afterPage?.({
        path: finalPath,
        stagingPath,
        html,
      });
      for (const plugin of plugins) {
        await plugin.afterPage?.({
          path: stagingPath,
          finalPath,
          html,
        });
      }
    };

    for (const page of scannedPages) {
      if (page.frontmatter.draft === true && !dev) continue;

      const outputFilePath = resolveOutputPath(
        outputDir,
        page.relPath,
        shortUrls,
      );
      const stagedOutputFilePath = resolveOutputPath(
        stagingDir,
        page.relPath,
        shortUrls,
      );
      const normalizedStagedPath = resolve(stagedOutputFilePath);
      if (occupiedPaths.has(normalizedStagedPath)) {
        throw new Error(
          `Output collision: multiple pages resolve to "${outputFilePath}".`,
        );
      }
      occupiedPaths.add(normalizedStagedPath);

      const cachedPage = previousPages.get(page.fullPath);
      const processedBody = processIncludes(
        page.body,
        page.fullPath,
        contentDir,
      );

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

        ensureDirSync(dirname(stagedOutputFilePath));
        Deno.writeTextFileSync(stagedOutputFilePath, renderedContent);
        await fireAfterPage(
          outputFilePath,
          stagedOutputFilePath,
          renderedContent,
        );
      } else {
        ensureDirSync(dirname(stagedOutputFilePath));
        unchangedFiles.push({
          source: outputFilePath,
          destination: stagedOutputFilePath,
        });
      }

      nextPages.set(page.fullPath, {
        relPath: page.relPath,
        outputPath: outputFilePath,
        sourceText: page.sourceText,
        body: processedBody,
        htmlContent: needsRender ? htmlContent : cachedPage?.htmlContent,
      });
    }
    await copyFilesToStaging(unchangedFiles);

    if (theme) await theme.copyAssets(stagingDir, occupiedPaths);

    if (config.redirects && Object.keys(config.redirects).length > 0) {
      buildRedirects(
        stagingDir,
        config.redirects,
        shortUrls,
        occupiedPaths,
      );
    }

    for (const plugin of plugins) await plugin.afterBuild?.(stagedConfig);
    await hooks.afterBuild?.(stagedConfig);

    commitOutputTransaction(transaction);
    committed = true;

    if (state) {
      state.signature = buildSignature;
      state.pages.clear();
      for (const [k, v] of nextPages) state.pages.set(k, v);
    }

    try {
      savePersistentBuildCache(cachePath, buildSignature, nextPages);
    } catch (error) {
      console.warn(
        `Build committed, but failed to save cache: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    buildComplete(
      [...nextPages.values()].filter((p) => p.htmlContent !== undefined).length,
    );
  } finally {
    if (!committed) rollbackOutputTransaction(transaction);
  }
}
