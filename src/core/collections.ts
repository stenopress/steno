import { parseFrontmatter } from "../utils/frontmatter.ts";
import { join } from "@std/path";
import { marked } from "marked";
import type { CollectionConfig, SiteConfig, StenoPlugin } from "../types.ts";
import { runAstTransforms, runHtmlTransforms } from "../plugins/plugins.ts";

/** A page captured as part of a collection. */
export interface CollectionItem {
  url: string;
  frontmatter: Record<string, unknown>;
  content: string;
}

/** A parsed markdown page discovered during a content scan. */
export interface MarkdownPage {
  fullPath: string;
  relPath: string;
  sourceText: string;
  frontmatter: Record<string, unknown>;
  body: string;
}

/** A named collection of content items. */
export interface Collection {
  name: string;
  items: CollectionItem[];
}

/** A lookup table of collection names to collection data. */
export type CollectionMap = Record<string, Collection>;

/**
 * Scans the content directory and parses all markdown pages.
 *
 * @param contentDir - The content root to scan.
 * @returns A list of parsed markdown pages.
 */
export async function collectMarkdownPages(
  contentDir: string,
): Promise<MarkdownPage[]> {
  const pages: MarkdownPage[] = [];

  const scanDirectory = async (currentDir: string, relPath = "") => {
    for await (const entry of Deno.readDir(currentDir)) {
      const fullPath = join(currentDir, entry.name);
      const entryRelPath = relPath ? join(relPath, entry.name) : entry.name;

      if (entry.isDirectory) {
        if (entry.name !== ".steno") {
          await scanDirectory(fullPath, entryRelPath);
        }
      } else if (entry.isFile && entry.name.endsWith(".md")) {
        const sourceText = await Deno.readTextFile(fullPath);
        const { frontmatter, body } = parseFrontmatter(sourceText, fullPath);
        pages.push({
          fullPath,
          relPath: entryRelPath,
          sourceText,
          frontmatter,
          body,
        });
      }
    }
  };

  await scanDirectory(contentDir);
  return pages;
}

function resolveUrl(relPath: string, shortUrls: boolean): string {
  const withoutExt = relPath.replace(/\.md$/, "");
  if (shortUrls) {
    return "/" + withoutExt.replace(/\\/g, "/");
  }
  return "/" + withoutExt.replace(/\\/g, "/") + ".html";
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
