import { parseFrontmatter } from "../utils/frontmatter.ts";
import { join } from "@std/path";
import { marked } from "marked";
import type { SiteConfig, StenoPlugin, CollectionConfig } from "../types.ts";
import { runAstTransforms, runHtmlTransforms } from "../plugins/plugins.ts";

export interface CollectionItem {
  url: string;
  frontmatter: Record<string, unknown>;
  content: string;
}

export interface Collection {
  name: string;
  items: CollectionItem[];
}

export type CollectionMap = Record<string, Collection>;

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

export async function buildCollections(
  contentDir: string,
  config: SiteConfig,
  plugins: StenoPlugin[],
): Promise<CollectionMap> {
  const collections: CollectionMap = {};
  const shortUrls = config.custom?.shortUrls ?? false;
  const collectionConfigs = config.collections ?? {};

  const scanDirectory = async (currentDir: string, relPath = "") => {
    for await (const entry of Deno.readDir(currentDir)) {
      const fullPath = join(currentDir, entry.name);
      const entryRelPath = relPath ? join(relPath, entry.name) : entry.name;

      if (entry.isDirectory) {
        if (entry.name !== ".steno") {
          await scanDirectory(fullPath, entryRelPath);
        }
      } else if (entry.isFile && entry.name.endsWith(".md")) {
        const parts = entryRelPath.replace(/\\/g, "/").split("/");
        if (parts.length < 2) continue;

        const collectionName = parts[0];

        // Use Deno.readTextFile (async)
        const fileContents = await Deno.readTextFile(fullPath);
        const { frontmatter, body } = parseFrontmatter(fileContents, fullPath);

        let tokens = marked.lexer(body);
        tokens = await runAstTransforms(tokens, plugins);
        let htmlContent = marked.parser(tokens);
        htmlContent = await runHtmlTransforms(htmlContent, plugins);

        const url = resolveUrl(entryRelPath, shortUrls);

        if (!collections[collectionName]) {
          collections[collectionName] = { name: collectionName, items: [] };
        }

        collections[collectionName].items.push({
          url,
          frontmatter,
          content: htmlContent,
        });
      }
    }
  };

  await scanDirectory(contentDir);

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
