import { parseFrontmatter } from "../utils/frontmatter.ts";
import { join } from "@std/path";
import { marked } from "marked";
import type { CollectionConfig, SiteConfig, StenoPlugin } from "../types.ts";
import { runAstTransforms, runHtmlTransforms } from "../plugins/plugins.ts";
import {
  inferPageTitle,
  isPathInsideOrEqual,
  resolveMarkdownScanIgnorePaths,
  resolveNavigationUrl,
} from "./path_utils.ts";

/** A page captured as part of a collection. */
export interface CollectionItem {
  /** Public URL generated for the content item. */
  url: string;
  /** Parsed frontmatter fields. */
  frontmatter: Record<string, unknown>;
  /** Markdown body without frontmatter. */
  content: string;
}

/** A parsed markdown page discovered during a content scan. */
export interface MarkdownPage {
  fullPath: string;
  relPath: string;
  sourceText: string;
  frontmatter: Record<string, unknown>;
  body: string;
  title?: string;
}

/** A named collection of content items. */
export interface Collection {
  /** Collection key from the site configuration. */
  name: string;
  /** Content items selected for the collection. */
  items: CollectionItem[];
}

/** A lookup table of collection names to collection data. */
export type CollectionMap = Record<string, Collection>;
const FILE_READ_CONCURRENCY = 128;

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapFn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let currentIndex = 0;
  const workerCount = Math.min(concurrency, Math.max(items.length, 1));
  const workers = Array.from({ length: workerCount }, async () => {
    while (true) {
      const index = currentIndex++;
      if (index >= items.length) return;
      results[index] = await mapFn(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

/**
 * Scans the content directory and parses all markdown pages.
 *
 * @param contentDir - The content root to scan.
 * @returns A list of parsed markdown pages.
 */
export async function collectMarkdownPages(
  contentDir: string,
  options: { ignorePaths?: string[] } = {},
): Promise<MarkdownPage[]> {
  const markdownFiles: Array<{ fullPath: string; relPath: string }> = [];
  const ignorePaths = [
    ...resolveMarkdownScanIgnorePaths(contentDir),
    ...(options.ignorePaths ?? []),
  ];

  const scanDirectory = async (currentDir: string, relPath = "") => {
    for await (const entry of Deno.readDir(currentDir)) {
      const fullPath = join(currentDir, entry.name);
      const entryRelPath = relPath ? join(relPath, entry.name) : entry.name;

      if (
        ignorePaths.some((ignorePath) =>
          isPathInsideOrEqual(fullPath, ignorePath)
        )
      ) {
        continue;
      }

      if (entry.isDirectory) {
        if (entry.name !== ".steno") {
          await scanDirectory(fullPath, entryRelPath);
        }
      } else if (entry.isFile && entry.name.endsWith(".md")) {
        markdownFiles.push({ fullPath, relPath: entryRelPath });
      }
    }
  };

  await scanDirectory(contentDir);
  markdownFiles.sort((left, right) =>
    left.relPath.localeCompare(right.relPath)
  );
  return await mapWithConcurrency(
    markdownFiles,
    FILE_READ_CONCURRENCY,
    async ({ fullPath, relPath }) => {
      const sourceText = await Deno.readTextFile(fullPath);
      const { frontmatter, body } = parseFrontmatter(sourceText, fullPath);
      return {
        fullPath,
        relPath,
        sourceText,
        frontmatter,
        body,
        title: inferPageTitle({
          fullPath,
          relPath,
          sourceText,
          frontmatter,
          body,
        }),
      };
    },
  );
}

function resolveUrl(relPath: string, shortUrls: boolean): string {
  return resolveNavigationUrl(relPath, shortUrls);
}

function sortItems(
  items: CollectionItem[],
  collectionConfig?: CollectionConfig,
): CollectionItem[] {
  let result = [...items];

  if (collectionConfig?.sortBy) {
    const { sortBy, order = "asc" } = collectionConfig;
    result = result.sort((a, b) => {
      const aVal = a.frontmatter[sortBy];
      const bVal = b.frontmatter[sortBy];

      if (aVal === undefined && bVal === undefined) return 0;
      if (aVal === undefined) return 1;
      if (bVal === undefined) return -1;

      const aStr = String(aVal);
      const bStr = String(bVal);

      return order === "desc"
        ? bStr.localeCompare(aStr)
        : aStr.localeCompare(bStr);
    });
  }

  if (collectionConfig?.limit) {
    result = result.slice(0, collectionConfig.limit);
  }

  return result;
}

function validateCollectionItem(
  item: CollectionItem,
  schema: Record<string, import("../types.ts").CollectionFieldSchema>,
  pageRelPath: string,
  collectionName: string,
): void {
  const errors: string[] = [];

  for (const [field, rule] of Object.entries(schema)) {
    const value = item.frontmatter[field];

    if (value === undefined || value === null) {
      if (rule.required !== false) {
        errors.push(`  - "${field}" is required but missing`);
      }
      continue;
    }

    const actualType = Array.isArray(value) ? "array" : typeof value;
    if (actualType !== rule.type) {
      errors.push(
        `  - "${field}" must be of type "${rule.type}", got "${actualType}"`,
      );
    }
  }

  if (errors.length > 0) {
    throw new Error(
      `Schema validation failed for "${pageRelPath}" in collection "${collectionName}":\n${
        errors.join("\n")
      }`,
    );
  }
}

/**
 * Scans the content directory and builds collection data from markdown files.
 *
 * @param contentDir - The content root to scan.
 * @param config - The site configuration.
 * @param plugins - Plugins that can transform Markdown tokens and HTML.
 * @returns A map of collection names to collection data.
 */
export async function buildCollections(
  contentDir: string,
  config: SiteConfig,
  plugins: StenoPlugin[],
  pages?: MarkdownPage[],
): Promise<CollectionMap> {
  const collections: CollectionMap = {};
  const shortUrls = config.custom?.shortUrls ?? false;
  const collectionConfigs = config.collections ?? {};
  const markdownPages = pages ?? await collectMarkdownPages(contentDir);

  for (const page of markdownPages) {
    const parts = page.relPath.replace(/\\/g, "/").split("/");
    if (parts.length < 2) continue;

    const collectionName = parts[0];

    let tokens = marked.lexer(page.body);
    tokens = await runAstTransforms(tokens, plugins);
    let htmlContent = marked.parser(tokens);
    htmlContent = await runHtmlTransforms(htmlContent, plugins);

    const url = resolveUrl(page.relPath, shortUrls);

    if (!collections[collectionName]) {
      collections[collectionName] = { name: collectionName, items: [] };
    }
    collections[collectionName].items.push({
      url,
      frontmatter: page.frontmatter,
      content: htmlContent,
    });

    // validate against schema if defined
    const schema = collectionConfigs[collectionName]?.schema;
    if (schema) {
      validateCollectionItem(
        collections[collectionName].items[
          collections[collectionName].items.length - 1
        ],
        schema,
        page.relPath,
        collectionName,
      );
    }
  }

  // Apply filter, then sort/order/limit from config
  for (const [name, collection] of Object.entries(collections)) {
    const config = collectionConfigs[name];
    let items = collection.items;

    if (config?.filter) {
      items = items.filter((item) =>
        Object.entries(config.filter!).every(
          ([key, val]) => item.frontmatter[key] === val,
        )
      );
    }

    collection.items = sortItems(items, config);
  }

  return collections;
}
