import { isRecord } from "./text.ts";
import type { ThemeConfigField } from "./types.ts";

export type ThemeConfig = Record<string, unknown>;

class ConfigValidationError extends Error {}

function schemaError(theme: string, path: string, msg: string): never {
  throw new Error(`Invalid schema for theme "${theme}" at "${path}": ${msg}`);
}

function configError(theme: string, path: string, msg: string): never {
  throw new ConfigValidationError(
    `Invalid configuration for theme "${theme}" at "${path}": ${msg}`,
  );
}

function valuesEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const keysA = Object.keys(a as object);
  const keysB = Object.keys(b as object);
  if (keysA.length !== keysB.length) return false;
  return keysA.every((k) =>
    valuesEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]),
  );
}

function validateFieldDeclaration(theme: string, field: ThemeConfigField, path: string): void {
  if (field.type === undefined && field.oneOf === undefined && field.anyOf === undefined) {
    schemaError(theme, path, "must declare type, oneOf, or anyOf.");
  }
}

function validateField(theme: string, field: ThemeConfigField, value: unknown, path: string): void {
  validateFieldDeclaration(theme, field, path);

  if (value === undefined) {
    if (field.required) configError(theme, path, "is required.");
    return;
  }

  for (const kw of ["oneOf", "anyOf"] as const) {
    const alternatives = field[kw];
    if (alternatives === undefined) continue;
    if (!Array.isArray(alternatives) || !alternatives.length) {
      schemaError(theme, path, `${kw} must be a non-empty array.`);
    }

    let matches = 0;
    for (const alt of alternatives) {
      try {
        validateField(theme, alt, value, path);
        matches++;
      } catch (err) {
        if (!(err instanceof ConfigValidationError)) throw err;
      }
    }

    if (!matches || (kw === "oneOf" && matches !== 1)) {
      configError(
        theme,
        path,
        `must match ${kw === "oneOf" ? "exactly one" : "at least one"} ${kw} alternative (matched ${matches}).`,
      );
    }
  }

  if (field.enum && !field.enum.some((candidate) => valuesEqual(candidate, value))) {
    configError(theme, path, `must be one of ${JSON.stringify(field.enum)}.`);
  }

  if (field.type !== undefined) {
    const actualType = Array.isArray(value) ? "array" : value === null ? "null" : typeof value;
    const isValid =
      field.type === "integer"
        ? typeof value === "number" && Number.isInteger(value)
        : field.type === "object"
          ? isRecord(value)
          : field.type === actualType;

    if (!isValid) configError(theme, path, `expected ${field.type}, received ${actualType}.`);
  }

  if (typeof value === "string") validateString(theme, field, value, path);
  if (typeof value === "number") validateNumber(theme, field, value, path);
  if (Array.isArray(value)) validateArray(theme, field, value, path);
  if (isRecord(value)) validateObject(theme, field, value, path);
}

function validateString(theme: string, field: ThemeConfigField, value: string, path: string): void {
  if (field.minLength !== undefined && value.length < field.minLength) {
    configError(theme, path, `must contain at least ${field.minLength} characters.`);
  }
  if (field.maxLength !== undefined && value.length > field.maxLength) {
    configError(theme, path, `must contain at most ${field.maxLength} characters.`);
  }
  if (!field.pattern) return;

  try {
    if (!new RegExp(field.pattern).test(value)) {
      configError(theme, path, `must match pattern ${JSON.stringify(field.pattern)}.`);
    }
  } catch (err) {
    if (err instanceof ConfigValidationError) throw err;
    schemaError(theme, path, `contains invalid pattern ${JSON.stringify(field.pattern)}.`);
  }
}

function validateNumber(theme: string, field: ThemeConfigField, value: number, path: string): void {
  if (!Number.isFinite(value)) configError(theme, path, "must be finite.");
  if (field.minimum !== undefined && value < field.minimum)
    configError(theme, path, `must be at least ${field.minimum}.`);
  if (field.maximum !== undefined && value > field.maximum)
    configError(theme, path, `must be at most ${field.maximum}.`);
}

function validateArray(
  theme: string,
  field: ThemeConfigField,
  value: unknown[],
  path: string,
): void {
  if (field.minItems !== undefined && value.length < field.minItems)
    configError(theme, path, `must contain at least ${field.minItems} items.`);
  if (field.maxItems !== undefined && value.length > field.maxItems)
    configError(theme, path, `must contain at most ${field.maxItems} items.`);
  if (field.items) {
    value.forEach((item, idx) => validateField(theme, field.items!, item, `${path}[${idx}]`));
  }
}

function validateObject(
  theme: string,
  field: ThemeConfigField,
  value: ThemeConfig,
  path: string,
): void {
  validateThemeConfig(theme, field.properties ?? {}, value, path);
  if (field.additionalProperties === false) {
    const knownProps = field.properties ?? {};
    const extra = Object.keys(value).find((k) => !(k in knownProps));
    if (extra) configError(theme, `${path}.${extra}`, "property is not declared by the schema.");
  }
}

export function validateThemeConfig(
  themeName: string,
  schema: Record<string, ThemeConfigField>,
  config: ThemeConfig,
  prefix = "themeConfig",
): void {
  for (const [key, field] of Object.entries(schema)) {
    validateField(themeName, field, config[key], `${prefix}.${key}`);
  }
}

function resolveFieldDefault(field: ThemeConfigField): unknown {
  if (field.default !== undefined) return structuredClone(field.default);
  if (field.type === "object" && field.properties) {
    const nested = resolveSchemaDefaults(field.properties);
    return Object.keys(nested).length ? nested : undefined;
  }
  return undefined;
}

export function resolveSchemaDefaults(schema?: Record<string, ThemeConfigField>): ThemeConfig {
  if (!schema) return {};
  return Object.entries(schema).reduce<ThemeConfig>((acc, [key, field]) => {
    const def = resolveFieldDefault(field);
    if (def !== undefined) acc[key] = def;
    return acc;
  }, {});
}
