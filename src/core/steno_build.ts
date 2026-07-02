import { dirname, join } from "@std/path";
import { marked } from "marked";
import type { CollectionMap } from "./collections.ts";
import { buildCollections } from "./collections.ts";
import { runAstTransforms, runHtmlTransforms } from "../plugins/plugins.ts";
import { parseFrontmatter } from "../utils/frontmatter.ts";
import { ensureDirSync } from "../utils/fileUtils.ts";
import type { SiteConfig, StenoHooks, StenoPlugin } from "../types.ts";
import { Theme } from "../theme/theme.ts";

type BuildContext = {
  config: SiteConfig;
  theme?: Theme;
  plugins: StenoPlugin[];
  hooks: StenoHooks;
};

export async function buildSite({
  config,
  theme,
  plugins,
  hooks,
}: BuildContext): Promise<void> {
  for (const plugin of plugins) {
    await plugin.beforeBuild?.(config);
  }
  await hooks.beforeBuild?.(config);

  const contentDir = config.contentDir || "content";
  const outputDir = config.output || "dist";

  ensureDirSync(outputDir);

  const collections: CollectionMap = await buildCollections(
    contentDir,
    config,
    plugins,
  );

  const processDirectory = async (currentDir: string, relPath = "") => {
    for (const entry of Deno.readDirSync(currentDir)) {
      const fullPath = join(currentDir, entry.name);
      const entryRelPath = relPath ? join(relPath, entry.name) : entry.name;

      if (entry.isDirectory) {
        if (entry.name !== ".steno") {
          await processDirectory(fullPath, entryRelPath);
        }
      } else if (entry.isFile && entry.name.endsWith(".md")) {
        const fileContents = Deno.readTextFileSync(fullPath);

        const { frontmatter, body } = parseFrontmatter(fileContents, fullPath);

        let tokens = marked.lexer(body);
        tokens = await runAstTransforms(tokens, plugins);
        let htmlContent = marked.parser(tokens);
        htmlContent = await runHtmlTransforms(htmlContent, plugins);

        let outputFilePath = join(
          outputDir,
          entryRelPath.replace(/\.md$/, ".html"),
        );
        if (config.custom?.shortUrls) {
          if (entryRelPath !== "index.md") {
            const cleanRelPath = entryRelPath.replace(/\.md$/, "");
            outputFilePath = join(outputDir, cleanRelPath);
            ensureDirSync(outputFilePath);
            outputFilePath = join(outputFilePath, "index.html");
          } else {
            outputFilePath = join(outputDir, "index.html");
          }
        } else {
          ensureDirSync(dirname(outputFilePath));
        }

        const layoutName = typeof frontmatter.layout === "string"
          ? frontmatter.layout
          : "layout";

        const renderedContent = theme
          ? theme.renderLayout(layoutName, htmlContent, {
            site: { ...config },
            theme: {
              name: theme.name,
              version: theme.version,
              ...theme.config,
            },
            collections,
            title: frontmatter.title || config.title,
            ...frontmatter,
          })
          : htmlContent;

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
    }
  };

  await processDirectory(contentDir);

  if (theme) {
    await theme.copyAssets(outputDir);
  }

  for (const plugin of plugins) {
    await plugin.afterBuild?.(config);
  }

  await hooks.afterBuild?.(config);

  console.log("Build complete.");
}
