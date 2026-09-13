import type { CollectionMap, MarkdownPage } from "./collections.ts";
import { injectHeadTags, mergeHeadTags } from "./head.ts";
import { resolvePageConfigOverrides } from "./page_config.ts";
import type { PageRenderContext, Theme } from "./theme.ts";
import type { HeadTag, SiteConfig } from "./types.ts";
import { errorMessage, minifyHtml } from "./text.ts";

export { renderMarkdown } from "./markdown.ts";

/** Prepared site inputs shared by static builds and request rendering. */
export interface PageContextOptions {
  /** Page metadata and path used for overrides and diagnostics. */
  page: Pick<MarkdownPage, "frontmatter" | "relPath" | "title">;
  /** Resolved site settings before per-page overrides. */
  config: SiteConfig;
  /** Prepared theme instance, if the site uses a theme. */
  theme?: Theme;
  /** Validated site-wide document head entries. */
  siteHead: HeadTag[];
  /** Resolved site-wide template globals. */
  globals: Record<string, unknown>;
  /** Only explicitly public environment values may be supplied here. */
  publicEnv: Record<string, string>;
  /** Prepared named collections exposed to templates. */
  collections: CollectionMap;
  /** Prepared site data exposed under the data key. */
  data: Record<string, unknown>;
  /** Original theme asset paths mapped to prepared output paths. */
  assets: Record<string, string>;
}

/** Resolves page overrides without mutating shared site or theme state. */
export function createPageContext(options: PageContextOptions): {
  context: PageRenderContext;
  head: HeadTag[];
  layout: string;
} {
  const { page, config, theme, siteHead, globals, publicEnv, collections, data, assets } = options;
  const pageOverrides = resolvePageConfigOverrides(page.frontmatter, page.relPath);
  const pageGlobals = { ...globals, ...pageOverrides.globals };
  const pageHead = mergeHeadTags(siteHead, pageOverrides.head);
  const pageSite = {
    ...config,
    ...(pageOverrides.title !== undefined ? { title: pageOverrides.title } : {}),
    ...(pageOverrides.description !== undefined ? { description: pageOverrides.description } : {}),
    ...(pageOverrides.author !== undefined ? { author: pageOverrides.author } : {}),
    head: pageHead,
    ...(pageOverrides.navigation !== undefined ? { navigation: pageOverrides.navigation } : {}),
  };
  const { steno: _steno, ...pageFrontmatter } = page.frontmatter;
  let pageThemeConfig: Record<string, unknown> | undefined;
  try {
    pageThemeConfig = theme?.resolveConfig(pageOverrides.themeConfig);
  } catch (error) {
    throw new Error(`Invalid per-page configuration in "${page.relPath}": ${errorMessage(error)}`);
  }

  return {
    layout: typeof page.frontmatter.layout === "string" ? page.frontmatter.layout : "layout",
    head: pageHead,
    context: {
      ...pageFrontmatter,
      ...pageGlobals,
      ...publicEnv,
      env: publicEnv,
      globals: pageGlobals,
      site: pageSite,
      theme: theme ? { name: theme.name, version: theme.version, ...pageThemeConfig } : undefined,
      collections,
      data,
      title:
        (typeof page.frontmatter.title === "string" ? page.frontmatter.title : undefined) ||
        page.title ||
        config.title,
      assets,
    },
  };
}

/** Renders a prepared page without emitting files or invoking build lifecycle hooks. */
export async function renderPage(options: {
  content: string;
  context: PageRenderContext;
  layout: string;
  head: HeadTag[];
  theme?: Theme;
  minify: boolean;
}): Promise<string> {
  const { content, context, layout, head, theme, minify } = options;
  const layoutContent = theme ? await theme.renderLayout(layout, content, context) : content;
  const injectedContent = injectHeadTags(layoutContent, head);
  return minify ? minifyHtml(injectedContent) : injectedContent;
}
