import { loadConfig } from "./config.ts";
import { join } from "@std/path";
import { c, fail, info, ok, success, warn } from "../utils/output.ts";

function dirExists(path: string): boolean {
  try {
    return Deno.statSync(path).isDirectory;
  } catch {
    return false;
  }
}

function fileExists(path: string): boolean {
  try {
    return Deno.statSync(path).isFile;
  } catch {
    return false;
  }
}

function countMarkdownFiles(dir: string): number {
  let count = 0;
  try {
    for (const entry of Deno.readDirSync(dir)) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory && entry.name !== ".steno") {
        count += countMarkdownFiles(fullPath);
      } else if (entry.isFile && entry.name.endsWith(".md")) {
        count++;
      }
    }
  } catch {
    // ignore
  }
  return count;
}

/**
 * Runs a series of checks on the current Steno project and prints a report.
 *
 * @param configPath - Path to the site config file.
 */
export async function runDoctor(configPath: string): Promise<void> {
  console.log();
  console.log(
    `${c.bold}steno doctor${c.reset}  ${c.gray}checking your project...${c.reset}`,
  );
  console.log();

  let hasErrors = false;

  const denoVersion = Deno.version.deno;
  const [major, minor] = denoVersion.split(".").map(Number);
  if (major > 2 || (major === 2 && minor >= 0)) {
    ok(`Deno ${denoVersion}`);
  } else {
    warn(`Deno ${denoVersion} - v2.0.0 or later recommended`);
  }

  // Config file
  if (!fileExists(configPath)) {
    fail(`Config not found at "${configPath}"`);
    console.log();
    console.log(
      `  ${c.red}Doctor found errors. Fix them and try again.${c.reset}`,
    );
    console.log();
    return;
  }

  let config;
  try {
    config = loadConfig(configPath);
    ok(`Config found at "${configPath}"`);
  } catch (e) {
    fail(`Config invalid: ${(e as Error).message}`);
    console.log();
    console.log(
      `  ${c.red}Doctor found errors. Fix them and try again.${c.reset}`,
    );
    console.log();
    return;
  }

  // Content directory
  const contentDir = config.contentDir || "content";
  if (dirExists(contentDir)) {
    ok(`Content directory exists (${contentDir}/)`);
  } else {
    fail(`Content directory not found: "${contentDir}"`);
    hasErrors = true;
  }

  // Markdown pages
  const pageCount = countMarkdownFiles(contentDir);
  if (pageCount > 0) {
    ok(`${pageCount} page${pageCount === 1 ? "" : "s"} found`);
  } else {
    warn(`No .md files found in "${contentDir}"`);
  }

  // Output directory
  const outputDir = config.output || "dist";
  if (dirExists(outputDir)) {
    info(`Output directory exists (${outputDir}/)`);
  } else {
    info(`Output directory will be created at "${outputDir}/" on build`);
  }

  // Data directory
  const dataDir = join(contentDir, "_data");
  if (dirExists(dataDir)) {
    ok(`Data directory found (${contentDir}/_data/)`);
  } else {
    info(`No _data/ directory (optional)`);
  }

  // Theme
  const themeName = config.custom?.theme;
  if (themeName) {
    ok(`Theme declared (${themeName})`);
    // warn on local path themes
    if (themeName.startsWith(".") || themeName.startsWith("/")) {
      const themeDir = themeName.startsWith(".")
        ? join(Deno.cwd(), themeName)
        : themeName;
      if (dirExists(themeDir)) {
        ok(`Local theme directory found`);
      } else {
        fail(`Local theme directory not found: "${themeDir}"`);
        hasErrors = true;
      }
    }
  } else {
    warn(`No theme declared - pages will render as plain HTML`);
  }

  // Plugins
  const plugins = config.plugins ?? [];
  if (plugins.length > 0) {
    ok(`${plugins.length} plugin${plugins.length === 1 ? "" : "s"} declared`);
    const isolatedCount = plugins.filter((plugin) =>
      typeof plugin === "object" && plugin.mode === "isolated"
    ).length;
    const trustedCount = plugins.length - isolatedCount;
    if (isolatedCount > 0) {
      ok(
        `${isolatedCount} plugin${
          isolatedCount === 1 ? "" : "s"
        } configured for subprocess isolation`,
      );
    }
    if (trustedCount > 0) {
      warn(
        `${trustedCount} trusted plugin${
          trustedCount === 1 ? "" : "s"
        } run in-process with Steno's Deno permissions`,
      );
    }

    // Check the top-level plugin source policy. This is not a runtime sandbox.
    const sourcePolicy = config.custom?.pluginSourcePolicy ??
      config.custom?.pluginSecurity;
    if (sourcePolicy?.allowLocal) {
      warn(
        `pluginSourcePolicy.allowLocal is enabled - trusted local plugins may be loaded`,
      );
    }
    if (sourcePolicy?.allowRemoteHttp) {
      warn(
        `pluginSourcePolicy.allowRemoteHttp is enabled - mutable URL plugins may be loaded`,
      );
    }
    if (sourcePolicy?.allowNodeBuiltins) {
      warn(
        "pluginSourcePolicy.allowNodeBuiltins permits top-level node: sources; it does not control transitive imports",
      );
    }

    // validate each plugin specifier
    for (const entry of plugins) {
      const pkg = typeof entry === "string" ? entry : entry.package;
      if (
        !pkg.startsWith("jsr:") && !pkg.startsWith("npm:") &&
        !pkg.startsWith("file://") && !pkg.startsWith("https://")
      ) {
        fail(`Plugin "${pkg}" has an unsupported specifier format`);
        hasErrors = true;
      } else {
        ok(`Plugin specifier valid: ${pkg}`);
      }
    }
  } else {
    info(`No plugins declared`);
  }

  // Collections
  const collections = config.collections ?? {};
  const collectionCount = Object.keys(collections).length;
  if (collectionCount > 0) {
    ok(
      `${collectionCount} collection${
        collectionCount === 1 ? "" : "s"
      } configured`,
    );
  } else {
    info(`No collections configured (auto-detected from subdirectories)`);
  }

  // Redirects
  const redirects = config.redirects ?? {};
  const redirectCount = Object.keys(redirects).length;
  if (redirectCount > 0) {
    ok(`${redirectCount} redirect${redirectCount === 1 ? "" : "s"} declared`);
  }

  // Summary
  console.log();
  if (hasErrors) {
    fail("Doctor found errors. Fix them and try again.");
  } else {
    success("All checks passed!");
  }
  console.log();

  await Promise.resolve();
}
