import { dirname, join, resolve } from "@std/path";
import { marked } from "marked";
import type { CollectionMap } from "../collections.ts";
import { buildCollections, collectMarkdownPages } from "../collections.ts";
import { runAstTransforms, runHtmlTransforms } from "../../plugins/plugins.ts";
import { processIncludes } from "../includes.ts";
import { buildRedirects } from "../redirects.ts";
import { loadDataFiles } from "../data.ts";
import { buildComplete } from "../../utils/output.ts";
import {
  resolveMarkdownScanIgnorePaths,
  resolvePageRoute,
  resolvePublicDir,
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
import { resolvePageConfigOverrides } from "../page_config.ts";
import { injectHeadTags, mergeHeadTags, validateHeadTags } from "../head.ts";
import { fileExistsSync as fileExists } from "../../utils/fs.ts";
import { resolveShortUrls } from "../config.ts";

export type { BuildContext, BuildState, BuildStateEntry } from "./context.ts";
const STAGING_COPY_CONCURRENCY = 128;
const PAGE_RENDER_CONCURRENCY = 16;

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapFn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workerCount = Math.min(concurrency, items.length);
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (true) {
        const index = nextIndex++;
        if (index >= items.length) return;
        results[index] = await mapFn(items[index]);
      }
    }),
  );
  return results;
}

async function copyFilesToStaging(
  files: Array<{ source: string; destination: string }>,
): Promise<void> {
  await mapWithConcurrency(
    files,
    STAGING_COPY_CONCURRENCY,
    (file) => Deno.copyFile(file.source, file.destination),
  );
}

async function collectFilesRecursively(
  dir: string,
  relPrefix = "",
): Promise<string[]> {
  const results: string[] = [];
  const entries: Deno.DirEntry[] = [];
  try {
    for await (const entry of Deno.readDir(dir)) entries.push(entry);
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return results;
    throw error;
  }

  for (const entry of entries) {
    const relPath = relPrefix ? `${relPrefix}/${entry.name}` : entry.name;
    if (entry.isDirectory) {
      results.push(
        ...(await collectFilesRecursively(join(dir, entry.name), relPath)),
      );
    } else if (entry.isFile) {
      results.push(relPath);
    }
  }
  return results;
}

async function copyPublicDir(
  publicDir: string,
  relPaths: string[],
  stagingDir: string,
  occupiedPaths: Set<string>,
): Promise<void> {
  const sortedRelPaths = [...relPaths].sort((a, b) => a.localeCompare(b));
  const jobs: Array<{ source: string; destination: string }> = [];

  for (const relPath of sortedRelPaths) {
    const destPath = join(stagingDir, relPath);
    const normalizedDestPath = resolve(destPath);
    if (occupiedPaths.has(normalizedDestPath)) {
      throw new Error(
        `Output collision: public asset "${relPath}" would overwrite "${destPath}".`,
      );
    }
    occupiedPaths.add(normalizedDestPath);
    Deno.mkdirSync(dirname(destPath), { recursive: true });
    jobs.push({ source: join(publicDir, relPath), destination: destPath });
  }

  await copyFilesToStaging(jobs);
}

