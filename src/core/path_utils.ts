import { basename, dirname, isAbsolute, join, relative } from "@std/path";
import { marked } from "marked";
import type { MarkdownPage } from "./collections.ts";

export function humanizeSegment(input: string): string {
  const value = input
    .replace(/[-_.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return value
    ? value.replace(/\b\w/g, (char) => char.toUpperCase())
    : "Untitled";
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

export function resolveNavigationUrl(
  relPath: string,
  shortUrls: boolean,
): string {
  const normalizedRelPath = relPath.replace(/\\/g, "/");
  const withoutExt = normalizedRelPath.replace(/\.md$/, "");

  if (!shortUrls) {
    return `/${withoutExt}.html`;
  }

  if (withoutExt.endsWith("/index")) {
    const dir = withoutExt.slice(0, -"/index".length);
    return dir ? `/${dir}/` : "/";
  }

  if (withoutExt === "index") {
    return "/";
  }

  return `/${withoutExt}`;
}

export function resolveOutputPath(
  outputDir: string,
  relPath: string,
  shortUrls: boolean,
): string {
  const normalizedRelPath = relPath.replace(/\\/g, "/");

  if (!shortUrls) {
    return join(outputDir, normalizedRelPath.replace(/\.md$/, ".html"));
  }

  if (normalizedRelPath === "index.md") {
    return join(outputDir, "index.html");
  }

  if (normalizedRelPath.endsWith("/index.md")) {
    const dir = normalizedRelPath.slice(0, -"/index.md".length);
    return join(outputDir, dir, "index.html");
  }

  return join(
    outputDir,
    normalizedRelPath.replace(/\.md$/, ""),
    "index.html",
  );
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

export function resolveMarkdownScanIgnorePaths(
  contentDir: string,
  outputDir?: string,
): string[] {
  const ignorePaths = [join(contentDir, ".steno")];
  if (outputDir) ignorePaths.push(outputDir);
  return ignorePaths;
}
