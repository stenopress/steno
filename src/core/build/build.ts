import { join, resolve } from "@std/path";
import { TauError } from "../../utils/tau_error.ts";
import { createPageContext, renderMarkdown, renderPage } from "@steno/core/render";
import type { SiteConfig, StenoPlugin } from "../../types.ts";
import { mapWithConcurrency } from "../../utils/concurrency.ts";
import { ensureParentDirSync, fileExists } from "../../utils/fs.ts";
import { buildComplete, debugBuildStart, debugPageContext } from "../../utils/output.ts";
import { errorMessage } from "../../utils/text.ts";
import type { CollectionMap } from "../collections.ts";
import { buildCollections, collectMarkdownPages } from "../collections.ts";
import { resolveMinifyCss, resolveMinifyHtml, resolveShortUrls } from "../config.ts";
import { loadDataFiles } from "../data.ts";
import { DiagnosticBag, enforceDiagnostics } from "../diagnostics.ts";
import { validateHeadTags } from "../head.ts";
import { processIncludes } from "../includes.ts";
import {
  resolveMarkdownScanIgnorePaths,
  resolvePageRoute,
  resolvePublicDir,
} from "../path_utils.ts";
import { buildRedirects } from "../redirects.ts";
import {
  loadPersistentBuildCache,
  resolveCachePath,
  savePersistentBuildCache,
  toBuildStatePageMap,
} from "./cache.ts";
import type { BuildContext, BuildStateEntry } from "./context.ts";
import {
  createDependencySnapshotter,
  dependenciesChanged,
  DependencyTracker,
} from "./dependencies.ts";
import type { DependencySnapshots } from "./dependencies.ts";
import { getPublicEnvVars, resolveConfigGlobals } from "./env.ts";
import {
  beginOutputTransaction,
  commitOutputTransaction,
  rollbackOutputTransaction,
} from "./output_transaction.ts";
import { createBuildSignature, hasOpaqueBuildInputs } from "./signature.ts";

export type { BuildContext, BuildState, BuildStateEntry } from "./context.ts";
const STAGING_COPY_CONCURRENCY = 128;
const PAGE_RENDER_CONCURRENCY = 16;

async function runPluginHook(
  plugin: StenoPlugin,
  hook: string,
  configPath: string | undefined,
  run: () => void | Promise<void>,
): Promise<void> {
  try {
    await run();
  } catch (error) {
    const configLabel = configPath ? ` in config "${configPath}"` : "";
    throw new Error(
      `Plugin "${plugin.name}" hook "${hook}" failed${configLabel}: ${errorMessage(error)}. Check this hook's implementation and the plugin's documented requirements.`,
      { cause: error },
    );
  }
}

async function copyFilesToStaging(
  files: Array<{ source: string; destination: string }>,
): Promise<void> {
  await mapWithConcurrency(files, STAGING_COPY_CONCURRENCY, (file) =>
    Deno.copyFile(file.source, file.destination),
  );
}

async function collectFilesRecursively(dir: string, relPrefix = ""): Promise<string[]> {
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
      results.push(...(await collectFilesRecursively(join(dir, entry.name), relPath)));
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
      throw new Error(`Output collision: public asset "${relPath}" would overwrite "${destPath}".`);
    }
    occupiedPaths.add(normalizedDestPath);
    ensureParentDirSync(destPath);
    jobs.push({ source: join(publicDir, relPath), destination: destPath });
  }

  await copyFilesToStaging(jobs);
}

