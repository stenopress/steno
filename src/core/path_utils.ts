import { basename, dirname, isAbsolute, join, relative } from "@std/path";
import { marked } from "marked";
import type { MarkdownPage } from "./collections.ts";

/** Name of Steno's reserved metadata directory within a content directory. */
export const STENO_DIR = ".steno";

export function humanizeSegment(input: string): string {
  const value = input
    .replace(/[-_.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return value ? value.replace(/\b\w/g, (char) => char.toUpperCase()) : "Untitled";
}

export function inferPageTitle(page: MarkdownPage): string {
  const explicitTitle = page.frontmatter.title;
  if (typeof explicitTitle === "string" && explicitTitle.trim()) {
    return explicitTitle.trim();
  }

  for (const token of marked.lexer(page.body)) {
    if (
      token.type === "heading" && token.depth === 1 &&
      typeof token.text === "string" && token.text.trim()
    ) {
      return token.text.trim();
    }
  }

  const normalizedRelPath = page.relPath.replace(/\\/g, "/");
  const fileName = basename(normalizedRelPath);
  const stem = fileName.replace(/\.md$/, "");

  if (stem === "index") {
    const parentDir = dirname(normalizedRelPath);
    if (!parentDir || parentDir === "." || parentDir === "/") {
      return "Home";
    }

    return humanizeSegment(basename(parentDir));
  }

  return humanizeSegment(stem);
}

/** Resolved public URL and output-relative file path for a content page. */
export interface PageRoute {
  /** Public URL exposed to navigation, collections, and templates. */
  url: string;
  /** File path relative to the configured output directory. */
  outputPath: string;
}

function readPermalink(page: MarkdownPage): string | undefined {
  const namespace = page.frontmatter.steno;
  const namespacedPermalink = namespace &&
      typeof namespace === "object" &&
      !Array.isArray(namespace)
    ? (namespace as Record<string, unknown>).permalink
    : undefined;
  const candidate = namespacedPermalink ?? page.frontmatter.permalink;
  if (candidate === undefined) return;
  if (typeof candidate !== "string" || !candidate.trim()) {
    throw new Error(
      `Invalid permalink in "${page.relPath}": expected a non-empty string.`,
    );
  }
  return candidate.trim();
}

function normalizePermalink(
  permalink: string,
  pageRelPath: string,
): string {
  if (
    permalink.includes("\\") || permalink.includes("?") ||
    permalink.includes("#") || permalink.includes("\0") ||
    /^[A-Za-z][A-Za-z\d+.-]*:/.test(permalink)
  ) {
    throw new Error(
      `Invalid permalink "${permalink}" in "${pageRelPath}": use an absolute site path without a protocol, query, fragment, or backslash.`,
    );
  }

  const normalized = permalink.startsWith("/") ? permalink : `/${permalink}`;
  const segments = normalized.split("/");
  if (segments.some((segment) => segment === "." || segment === "..")) {
    throw new Error(
      `Invalid permalink "${permalink}" in "${pageRelPath}": path traversal is not allowed.`,
    );
  }
  return normalized.replace(/\/{2,}/g, "/");
}

/**
 * Resolves the canonical route for a Markdown page.
 *
 * A `permalink` field, or `steno.permalink`, overrides the file-derived route.
 * Root `404.md` is always emitted as `/404.html` for static-host compatibility.
 */
export function resolvePageRoute(
  page: MarkdownPage,
  shortUrls: boolean,
): PageRoute {
  const normalizedRelPath = page.relPath.replaceAll("\\", "/");
  if (normalizedRelPath === "404.md" && readPermalink(page) === undefined) {
    return { url: "/404.html", outputPath: "404.html" };
  }

  const configuredPermalink = readPermalink(page);
  if (configuredPermalink === undefined) {
    const stem = normalizedRelPath.replace(/\.md$/, "");
    const isIndex = stem === "index" || stem.endsWith("/index");
    const indexDir = stem === "index" ? "" : stem.slice(0, -"index".length);
    const url = shortUrls ? isIndex ? `/${indexDir}` : `/${stem}` : `/${stem}.html`;
    const outputPath = shortUrls
      ? isIndex ? `${indexDir}index.html` : `${stem}/index.html`
      : `${stem}.html`;
    return { url, outputPath };
  }

  const permalink = normalizePermalink(
    configuredPermalink,
    normalizedRelPath,
  );
  if (permalink === "/") {
    return { url: "/", outputPath: "index.html" };
  }

  const withoutLeadingSlash = permalink.slice(1);
  if (permalink.endsWith("/")) {
    return {
      url: permalink,
      outputPath: `${withoutLeadingSlash}index.html`,
    };
  }
  if (permalink.endsWith(".html")) {
    return { url: permalink, outputPath: withoutLeadingSlash };
  }
  return {
    url: permalink,
    outputPath: `${withoutLeadingSlash}/index.html`,
  };
}

/** Resolves a page's output file beneath the configured output directory. */
export function resolvePageOutputPath(
  outputDir: string,
  page: MarkdownPage,
  shortUrls: boolean,
): string {
  return join(outputDir, resolvePageRoute(page, shortUrls).outputPath);
}

export function isPathInsideOrEqual(
  candidate: string,
  parent: string,
): boolean {
  const rel = relative(parent, candidate);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

export function commonAncestorDir(paths: string[]): string {
  if (paths.length === 0) return ".";
  if (paths.length === 1) return dirname(paths[0]);

  let ancestor = dirname(paths[0]);
  for (const path of paths.slice(1)) {
    while (!isPathInsideOrEqual(path, ancestor)) {
      const nextAncestor = dirname(ancestor);
      if (nextAncestor === ancestor) break;
      ancestor = nextAncestor;
    }
  }

  return ancestor;
}

/** Resolves the `public` passthrough directory, or `null` when disabled. */
export function resolvePublicDir(
  contentDir: string,
  publicDir: string | false | undefined,
): string | null {
  if (publicDir === false) return null;
  return join(contentDir, publicDir || "public");
}

export function resolveMarkdownScanIgnorePaths(
  contentDir: string,
  outputDir?: string,
  publicDir?: string | null,
): string[] {
  const ignorePaths = [join(contentDir, STENO_DIR)];
  if (outputDir) ignorePaths.push(outputDir);
  if (publicDir) ignorePaths.push(publicDir);
  return ignorePaths;
}
