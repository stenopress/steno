import type { ThemeConfigField } from "../types.ts";
import { isRecord } from "../utils/text.ts";

/** Resolved configuration values passed to a theme. */
export type ThemeConfig = Record<string, unknown>;

function valuesEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (typeof left !== "object" || typeof right !== "object") return false;
  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return false;
  }
}

class ConfigValidationError extends Error {}

function configError(themeName: string, path: string, message: string): never {
  throw new ConfigValidationError(
    `Invalid configuration for theme "${themeName}" at "${path}": ${message}`,
  );
}

function validateField(
  themeName: string,
  field: ThemeConfigField,
  value: unknown,
  path: string,
): void {
  for (const keyword of ["oneOf", "anyOf"] as const) {
    const alternatives = field[keyword];
    if (alternatives === undefined) continue;
    if (!Array.isArray(alternatives) || alternatives.length === 0) {
      throw new Error(
        `Invalid schema for theme "${themeName}" at "${path}": ${keyword} must be a non-empty array.`,
      );
    }
    let matches = 0;
    for (const alternative of alternatives) {
      try {
        validateField(themeName, alternative, value, path);
        matches++;
      } catch (error) {
        if (!(error instanceof ConfigValidationError)) throw error;
      }
    }
    if (matches === 0 || (keyword === "oneOf" && matches !== 1)) {
      configError(
        themeName,
        path,
        `must match ${
          keyword === "oneOf" ? "exactly one" : "at least one"
        } ${keyword} alternative (matched ${matches}).`,
      );
    }
  }
  if (field.enum && !field.enum.some((candidate) => valuesEqual(candidate, value))) {
    configError(themeName, path, `must be one of ${JSON.stringify(field.enum)}.`);
  }

  const actualType = Array.isArray(value) ? "array" : value === null ? "null" : typeof value;
  const validType =
    field.type === "integer"
      ? typeof value === "number" && Number.isInteger(value)
      : field.type === "object"
        ? isRecord(value)
        : field.type === actualType;
  if (!validType && (field.type !== undefined || (!field.oneOf && !field.anyOf))) {
    configError(themeName, path, `expected ${field.type}, received ${actualType}.`);
  }

  if (typeof value === "string") validateString(themeName, field, value, path);
  if (typeof value === "number") validateNumber(themeName, field, value, path);
  if (Array.isArray(value)) validateArray(themeName, field, value, path);
  if (isRecord(value)) validateObject(themeName, field, value, path);
}

function validateString(
  themeName: string,
  field: ThemeConfigField,
  value: string,
  path: string,
): void {
  if (field.minLength !== undefined && value.length < field.minLength) {
    configError(themeName, path, `must contain at least ${field.minLength} characters.`);
  }
  if (field.maxLength !== undefined && value.length > field.maxLength) {
    configError(themeName, path, `must contain at most ${field.maxLength} characters.`);
  }
  if (field.pattern === undefined) return;

  let expression: RegExp;
  try {
    expression = new RegExp(field.pattern);
  } catch {
    throw new Error(
      `Invalid configuration for theme "${themeName}" at "${path}": schema contains invalid pattern ${JSON.stringify(
        field.pattern,
      )}.`,
    );
  }
  if (!expression.test(value)) {
    configError(themeName, path, `must match pattern ${JSON.stringify(field.pattern)}.`);
  }
}

function validateNumber(
  themeName: string,
  field: ThemeConfigField,
  value: number,
  path: string,
): void {
  if (!Number.isFinite(value)) configError(themeName, path, "must be finite.");
  if (field.minimum !== undefined && value < field.minimum) {
    configError(themeName, path, `must be at least ${field.minimum}.`);
  }
  if (field.maximum !== undefined && value > field.maximum) {
    configError(themeName, path, `must be at most ${field.maximum}.`);
  }
}

function validateArray(
  themeName: string,
  field: ThemeConfigField,
  value: unknown[],
  path: string,
): void {
  if (field.minItems !== undefined && value.length < field.minItems) {
    configError(themeName, path, `must contain at least ${field.minItems} items.`);
  }
  if (field.maxItems !== undefined && value.length > field.maxItems) {
    configError(themeName, path, `must contain at most ${field.maxItems} items.`);
  }
  if (!field.items) return;
  value.forEach((item, index) => validateField(themeName, field.items!, item, `${path}[${index}]`));
}

function validateObject(
  themeName: string,
  field: ThemeConfigField,
  value: ThemeConfig,
  path: string,
): void {
  validateThemeConfig(themeName, field.properties ?? {}, value, path);
  if (field.additionalProperties !== false) return;

  const properties = field.properties ?? {};
  const extra = Object.keys(value).find((key) => !(key in properties));
  if (extra) configError(themeName, `${path}.${extra}`, "property is not declared by the schema.");
}

export function validateThemeConfig(
  themeName: string,
  schema: Record<string, ThemeConfigField>,
  config: ThemeConfig,
  prefix = "themeConfig",
): void {
  for (const [key, field] of Object.entries(schema)) {
    const path = `${prefix}.${key}`;
    const value = config[key];
    if (value === undefined) {
      if (field.required) configError(themeName, path, "is required.");
      continue;
    }
    validateField(themeName, field, value, path);
  }
}

function resolveFieldDefault(field: ThemeConfigField): unknown {
  if (field.default !== undefined) return structuredClone(field.default);
  if (field.type !== "object" || !field.properties) return undefined;
  const nested = resolveSchemaDefaults(field.properties);
  return Object.keys(nested).length ? nested : undefined;
}

export function resolveSchemaDefaults(schema?: Record<string, ThemeConfigField>): ThemeConfig {
  if (!schema) return {};
  const defaults: ThemeConfig = {};
  for (const [key, field] of Object.entries(schema)) {
    const value = resolveFieldDefault(field);
    if (value !== undefined) defaults[key] = value;
  }
  return defaults;
}
