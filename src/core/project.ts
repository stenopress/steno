import { basename, dirname, isAbsolute, join } from "@std/path";
import { loadConfig } from "./config.ts";
import { collectMarkdownPages, type MarkdownPage } from "./collections.ts";
import type { NavigationNode, SiteConfig } from "../types.ts";
import {
  commonAncestorDir,
  humanizeSegment,
  resolveMarkdownScanIgnorePaths,
  resolvePageRoute,
} from "./path_utils.ts";

export interface ResolvedProject {
  config: SiteConfig;
  mode: "configured" | "single-file" | "docs";
  pages?: MarkdownPage[];
}

interface RootScanResult {
  hasProjectMarkers: boolean;
  docsDir?: string;
}

interface ZeroConfigDiscovery {
  mode: "single-file" | "docs";
  contentDir: string;
  pages: MarkdownPage[];
}

interface NavTreeNode {
  name: string;
  page?: NavigationNode;
  children: Map<string, NavTreeNode>;
}

function createNavTreeNode(name: string): NavTreeNode {
  return { name, children: new Map() };
}

function isProjectMarker(name: string): boolean {
  return [
    "deno.json",
    "deno.jsonc",
    "mod.ts",
    "mod.js",
    "mod.mts",
    "mod.mjs",
  ].includes(name);
}

async function pathExists(path: string): Promise<boolean> {
  try {
    return (await Deno.stat(path)).isFile;
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      return false;
    }
    throw error;
  }
}

async function scanRoot(rootDir: string): Promise<RootScanResult> {
  let docsDir: string | undefined;

  for await (const entry of Deno.readDir(rootDir)) {
    if (isProjectMarker(entry.name)) {
      return { hasProjectMarkers: true };
    }

    if (entry.isDirectory && entry.name === "docs") {
      docsDir = join(rootDir, entry.name);
    }
  }

  return { hasProjectMarkers: false, docsDir };
}

function buildNavigationTree(
  pages: MarkdownPage[],
  shortUrls: boolean,
): NavigationNode[] {
  const root = createNavTreeNode("");

  for (const page of pages) {
    const normalizedRelPath = page.relPath.replace(/\\/g, "/");
    const segments = normalizedRelPath.split("/");
    const fileName = segments.pop();
    if (!fileName) continue;

    let cursor = root;
    for (const segment of segments) {
      const existing = cursor.children.get(segment);
      if (existing) {
        cursor = existing;
        continue;
      }

      const next = createNavTreeNode(segment);
      cursor.children.set(segment, next);
      cursor = next;
    }

    const navNode: NavigationNode = {
      title: page.title ?? humanizeSegment(fileName.replace(/\.md$/, "")),
      url: resolvePageRoute(page, shortUrls).url,
    };

    if (fileName === "index.md") {
      cursor.page = navNode;
    } else {
      cursor.children.set(
        fileName.replace(/\.md$/, ""),
        {
          name: fileName.replace(/\.md$/, ""),
          page: navNode,
          children: new Map(),
        },
      );
    }
  }

  const toNavigationNodes = (
    node: NavTreeNode,
    isRoot = false,
  ): NavigationNode[] => {
    const children = [...node.children.values()].flatMap((child) =>
      toNavigationNodes(child)
    );

    if (node.page) {
      if (children.length) node.page.children = children;
      return [node.page];
    }

    if (isRoot) return children;
    if (!children.length) return [];

    return [{
      title: humanizeSegment(node.name),
      children,
    }];
  };

  return toNavigationNodes(root, true);
}

function buildZeroConfigSiteTitle(
  mode: ZeroConfigDiscovery["mode"],
  contentDir: string,
  pages: MarkdownPage[],
): string {
  if (mode === "single-file") {
    return pages[0]?.title ?? humanizeSegment(basename(contentDir));
  }

  const indexPage = pages.find((page) => {
    const normalized = page.relPath.replace(/\\/g, "/");
    return normalized === "index.md" || normalized.endsWith("/index.md");
  });

  return indexPage?.title ?? pages[0]?.title ??
    humanizeSegment(basename(contentDir));
}

function getZeroConfigTheme(mode: ZeroConfigDiscovery["mode"]): string {
  return mode === "single-file"
    ? "jsr:@steno/theme-minimal"
    : "jsr:@steno/theme-docs-minimal";
}