export async function buildSite({
  config,
  configPath,
  theme,
  plugins,
  hooks,
  state,
  pages,
  dev = false,
  environment = {},
  verbose = false,
}: BuildContext): Promise<void> {
  const contentDir = config.contentDir || "content";
  const transaction = beginOutputTransaction(config.output || "dist");
  const outputDir = transaction.outputDir;
  const stagingDir = transaction.stagingDir;
  const stagedConfig: SiteConfig = { ...config, output: stagingDir };
  const snapshotValue = createDependencySnapshotter();
  let committed = false;

  if (verbose) {
    debugBuildStart(theme && { name: theme.name, version: theme.version }, plugins);
  }

  try {
    for (const plugin of plugins) {
      if (plugin.beforeBuild) {
        await runPluginHook(plugin, "beforeBuild", configPath, () =>
          plugin.beforeBuild!(stagedConfig),
        );
      }
    }
    await hooks.beforeBuild?.(stagedConfig);

    const diagnostics = new DiagnosticBag(configPath);
    const data = await loadDataFiles(contentDir, diagnostics);
    enforceDiagnostics(diagnostics, dev);
    const globalVars = resolveConfigGlobals(config);
    const publicEnv = getPublicEnvVars(environment);
    const siteHead = config.head ? validateHeadTags(config.head) : [];
    const shortUrls = resolveShortUrls(config);
    const cachePath = resolveCachePath(contentDir);
    const publicDirPath = resolvePublicDir(contentDir, config.publicDir);
    const publicFiles = publicDirPath ? await collectFilesRecursively(publicDirPath) : [];
    // A `custom.css` dropped at the public dir's root is a zero-config escape for extra css
    if (
      publicFiles.includes("custom.css") &&
      !siteHead.some(
        (tag) => tag.tag === "link" && tag.rel === "stylesheet" && tag.href === "/custom.css",
      )
    ) {
      siteHead.push({ tag: "link", rel: "stylesheet", href: "/custom.css" });
    }

    const opaqueInputs = hasOpaqueBuildInputs(config, theme, plugins, hooks);
    if (opaqueInputs) state?.pageCache?.clear();
    const scannedPages =
      pages ??
      (await collectMarkdownPages(contentDir, {
        ignorePaths: resolveMarkdownScanIgnorePaths(contentDir, outputDir, publicDirPath),
        pageCache: state?.pageCache,
      }));

    const buildSignature = createBuildSignature(
      { ...config, head: siteHead },
      theme,
      plugins,
      publicEnv,
      opaqueInputs,
    );
    const previousPages = new Map<string, BuildStateEntry>();

    if (state?.signature === buildSignature) {
      for (const [k, v] of state.pages) previousPages.set(k, v);
    } else {
      const diskCache = await loadPersistentBuildCache(cachePath);
      if (diskCache?.signature === buildSignature) {
        for (const [k, v] of toBuildStatePageMap(diskCache.pages)) {
          previousPages.set(k, v);
        }
      }
    }

    const activePages = scannedPages.filter((page) => page.frontmatter.draft !== true || dev);
    stagedConfig.pages = activePages.map((page) => ({
      slug: resolvePageRoute(page, shortUrls).outputPath,
      title: typeof page.frontmatter.title === "string" ? page.frontmatter.title : page.title,
      description:
        typeof page.frontmatter.description === "string" ? page.frontmatter.description : undefined,
      date:
        typeof page.frontmatter.date === "string" || page.frontmatter.date instanceof Date
          ? page.frontmatter.date
          : undefined,
    }));
    let canSkipUnchangedBuild =
      !opaqueInputs &&
      theme === undefined &&
      plugins.length === 0 &&
      hooks.beforeBuild === undefined &&
      hooks.afterPage === undefined &&
      hooks.afterBuild === undefined &&
      Object.keys(data).length === 0 &&
      Object.keys(publicEnv).length === 0 &&
      publicFiles.length === 0 &&
      !config.redirects &&
      activePages.every((page) => !page.body.includes("{@include")) &&
      previousPages.size === activePages.length;

    if (canSkipUnchangedBuild) {
      const unchangedChecks = await mapWithConcurrency(
        activePages,
        PAGE_RENDER_CONCURRENCY,
        async (page) => {
          const cached = previousPages.get(page.fullPath);
          const expectedOutput = join(outputDir, resolvePageRoute(page, shortUrls).outputPath);
          return (
            cached?.sourceText === page.sourceText &&
            cached.dependencies !== undefined &&
            cached.outputPath === expectedOutput &&
            (await fileExists(expectedOutput))
          );
        },
      );
      canSkipUnchangedBuild = unchangedChecks.every(Boolean);
    }

    if (canSkipUnchangedBuild) {
      rollbackOutputTransaction(transaction);
      committed = true;
      buildComplete(0);
      return;
    }

    const processedBodies = new Map<string, string>();
    const pageDependencies = new Map<string, DependencyTracker>();
    const includes: Record<string, unknown> = {};
    const processedBodyResults = await mapWithConcurrency(
      scannedPages,
      STAGING_COPY_CONCURRENCY,
      async (page) => {
        const dependencies = new DependencyTracker(snapshotValue);
        pageDependencies.set(page.fullPath, dependencies);
        const body = await processIncludes(
          page.body,
          page.fullPath,
          contentDir,
          undefined,
          (path, source) => {
            includes[path] = source;
            dependencies.record("include", path, source);
          },
        );
        return { fullPath: page.fullPath, body };
      },
    );
    for (const { fullPath, body } of processedBodyResults) {
      processedBodies.set(fullPath, body);
    }

    const htmlCache = new Map<string, string>();
    for (const page of scannedPages) {
      const cachedPage = previousPages.get(page.fullPath);
      if (
        !opaqueInputs &&
        cachedPage &&
        cachedPage.body === processedBodies.get(page.fullPath) &&
        typeof cachedPage.htmlContent === "string"
      ) {
        htmlCache.set(page.fullPath, cachedPage.htmlContent);
      }
    }

    let collectionsPromise: Promise<CollectionMap> | undefined;
    const getCollections = (): Promise<CollectionMap> => {
      collectionsPromise ??= buildCollections(contentDir, config, plugins, scannedPages, {
        processedBodies,
        htmlCache,
      });
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
          resolveMinifyCss(config),
        )
      : {};
    const themeSources = theme?.getBuildSignatureData();
    const dependencyInputs = {
      layout: Object.fromEntries(themeSources?.layouts ?? []),
      component: Object.fromEntries(themeSources?.components ?? []),
      data,
      collection: theme ? await getCollections() : {},
      asset: themeAssets,
      include: includes,
    };

    const fireAfterPage = async (finalPath: string, stagingPath: string, html: string) => {
      // `path` kept for backward compatibility, meaning differs per hook.
      await hooks.afterPage?.({
        path: finalPath,
        finalPath,
        stagingPath,
        html,
      });
      for (const plugin of plugins) {
        if (plugin.afterPage) {
          await runPluginHook(plugin, "afterPage", configPath, () =>
            plugin.afterPage!({ path: stagingPath, finalPath, stagingPath, html }),
          );
        }
      }
    };

    interface PageRenderResult {
      page: (typeof scannedPages)[number];
      outputFilePath: string;
      stagedOutputFilePath: string;
      processedBody: string;
      needsRender: boolean;
      htmlContent?: string;
      renderedContent?: string;
      dependencies?: DependencySnapshots;
    }

    // Only rendering is safe to run concurrently; collision detection, hooks,
    // and cache bookkeeping stay sequential below.
    const pageResults = await mapWithConcurrency(
      activePages,
      PAGE_RENDER_CONCURRENCY,
      async (page): Promise<PageRenderResult> => {
        const outputPath = resolvePageRoute(page, shortUrls).outputPath;
        const outputFilePath = join(outputDir, outputPath);
        const stagedOutputFilePath = join(stagingDir, outputPath);
        const cachedPage = previousPages.get(page.fullPath);
        const processedBody = processedBodies.get(page.fullPath)!;
        const dependencies = pageDependencies.get(page.fullPath)!;

        const needsRender =
          opaqueInputs ||
          !cachedPage ||
          cachedPage.sourceText !== page.sourceText ||
          // catches a changed {@include}d partial even when sourceText didn't change
          cachedPage.body !== processedBody ||
          cachedPage.outputPath !== outputFilePath ||
          dependenciesChanged(cachedPage.dependencies, dependencyInputs, snapshotValue) ||
          !(await fileExists(outputFilePath));

        if (!needsRender) {
          return {
            page,
            outputFilePath,
            stagedOutputFilePath,
            processedBody,
            needsRender,
            htmlContent: cachedPage?.htmlContent,
            dependencies: cachedPage?.dependencies,
          };
        }

        let htmlContent = htmlCache.get(page.fullPath);
        if (htmlContent === undefined) {
          try {
            htmlContent = await renderMarkdown(processedBody, plugins);
          } catch (error) {
            const configLabel = configPath ? ` from config "${configPath}"` : "";
            throw new Error(
              `Failed to process Markdown in page "${page.relPath}"${configLabel}: ${errorMessage(error)}. Check the page source and any named plugin transform hook.`,
              { cause: error },
            );
          }
          htmlCache.set(page.fullPath, htmlContent);
        }

        const {
          context: pageContext,
          head: pageHead,
          layout: layoutName,
        } = createPageContext({
          page,
          config,
          configPath,
          theme,
          siteHead,
          globals: globalVars,
          publicEnv,
          collections: dependencies.track("collection", await getCollections()),
          data: dependencies.track("data", data),
          assets: dependencies.track("asset", themeAssets),
        });

        if (verbose) {
          debugPageContext(outputPath, theme && layoutName, pageContext);
        }

        let renderedContent: string;
        try {
          renderedContent = await renderPage({
            content: htmlContent,
            context: pageContext,
            layout: layoutName,
            head: pageHead,
            theme,
            minify: resolveMinifyHtml(config),
            onDependency: (kind, name, source) => dependencies.record(kind, name, source),
          });
        } catch (error) {
          const themeLabel = theme ? ` with theme "${theme.name}"` : "";
          const configLabel = configPath ? ` from config "${configPath}"` : "";
          const pageLabel = `Failed to render page "${page.relPath}"${themeLabel}${configLabel}`;
          if (error instanceof TauError) {
            error.message = `${pageLabel}: ${error.message}`;
            throw error;
          }
          throw new Error(
            `${pageLabel}: ${errorMessage(error)}. Check the page's layout setting and the referenced theme template.`,
            { cause: error },
          );
        }

        return {
          page,
          outputFilePath,
          stagedOutputFilePath,
          processedBody,
          needsRender,
          htmlContent,
          renderedContent,
          dependencies: dependencies.snapshots,
        };
      },
    );

    const renderedWrites: Array<{ path: string; content: string }> = [];
    const afterPageQueue: Array<{
      outputFilePath: string;
      stagedOutputFilePath: string;
      html: string;
    }> = [];

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
        throw new Error(`Output collision: multiple pages resolve to "${outputFilePath}".`);
      }
      occupiedPaths.add(normalizedStagedPath);

      ensureParentDirSync(stagedOutputFilePath);
      if (needsRender) {
        renderedWrites.push({
          path: stagedOutputFilePath,
          content: renderedContent!,
        });
        afterPageQueue.push({
          outputFilePath,
          stagedOutputFilePath,
          html: renderedContent!,
        });
      } else {
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
        dependencies: result.dependencies,
      });
    }

    // Writes run concurrently; hooks fire after, in original page order.
    await mapWithConcurrency(renderedWrites, STAGING_COPY_CONCURRENCY, (job) =>
      Deno.writeTextFile(job.path, job.content),
    );
    for (const { outputFilePath, stagedOutputFilePath, html } of afterPageQueue) {
      await fireAfterPage(outputFilePath, stagedOutputFilePath, html);
    }
    await copyFilesToStaging(unchangedFiles);

    if (publicDirPath && publicFiles.length > 0) {
      await copyPublicDir(publicDirPath, publicFiles, stagingDir, occupiedPaths);
    }

    if (config.redirects && Object.keys(config.redirects).length > 0) {
      const redirectDiagnostics = new DiagnosticBag(configPath);
      buildRedirects(stagingDir, config.redirects, shortUrls, occupiedPaths, redirectDiagnostics);
      enforceDiagnostics(redirectDiagnostics, dev);
    }

    for (const plugin of plugins) {
      if (plugin.afterBuild) {
        await runPluginHook(plugin, "afterBuild", configPath, () =>
          plugin.afterBuild!(stagedConfig),
        );
      }
    }
    await hooks.afterBuild?.(stagedConfig);

    commitOutputTransaction(transaction);
    committed = true;

    if (state) {
      state.signature = buildSignature;
      state.pages.clear();
      for (const [k, v] of nextPages) state.pages.set(k, v);
    }

    try {
      await savePersistentBuildCache(cachePath, buildSignature, nextPages);
    } catch (error) {
      console.warn(`Build committed, but failed to save cache: ${errorMessage(error)}`);
    }

    buildComplete(renderedWrites.length);
  } finally {
    if (!committed) rollbackOutputTransaction(transaction);
  }
}
