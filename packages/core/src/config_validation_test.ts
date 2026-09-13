import { assertEquals } from "@std/assert";
import { DiagnosticBag } from "./diagnostics.ts";
import { validateSiteConfig } from "./config_validation.ts";

function codes(raw: Record<string, unknown>): string[] {
  const bag = new DiagnosticBag();
  validateSiteConfig(raw, "config.yml", bag);
  return bag.all.map((d) => d.code);
}

function errorCodes(raw: Record<string, unknown>): string[] {
  const bag = new DiagnosticBag();
  validateSiteConfig(raw, "config.yml", bag);
  return bag.errors.map((d) => d.code);
}

const base = { title: "Test", description: "Test", author: "Test" };

export function registerConfigValidationTests(): void {
  Deno.test("config_validation: a minimal valid config has no diagnostics", () => {
    assertEquals(codes(base), []);
  });

  Deno.test("config_validation: a fully-populated valid config has no diagnostics", () => {
    assertEquals(
      codes({
        ...base,
        contentDir: "content",
        output: "dist",
        publicDir: "assets",
        shortUrls: true,
        hashAssets: false,
        minify: { css: false, html: true },
        devPort: 5735,
        theme: "jsr:@steno/theme-minimal",
        themeConfig: { accent: "indigo" },
        globals: { year: 2026 },
        pluginSourcePolicy: { allowLocal: true },
        custom: { anything: true },
        plugins: ["jsr:@example/a", { package: "jsr:@example/b", options: {} }],
        collections: {
          blog: {
            sortBy: "date",
            order: "desc",
            limit: 10,
            filter: { published: true },
            schema: { title: { type: "string", required: true } },
          },
        },
        redirects: { "/old": "/new" },
        navigation: [{ title: "Home", url: "/", children: [{ title: "Sub" }] }],
        head: [],
      }),
      [],
    );
  });

  Deno.test(
    "config_validation: title/description/author are optional, but wrong-typed if present is still an error",
    () => {
      assertEquals(errorCodes({ title: 1, description: "d", author: "a" }), ["config-invalid"]);
      // Omitted entirely is fine - resolveConfiguredSiteMetadata (project.ts)
      // fills these in later, the same way zero-config mode already does.
      assertEquals(errorCodes({ description: "d", author: "a" }), []);
      assertEquals(errorCodes({}), []);
    },
  );

  Deno.test("config_validation: rejects wrong-typed optional strings/booleans", () => {
    assertEquals(errorCodes({ ...base, contentDir: 1 }), ["config-invalid"]);
    assertEquals(errorCodes({ ...base, output: 1 }), ["config-invalid"]);
    assertEquals(errorCodes({ ...base, theme: 1 }), ["config-invalid"]);
    assertEquals(errorCodes({ ...base, shortUrls: "true" }), ["config-invalid"]);
    assertEquals(errorCodes({ ...base, hashAssets: "false" }), ["config-invalid"]);
  });

  Deno.test("config_validation: minify accepts a boolean or a css/html object", () => {
    assertEquals(errorCodes({ ...base, minify: true }), []);
    assertEquals(errorCodes({ ...base, minify: false }), []);
    assertEquals(errorCodes({ ...base, minify: {} }), []);
    assertEquals(errorCodes({ ...base, minify: { css: false } }), []);
    assertEquals(errorCodes({ ...base, minify: { html: true } }), []);
    assertEquals(errorCodes({ ...base, minify: "off" }), ["config-invalid"]);
    assertEquals(errorCodes({ ...base, minify: { css: "no" } }), ["config-invalid"]);
    assertEquals(errorCodes({ ...base, minify: { html: 1 } }), ["config-invalid"]);
  });

  Deno.test("config_validation: publicDir accepts a string or false, rejects anything else", () => {
    assertEquals(errorCodes({ ...base, publicDir: "assets" }), []);
    assertEquals(errorCodes({ ...base, publicDir: false }), []);
    assertEquals(errorCodes({ ...base, publicDir: 1 }), ["config-invalid"]);
  });

  Deno.test("config_validation: devPort must be an integer in range", () => {
    assertEquals(errorCodes({ ...base, devPort: 5735 }), []);
    assertEquals(errorCodes({ ...base, devPort: 0 }), ["config-invalid"]);
    assertEquals(errorCodes({ ...base, devPort: 70000 }), ["config-invalid"]);
    assertEquals(errorCodes({ ...base, devPort: 5735.5 }), ["config-invalid"]);
    assertEquals(errorCodes({ ...base, devPort: "5735" }), ["config-invalid"]);
  });

  Deno.test("config_validation: rejects a wrong-typed collections config", () => {
    assertEquals(errorCodes({ ...base, collections: "nope" }), ["config-invalid"]);
    assertEquals(errorCodes({ ...base, collections: { blog: { sortBy: 1 } } }), ["config-invalid"]);
    assertEquals(errorCodes({ ...base, collections: { blog: { order: "sideways" } } }), [
      "config-invalid",
    ]);
    assertEquals(errorCodes({ ...base, collections: { blog: { limit: -1 } } }), ["config-invalid"]);
    assertEquals(
      errorCodes({
        ...base,
        collections: { blog: { schema: { title: { type: "wrong" } } } },
      }),
      ["config-invalid"],
    );
  });

  Deno.test("config_validation: rejects a wrong-typed redirects map", () => {
    assertEquals(errorCodes({ ...base, redirects: "nope" }), ["config-invalid"]);
    assertEquals(errorCodes({ ...base, redirects: { "/old": 1 } }), ["config-invalid"]);
  });

  Deno.test("config_validation: validates nested navigation entries recursively", () => {
    assertEquals(errorCodes({ ...base, navigation: [{ title: "Home" }] }), []);
    assertEquals(errorCodes({ ...base, navigation: "nope" }), ["config-invalid"]);
    assertEquals(errorCodes({ ...base, navigation: [{ url: "/" }] }), ["config-invalid"]);
    assertEquals(
      errorCodes({
        ...base,
        navigation: [{ title: "Home", children: [{ url: "/no-title" }] }],
      }),
      ["config-invalid"],
    );
  });

  Deno.test("config_validation: rejects a wrong-typed pluginSourcePolicy", () => {
    assertEquals(errorCodes({ ...base, pluginSourcePolicy: { allowLocal: "yes" } }), [
      "config-invalid",
    ]);
  });

  Deno.test("config_validation: rejects malformed plugin entries", () => {
    assertEquals(errorCodes({ ...base, plugins: "nope" }), ["config-invalid"]);
    assertEquals(errorCodes({ ...base, plugins: [{}] }), ["config-invalid"]);
    assertEquals(errorCodes({ ...base, plugins: ["jsr:@example/a"] }), []);
  });

  Deno.test("config_validation: unrecognized top-level keys are a warning, not an error", () => {
    const bag = new DiagnosticBag();
    validateSiteConfig({ ...base, colllections: {} }, "config.yml", bag);
    assertEquals(bag.hasErrors, false);
    assertEquals(
      bag.warnings.map((d) => d.code),
      ["config-unknown-key"],
    );
  });
}