function stripReservedStenoNamespace(page: MarkdownPage): MarkdownPage {
  const frontmatter = { ...page.frontmatter };
  delete (frontmatter as Record<string, unknown>).steno;
  return {
    ...page,
    frontmatter,
  };
}

function extractStenoNamespaceConfig(
  frontmatter: Record<string, unknown>,
): Record<string, unknown> {
  const candidate = frontmatter.steno;
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    return {};
  }

  return candidate as Record<string, unknown>;
}

async function discoverZeroConfigProject(
  rootDir: string,
  rootScan: RootScanResult,
): Promise<ZeroConfigDiscovery | null> {
  const scanRootDir = rootScan.docsDir ?? rootDir;
  const ignorePaths = resolveMarkdownScanIgnorePaths(
    scanRootDir,
    join(rootDir, "dist"),
  ).concat(join(scanRootDir, "dist"));
  const pages = await collectMarkdownPages(scanRootDir, { ignorePaths });
  if (!pages.length) return null;

  if (rootScan.docsDir) {
    return {
      mode: "docs",
      contentDir: rootScan.docsDir,
      pages,
    };
  }

  if (pages.length === 1) {
    return {
      mode: "single-file",
      contentDir: dirname(pages[0].fullPath),
      pages,
    };
  }

  return {
    mode: "docs",
    contentDir: commonAncestorDir(pages.map((page) => page.fullPath)),
    pages,
  };
}

function buildZeroConfigSiteConfig(
  discovery: ZeroConfigDiscovery,
  rootDir: string,
): SiteConfig {
  const pages = discovery.pages.map(stripReservedStenoNamespace);
  const shortUrls = true;
  const navigation = buildNavigationTree(pages, shortUrls);
  const siteTitle = buildZeroConfigSiteTitle(
    discovery.mode,
    discovery.contentDir,
    pages,
  );
  const theme = getZeroConfigTheme(discovery.mode);

  if (discovery.mode === "single-file") {
    const stenoConfig = extractStenoNamespaceConfig(
      discovery.pages[0]?.frontmatter ?? {},
    );

    return {
      title: typeof stenoConfig.title === "string" && stenoConfig.title.trim()
        ? stenoConfig.title.trim()
        : siteTitle,
      description: typeof stenoConfig.description === "string"
        ? stenoConfig.description
        : "",
      author: typeof stenoConfig.author === "string" ? stenoConfig.author : "",
      contentDir: discovery.contentDir,
      output:
        typeof stenoConfig.output === "string" && stenoConfig.output.trim()
          ? (isAbsolute(stenoConfig.output.trim())
            ? stenoConfig.output.trim()
            : join(rootDir, stenoConfig.output.trim()))
          : join(rootDir, "dist"),
      navigation: buildNavigationTree(pages, stenoConfig.shortUrls !== false),
      custom: {
        shortUrls: stenoConfig.shortUrls !== false,
        theme: typeof stenoConfig.theme === "string" &&
            stenoConfig.theme.trim()
          ? stenoConfig.theme.trim()
          : theme,
        themeConfig: stenoConfig.themeConfig &&
            typeof stenoConfig.themeConfig === "object" &&
            stenoConfig.themeConfig !== null &&
            !Array.isArray(stenoConfig.themeConfig)
          ? stenoConfig.themeConfig as Record<string, unknown>
          : {},
      },
    };
  }

  return {
    title: siteTitle,
    description: "",
    author: "",
    contentDir: discovery.contentDir,
    output: join(rootDir, "dist"),
    navigation,
    custom: {
      shortUrls: true,
      theme,
      themeConfig: {},
    },
  };
}

export async function resolveProject(
  configPath: string,
  rootDir: string = Deno.cwd(),
): Promise<ResolvedProject> {
  if (await pathExists(configPath)) {
    return {
      config: loadConfig(configPath),
      mode: "configured",
    };
  }

  const rootScan = await scanRoot(rootDir);

  if (rootScan.hasProjectMarkers) {
    throw new Error(`Configuration file not found at "${configPath}".`);
  }

  const discovery = await discoverZeroConfigProject(rootDir, rootScan);
  if (!discovery) {
    throw new Error(
      `No markdown files found for zero-config fallback in "${rootDir}".`,
    );
  }

  return {
    config: buildZeroConfigSiteConfig(discovery, rootDir),
    mode: discovery.mode,
    // Keep the namespace until rendering so docs-mode pages can apply their
    // own overrides. The build context removes it before templates run.
    pages: discovery.pages,
  };
}
