import { assertEquals, assertThrows } from "@std/assert";
import type { ThemeConfigField } from "../types.ts";
import { resolveSchemaDefaults, validateThemeConfig } from "./config.ts";
import { Theme } from "./theme.ts";

const accent: ThemeConfigField = {
  oneOf: [
    { type: "string", minLength: 1 },
    {
      type: "array",
      minItems: 1,
      items: {
        anyOf: [
          { type: "string", enum: ["indigo", "rose"] },
          {
            type: "object",
            additionalProperties: false,
            properties: {
              h: { type: "number", required: true, minimum: 0, maximum: 360 },
              s: { type: "number", required: true, minimum: 0, maximum: 100 },
              l: { type: "number", required: true, minimum: 0, maximum: 100 },
            },
          },
        ],
      },
    },
  ],
};

Deno.test("theme config: unions accept strings or arrays of preset/HSL colors", () => {
  for (const value of ["#ff0000", ["indigo", { h: 120, s: 50, l: 50 }]]) {
    validateThemeConfig("colors", { accent_color: accent }, { accent_color: value });
  }
  for (const value of [false, "", [], ["unknown"], [{ h: 400, s: 50, l: 50 }]]) {
    assertThrows(
      () => validateThemeConfig("colors", { accent_color: accent }, { accent_color: value }),
      Error,
      'at "themeConfig.accent_color": must match exactly one oneOf alternative (matched 0)',
    );
  }
});

Deno.test("theme config: oneOf rejects overlapping matches while anyOf accepts them", () => {
  const alternatives: ThemeConfigField[] = [{ type: "number" }, { type: "integer" }];
  validateThemeConfig("union", { value: { anyOf: alternatives } }, { value: 1 });
  validateThemeConfig("union", { value: { oneOf: alternatives } }, { value: 1.5 });
  assertThrows(
    () => validateThemeConfig("union", { value: { oneOf: alternatives } }, { value: 1 }),
    Error,
    "matched 2",
  );
});

Deno.test("theme config: unions retain outer constraints and nested error paths", () => {
  const schema: Record<string, ThemeConfigField> = {
    settings: {
      type: "object",
      properties: {
        colors: {
          type: "array",
          items: { anyOf: [{ type: "string" }, { type: "number" }] },
        },
      },
    },
  };
  assertThrows(
    () => validateThemeConfig("nested", schema, { settings: { colors: [true] } }),
    Error,
    'at "themeConfig.settings.colors[0]": must match at least one anyOf alternative',
  );
  const field: ThemeConfigField = {
    type: "number",
    minimum: 10,
    enum: [5, 15],
    anyOf: [{ type: "number" }, { type: "string" }],
  };
  validateThemeConfig("outer", { value: field }, { value: 15 });
  for (const value of [5, 20, "15"]) {
    assertThrows(() => validateThemeConfig("outer", { value: field }, { value }));
  }
});

Deno.test("theme config: union defaults are explicit and required fields still apply", () => {
  const configSchema = { accent_color: { ...accent, required: true, default: "indigo" } };
  const theme = new Theme({ name: "colors", version: "1", layouts: { layout: "" }, configSchema });
  assertEquals(theme.config.accent_color, "indigo");
  assertThrows(() => theme.resolveConfig({ accent_color: false }), Error, "oneOf");
  assertThrows(
    () => validateThemeConfig("colors", { accent_color: { ...accent, required: true } }, {}),
    Error,
    "is required",
  );
  assertEquals(
    resolveSchemaDefaults({
      value: {
        anyOf: [
          { type: "string", default: "a" },
          { type: "number", default: 1 },
        ],
      },
    }),
    {},
  );
});

Deno.test("theme config: malformed union schemas do not masquerade as branch mismatches", () => {
  for (const keyword of ["oneOf", "anyOf"] as const) {
    assertThrows(
      () => validateThemeConfig("invalid", { value: { [keyword]: [] } }, { value: 1 }),
      Error,
      `${keyword} must be a non-empty array`,
    );
  }
  assertThrows(
    () =>
      validateThemeConfig(
        "invalid",
        {
          value: { anyOf: [{ type: "string" }, { type: "string", pattern: "[" }] },
        },
        { value: "valid" },
      ),
    Error,
    'Invalid schema for theme "invalid" at "themeConfig.value": contains invalid pattern',
  );
});

Deno.test(
  "theme config: missing types and unions report schema errors before value validation",
  () => {
    for (const field of [{}, { enum: ["allowed"] }, { required: true }]) {
      for (const value of ["value", undefined]) {
        assertThrows(
          () => validateThemeConfig("invalid", { value: field }, { value }),
          Error,
          'Invalid schema for theme "invalid" at "themeConfig.value": must declare type, oneOf, or anyOf.',
        );
      }
    }
    for (const keyword of ["oneOf", "anyOf"] as const) {
      assertThrows(
        () =>
          validateThemeConfig(
            "invalid",
            {
              value: { [keyword]: [{ type: "string" }, {}] },
            },
            { value: "valid" },
          ),
        Error,
        'Invalid schema for theme "invalid" at "themeConfig.value": must declare type, oneOf, or anyOf.',
      );
    }
  },
);