export async function buildSite({
  config,
  theme,
  plugins,
  hooks,
  state,
  pages,
  dev = false,
  environment = {},
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

    const data = await loadDataFiles(contentDir);
    const globalVars = resolveConfigGlobals(config);
    const publicEnv = getPublicEnvVars(environment);
    const siteHead = config.head ? validateHeadTags(config.head) : [];
    const shortUrls = resolveShortUrls(config);
    const cachePath = resolveCachePath(contentDir);
    const publicDirPath = resolvePublicDir(contentDir, config.publicDir);
    const publicFiles = publicDirPath
      ? await collectFilesRecursively(publicDirPath)
      : [];

    const scannedPages = pages ?? await collectMarkdownPages(contentDir, {
      ignorePaths: resolveMarkdownScanIgnorePaths(
        contentDir,
        outputDir,
        publicDirPath,
      ),
    });

    const buildSignature = createBuildSignature(
      config,
      theme,
      plugins,
      data,
      publicEnv,
    );
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
    stagedConfig.pages = activePages.map((page) => ({
      slug: resolvePageRoute(page, shortUrls).outputPath,
      title: typeof page.frontmatter.title === "string"
        ? page.frontmatter.title
        : page.title,
      description: typeof page.frontmatter.description === "string"
        ? page.frontmatter.description
        : undefined,
      date: typeof page.frontmatter.date === "string" ||
          page.frontmatter.date instanceof Date
        ? page.frontmatter.date
        : undefined,
    }));
    const canSkipUnchangedBuild = theme === undefined &&
      plugins.length === 0 &&
      hooks.beforeBuild === undefined &&
      hooks.afterPage === undefined &&
      hooks.afterBuild === undefined &&
      Object.keys(data).length === 0 &&
      Object.keys(publicEnv).length === 0 &&
      publicFiles.length === 0 &&
      !config.redirects &&
      activePages.every((page) => !page.body.includes("{@include")) &&
      previousPages.size === activePages.length &&
      activePages.every((page) => {
        const cached = previousPages.get(page.fullPath);
        const expectedOutput = join(
          outputDir,
          resolvePageRoute(page, shortUrls).outputPath,
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

    const processedBodies = new Map<string, string>();
    const processedBodyResults = await mapWithConcurrency(
      scannedPages,
      STAGING_COPY_CONCURRENCY,
      async (page) => ({
        fullPath: page.fullPath,
        body: await processIncludes(page.body, page.fullPath, contentDir),
      }),
    );
    for (const { fullPath, body } of processedBodyResults) {
      processedBodies.set(fullPath, body);
    }

    const htmlCache = new Map<string, string>();
    for (const page of scannedPages) {
      const cachedPage = previousPages.get(page.fullPath);
      if (
        cachedPage &&
        cachedPage.body === processedBodies.get(page.fullPath) &&
        typeof cachedPage.htmlContent === "string"
      ) {
        htmlCache.set(page.fullPath, cachedPage.htmlContent);
      }
    }

    let collectionsPromise: Promise<CollectionMap> | undefined;
    const getCollections = (): Promise<CollectionMap> => {
      collectionsPromise ??= buildCollections(
        contentDir,
        config,
        plugins,
        scannedPages,
        { processedBodies, htmlCache },
      );
      return collectionsPromise;
    };

    const nextPages = new Map<string, BuildStateEntry>();
    const occupiedPaths = new Set<string>();
    const unchangedFiles: Array<{ source: string; destination: string }> = [];
    const themeAssets = theme
      ? await theme.copyAssets(
        stagingDir,
        occupiedPaths,
        config.hashAssets ?? true,
      )
      : {};

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

    interface PageRenderResult {
      page: typeof scannedPages[number];
      outputFilePath: string;
      stagedOutputFilePath: string;
      processedBody: string;
      needsRender: boolean;
      htmlContent?: string;
      renderedContent?: string;
    }

    // Rendering (markdown transforms + Tau) is the only part safe to run
    // concurrently: it has no shared mutable state across pages besides
    // caches that are idempotent to recompute. Collision detection, hook
    // firing, and cache bookkeeping stay in a second, sequential pass below
    // so their order and error behavior are unchanged from a plain for-loop.
    const pageResults = await mapWithConcurrency(
      activePages,
      PAGE_RENDER_CONCURRENCY,
      async (page): Promise<PageRenderResult> => {
        const outputPath = resolvePageRoute(page, shortUrls).outputPath;
        const outputFilePath = join(outputDir, outputPath);
        const stagedOutputFilePath = join(stagingDir, outputPath);
        const cachedPage = previousPages.get(page.fullPath);
        const processedBody = processedBodies.get(page.fullPath)!;

        const needsRender = !cachedPage ||
          cachedPage.sourceText !== page.sourceText ||
          cachedPage.outputPath !== outputFilePath ||
          !fileExists(outputFilePath);

        if (!needsRender) {
          return {
            page,
            outputFilePath,
            stagedOutputFilePath,
            processedBody,
            needsRender,
            htmlContent: cachedPage?.htmlContent,
          };
        }

        let htmlContent = htmlCache.get(page.fullPath);
        if (htmlContent === undefined) {
          let tokens = marked.lexer(processedBody);
          tokens = await runAstTransforms(tokens, plugins);
          htmlContent = await runHtmlTransforms(marked.parser(tokens), plugins);
          htmlCache.set(page.fullPath, htmlContent);
        }

        const layoutName = typeof page.frontmatter.layout === "string"
          ? page.frontmatter.layout
          : "layout";

        const pageOverrides = resolvePageConfigOverrides(
          page.frontmatter,
          page.relPath,
        );
        const pageGlobals = { ...globalVars, ...pageOverrides.globals };
        const pageHead = mergeHeadTags(siteHead, pageOverrides.head);
        const pageSite = {
          ...config,
          ...(pageOverrides.title !== undefined
            ? { title: pageOverrides.title }
            : {}),
          ...(pageOverrides.description !== undefined
            ? { description: pageOverrides.description }
            : {}),
          ...(pageOverrides.author !== undefined
            ? { author: pageOverrides.author }
            : {}),
          head: pageHead,
          ...(pageOverrides.navigation !== undefined
            ? { navigation: pageOverrides.navigation }
            : {}),
        };
        const { steno: _steno, ...pageFrontmatter } = page.frontmatter;
        let pageThemeConfig: Record<string, unknown> | undefined;
        try {
          pageThemeConfig = theme?.resolveConfig(pageOverrides.themeConfig);
        } catch (error) {
          const message = error instanceof Error
            ? error.message
            : String(error);
          throw new Error(
            `Invalid per-page configuration in "${page.relPath}": ${message}`,
          );
        }

        const pageContext = {
          ...pageFrontmatter,
          ...pageGlobals,
          ...publicEnv,
          env: publicEnv,
          globals: pageGlobals,
          site: pageSite,
          theme: theme
            ? { name: theme.name, version: theme.version, ...pageThemeConfig }
            : undefined,
          collections: await getCollections(),
          data,
          title: page.frontmatter.title || page.title || config.title,
          assets: themeAssets,
        };

        const layoutContent = theme
          ? await theme.renderLayout(layoutName, htmlContent, pageContext)
          : htmlContent;
        const renderedContent = injectHeadTags(layoutContent, pageHead);

        return {
          page,
          outputFilePath,
          stagedOutputFilePath,
          processedBody,
          needsRender,
          htmlContent,
          renderedContent,
        };
      },
    );

    for (const result of pageResults) {
      const {
        page,
        outputFilePath,
        stagedOutputFilePath,
        processedBody,
        needsRender,
        htmlContent,
        renderedContent,
      } = result;

      const normalizedStagedPath = resolve(stagedOutputFilePath);
      if (occupiedPaths.has(normalizedStagedPath)) {
        throw new Error(
          `Output collision: multiple pages resolve to "${outputFilePath}".`,
        );
      }
      occupiedPaths.add(normalizedStagedPath);

      if (needsRender) {
        Deno.mkdirSync(dirname(stagedOutputFilePath), { recursive: true });
        Deno.writeTextFileSync(stagedOutputFilePath, renderedContent!);
        await fireAfterPage(
          outputFilePath,
          stagedOutputFilePath,
          renderedContent!,
        );
      } else {
        Deno.mkdirSync(dirname(stagedOutputFilePath), { recursive: true });
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
        htmlContent,
      });
    }
    await copyFilesToStaging(unchangedFiles);

    if (publicDirPath && publicFiles.length > 0) {
      await copyPublicDir(
        publicDirPath,
        publicFiles,
        stagingDir,
        occupiedPaths,
      );
    }

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
