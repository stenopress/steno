/**
 * Validates a parsed config file's shape against `SiteConfig` before it
 * reaches anything else - collections, redirects, plugin loading, theme
 * loading, and every other build step assumed a correctly-shaped config
 * already and would otherwise fail confusingly deep inside unrelated code
 * (or silently misbehave) on a wrong-typed field. Every problem found here
 * is fatal unconditionally, dev included: a config that doesn't parse into
 * its documented shape isn't something a dev server can meaningfully "keep
 * iterating on" the way a flaky network plugin might be.
 *
 * @module
 */

import type { NavigationNode } from "../types.ts";
import { isRecord } from "../utils/text.ts";
import type { Diagnostic } from "./diagnostics.ts";
import { DiagnosticBag } from "./diagnostics.ts";

function invalid(
  diagnostics: DiagnosticBag,
  configPath: string,
  field: string,
  expected: string,
): void {
  diagnostics.add({
    code: "config-invalid",
    severity: "error",
    message: `"${field}" must be ${expected}.`,
    file: configPath,
  });
}

function checkOptionalString(
  config: Record<string, unknown>,
  field: string,
  diagnostics: DiagnosticBag,
  configPath: string,
): void {
  const value = config[field];
  if (value === undefined) return;
  if (typeof value !== "string") invalid(diagnostics, configPath, field, "a string");
}

function checkOptionalBoolean(
  config: Record<string, unknown>,
  field: string,
  diagnostics: DiagnosticBag,
  configPath: string,
): void {
  const value = config[field];
  if (value === undefined) return;
  if (typeof value !== "boolean") invalid(diagnostics, configPath, field, "a boolean");
}

function checkOptionalRecord(
  config: Record<string, unknown>,
  field: string,
  diagnostics: DiagnosticBag,
  configPath: string,
): void {
  const value = config[field];
  if (value === undefined) return;
  if (!isRecord(value)) invalid(diagnostics, configPath, field, "an object");
}

function checkDevPort(
  config: Record<string, unknown>,
  diagnostics: DiagnosticBag,
  configPath: string,
): void {
  const value = config.devPort;
  if (value === undefined) return;
  if (
    typeof value !== "number" || !Number.isInteger(value) || value < 1 ||
    value > 65535
  ) {
    invalid(diagnostics, configPath, "devPort", "an integer between 1 and 65535");
  }
}

function checkPublicDir(
  config: Record<string, unknown>,
  diagnostics: DiagnosticBag,
  configPath: string,
): void {
  const value = config.publicDir;
  if (value === undefined || value === false) return;
  if (typeof value !== "string") {
    invalid(diagnostics, configPath, "publicDir", 'a string, or "false" to disable it');
  }
}

function checkCollections(
  config: Record<string, unknown>,
  diagnostics: DiagnosticBag,
  configPath: string,
): void {
  const value = config.collections;
  if (value === undefined) return;
  if (!isRecord(value)) {
    invalid(diagnostics, configPath, "collections", "an object");
    return;
  }

  for (const [name, entry] of Object.entries(value)) {
    const base = `collections.${name}`;
    if (!isRecord(entry)) {
      invalid(diagnostics, configPath, base, "an object");
      continue;
    }
    if (entry.sortBy !== undefined && typeof entry.sortBy !== "string") {
      invalid(diagnostics, configPath, `${base}.sortBy`, "a string");
    }
    if (
      entry.order !== undefined && entry.order !== "asc" && entry.order !== "desc"
    ) {
      invalid(diagnostics, configPath, `${base}.order`, '"asc" or "desc"');
    }
    if (
      entry.limit !== undefined &&
      (typeof entry.limit !== "number" || !Number.isInteger(entry.limit) ||
        entry.limit < 0)
    ) {
      invalid(diagnostics, configPath, `${base}.limit`, "a non-negative integer");
    }
    if (entry.filter !== undefined && !isRecord(entry.filter)) {
      invalid(diagnostics, configPath, `${base}.filter`, "an object");
    }
    if (entry.schema !== undefined) {
      if (!isRecord(entry.schema)) {
        invalid(diagnostics, configPath, `${base}.schema`, "an object");
      } else {
        for (const [fieldName, fieldSchema] of Object.entries(entry.schema)) {
          const fieldBase = `${base}.schema.${fieldName}`;
          if (!isRecord(fieldSchema)) {
            invalid(diagnostics, configPath, fieldBase, "an object");
            continue;
          }
          const type = fieldSchema.type;
          if (
            type !== "string" && type !== "number" && type !== "boolean" &&
            type !== "array"
          ) {
            invalid(
              diagnostics,
              configPath,
              `${fieldBase}.type`,
              '"string", "number", "boolean", or "array"',
            );
          }
          if (
            fieldSchema.required !== undefined &&
            typeof fieldSchema.required !== "boolean"
          ) {
            invalid(diagnostics, configPath, `${fieldBase}.required`, "a boolean");
          }
        }
      }
    }
  }
}

function checkRedirects(
  config: Record<string, unknown>,
  diagnostics: DiagnosticBag,
  configPath: string,
): void {
  const value = config.redirects;
  if (value === undefined) return;
  if (!isRecord(value)) {
    invalid(diagnostics, configPath, "redirects", "an object");
    return;
  }
  for (const [from, to] of Object.entries(value)) {
    if (typeof to !== "string") {
      invalid(diagnostics, configPath, `redirects["${from}"]`, "a string");
    }
  }
}

