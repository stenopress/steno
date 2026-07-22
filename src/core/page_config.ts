import type { PageConfigOverrides } from "../types.ts";
import type { NavigationNode } from "../types.ts";
import { validateHeadTags } from "./head.ts";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function invalidPageOverride(
  pagePath: string,
  field: string,
  type: string,
): never {
  const path = field ? `steno.${field}` : "steno";
  throw new Error(
    `Invalid per-page configuration in "${pagePath}" at "${path}": expected ${type}.`,
  );
}

function validateNavigation(
  value: unknown,
  pagePath: string,
  field = "navigation",
): asserts value is NavigationNode[] {
  if (!Array.isArray(value)) invalidPageOverride(pagePath, field, "an array");
  value.forEach((entry, index) => {
    const path = `${field}[${index}]`;
    if (!isRecord(entry)) invalidPageOverride(pagePath, path, "an object");
    if (typeof entry.title !== "string") {
      invalidPageOverride(pagePath, `${path}.title`, "a string");
    }
    if (entry.url !== undefined && typeof entry.url !== "string") {
      invalidPageOverride(pagePath, `${path}.url`, "a string");
    }
    if (entry.children !== undefined) {
      validateNavigation(entry.children, pagePath, `${path}.children`);
    }
  });
}

/** Reads and validates the reserved `steno` frontmatter namespace. */
export function resolvePageConfigOverrides(
  frontmatter: Record<string, unknown>,
  pagePath: string,
): PageConfigOverrides {
  const candidate = frontmatter.steno;
  if (candidate === undefined) return {};
  if (!isRecord(candidate)) invalidPageOverride(pagePath, "", "an object");

  const overrides: PageConfigOverrides = {};
  for (const field of ["title", "description", "author"] as const) {
    const value = candidate[field];
    if (value === undefined) continue;
    if (typeof value !== "string") {
      invalidPageOverride(pagePath, field, "a string");
    }
    overrides[field] = value;
  }

  for (const field of ["themeConfig", "globals"] as const) {
    const value = candidate[field];
    if (value === undefined) continue;
    if (!isRecord(value)) invalidPageOverride(pagePath, field, "an object");
    overrides[field] = value;
  }

  if (candidate.head !== undefined) {
    try {
      overrides.head = validateHeadTags(candidate.head, "steno.head");
    } catch (error) {
      throw new Error(
        `Invalid per-page configuration in "${pagePath}": ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  if (candidate.navigation !== undefined) {
    validateNavigation(candidate.navigation, pagePath);
    overrides.navigation = candidate.navigation;
  }

  return overrides;
}
