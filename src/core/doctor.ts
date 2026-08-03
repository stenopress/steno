import { resolvePluginSourcePolicy, resolveTheme } from "./config.ts";
import { resolveProject } from "./project.ts";
import { join } from "@std/path";
import { c, fail, info, ok, success, warn } from "../utils/output.ts";

function pathIs(path: string, type: "isDirectory" | "isFile"): boolean {
  try {
    return Deno.statSync(path)[type];
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

  // Config file, or zero-config fallback (single-file/docs discovery) - the
  // same resolution Steno itself uses to build, so doctor never flags a
  // project that would actually build fine.
  let config;
  try {
    const project = await resolveProject(configPath);
    config = project.config;
    if (project.mode === "configured") {
      ok(`Config found at "${configPath}"`);
    } else {
      ok(
        `Zero-config mode (${project.mode}) - no "${configPath}" required`,
      );
    }
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
  if (pathIs(contentDir, "isDirectory")) {
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
  if (pathIs(outputDir, "isDirectory")) {
    info(`Output directory exists (${outputDir}/)`);
  } else {
    info(`Output directory will be created at "${outputDir}/" on build`);
  }

  // Data directory
  const dataDir = join(contentDir, "_data");
  if (pathIs(dataDir, "isDirectory")) {
    ok(`Data directory found (${contentDir}/_data/)`);
  } else {
    info(`No _data/ directory (optional)`);
  }

  // Theme
  const themeName = resolveTheme(config);
  if (themeName) {
    ok(`Theme declared (${themeName})`);
    // warn on local path themes
    if (themeName.startsWith(".") || themeName.startsWith("/")) {
      const themeDir = themeName.startsWith(".")
        ? join(Deno.cwd(), themeName)
        : themeName;
      if (pathIs(themeDir, "isDirectory")) {
        ok(`Local theme directory found`);
      } else {
        fail(`Local theme directory not found: "${themeDir}"`);
        hasErrors = true;
      }
    }
  } else {
    warn(`No theme declared - pages will render as plain HTML`);
  }

  // Deprecated `custom.*` nesting - these fields moved to the top level.
  const deprecatedCustomKeys: Array<[string, string]> = [
    ["theme", "theme"],
    ["themeConfig", "themeConfig"],
    ["shortUrls", "shortUrls"],
    ["devPort", "devPort"],
    ["globals", "globals"],
    ["pluginSourcePolicy", "pluginSourcePolicy"],
    ["pluginSecurity", "pluginSourcePolicy"],
  ];
  for (const [customKey, topLevelKey] of deprecatedCustomKeys) {
    if (config.custom?.[customKey] !== undefined) {
      warn(
        `custom.${customKey} is deprecated - move it to top-level "${topLevelKey}"`,
      );
    }
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
      info(
        `Consider "mode: isolated" for third-party plugins - see docs/plugin_sandbox.md`,
      );
    }

    // Check the top-level plugin source policy. This is not a runtime sandbox.
    const sourcePolicy = resolvePluginSourcePolicy(config);
    if (sourcePolicy.allowLocal) {
      warn(
        `pluginSourcePolicy.allowLocal is enabled - trusted local plugins may be loaded`,
      );
    }
    if (sourcePolicy.allowRemoteHttp) {
      warn(
        `pluginSourcePolicy.allowRemoteHttp is enabled - mutable URL plugins may be loaded`,
      );
    }
    if (sourcePolicy.allowNodeBuiltins) {
      warn(
        "pluginSourcePolicy.allowNodeBuiltins permits top-level node: sources; it does not control transitive imports",
      );
    }

    // validate each plugin specifier
    for (const entry of plugins) {
      const pkg = typeof entry === "string" ? entry : entry.package;
      const isolated = typeof entry === "object" && entry.mode === "isolated";
      const execution = isolated
        ? "isolated, subprocess"
        : "trusted, in-process";
      if (
        !pkg.startsWith("jsr:") && !pkg.startsWith("npm:") &&
        !pkg.startsWith("file://") && !pkg.startsWith("https://")
      ) {
        fail(`Plugin "${pkg}" has an unsupported specifier format`);
        hasErrors = true;
      } else {
        ok(`Plugin ${pkg} (${execution})`);
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