function checkNavigationEntries(
  entries: unknown,
  diagnostics: DiagnosticBag,
  configPath: string,
  field: string,
): entries is NavigationNode[] {
  if (!Array.isArray(entries)) {
    invalid(diagnostics, configPath, field, "an array");
    return false;
  }
  let ok = true;
  entries.forEach((entry, index) => {
    const path = `${field}[${index}]`;
    if (!isRecord(entry)) {
      invalid(diagnostics, configPath, path, "an object");
      ok = false;
      return;
    }
    if (typeof entry.title !== "string") {
      invalid(diagnostics, configPath, `${path}.title`, "a string");
      ok = false;
    }
    if (entry.url !== undefined && typeof entry.url !== "string") {
      invalid(diagnostics, configPath, `${path}.url`, "a string");
      ok = false;
    }
    if (entry.children !== undefined) {
      ok = checkNavigationEntries(
        entry.children,
        diagnostics,
        configPath,
        `${path}.children`,
      ) && ok;
    }
  });
  return ok;
}

function checkPluginSourcePolicy(
  config: Record<string, unknown>,
  diagnostics: DiagnosticBag,
  configPath: string,
): void {
  const value = config.pluginSourcePolicy;
  if (value === undefined) return;
  if (!isRecord(value)) {
    invalid(diagnostics, configPath, "pluginSourcePolicy", "an object");
    return;
  }
  for (
    const field of [
      "allowLocal",
      "allowRemoteHttp",
      "allowNodeBuiltins",
      "allowThemePlugins",
    ] as const
  ) {
    const field_value = value[field];
    if (field_value !== undefined && typeof field_value !== "boolean") {
      invalid(diagnostics, configPath, `pluginSourcePolicy.${field}`, "a boolean");
    }
  }
}

function checkPlugins(
  config: Record<string, unknown>,
  diagnostics: DiagnosticBag,
  configPath: string,
): void {
  const value = config.plugins;
  if (value === undefined) return;
  if (!Array.isArray(value)) {
    invalid(diagnostics, configPath, "plugins", "an array");
    return;
  }
  value.forEach((entry, index) => {
    const path = `plugins[${index}]`;
    if (typeof entry === "string") return;
    if (!isRecord(entry)) {
      invalid(diagnostics, configPath, path, "a string, or an object with a package field");
      return;
    }
    if (typeof entry.package !== "string") {
      invalid(diagnostics, configPath, `${path}.package`, "a string");
    }
  });
}

const KNOWN_CONFIG_KEYS = new Set<string>([
  "title",
  "description",
  "author",
  "head",
  "contentDir",
  "output",
  "publicDir",
  "plugins",
  "collections",
  "redirects",
  "shortUrls",
  "hashAssets",
  "devPort",
  "theme",
  "themeConfig",
  "globals",
  "pluginSourcePolicy",
  "custom",
  "navigation",
  "pages",
]);

/**
 * Validates `raw` against `SiteConfig`'s documented shape, collecting every
 * problem found (not just the first) into `diagnostics`. Unrecognized
 * top-level keys are reported as warnings, same as before; every type
 * mismatch is an error.
 */
export function validateSiteConfig(
  raw: Record<string, unknown>,
  configPath: string,
  diagnostics: DiagnosticBag = new DiagnosticBag(),
): Diagnostic[] {
  for (const field of ["title", "description", "author"] as const) {
    if (typeof raw[field] !== "string") {
      invalid(diagnostics, configPath, field, "a string");
    }
  }

  for (const field of ["contentDir", "output", "theme"] as const) {
    checkOptionalString(raw, field, diagnostics, configPath);
  }
  for (const field of ["shortUrls", "hashAssets"] as const) {
    checkOptionalBoolean(raw, field, diagnostics, configPath);
  }
  for (const field of ["themeConfig", "globals", "custom"] as const) {
    checkOptionalRecord(raw, field, diagnostics, configPath);
  }

  checkDevPort(raw, diagnostics, configPath);
  checkPublicDir(raw, diagnostics, configPath);
  checkCollections(raw, diagnostics, configPath);
  checkRedirects(raw, diagnostics, configPath);
  checkPluginSourcePolicy(raw, diagnostics, configPath);
  checkPlugins(raw, diagnostics, configPath);

  if (raw.navigation !== undefined) {
    checkNavigationEntries(raw.navigation, diagnostics, configPath, "navigation");
  }
  if (raw.head !== undefined && !Array.isArray(raw.head)) {
    invalid(diagnostics, configPath, "head", "an array");
    // Deeper per-entry validation (type/attrs) happens at build time in
    // validateHeadTags(), which already produces a precise error - no need
    // to duplicate that logic here once the top-level shape is right.
  }

  const unknownKeys = Object.keys(raw).filter((key) => !KNOWN_CONFIG_KEYS.has(key));
  if (unknownKeys.length > 0) {
    diagnostics.add({
      code: "config-unknown-key",
      severity: "warning",
      message: `Unrecognized key${unknownKeys.length === 1 ? "" : "s"}: ${
        unknownKeys.map((key) => `"${key}"`).join(", ")
      }. Check for a typo, or nest project-specific fields under "custom".`,
      file: configPath,
    });
  }

  return diagnostics.all as Diagnostic[];
}
