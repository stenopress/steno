import { assertEquals, assertThrows } from "@std/assert";
import { getPublicEnvVars, resolveConfigGlobals } from "./env.ts";
import type { SiteConfig } from "../../types.ts";

function makeConfig(overrides: Partial<SiteConfig> = {}): SiteConfig {
  return { title: "", description: "", author: "", ...overrides };
}

Deno.test({
  name: "env: getPublicEnvVars returns only PUBLIC_ prefixed vars",
  permissions: { env: true },
  fn: () => {
    Deno.env.set("PUBLIC_SITE_URL", "https://steno.dev");
    Deno.env.set("SECRET_KEY", "should-not-appear");

    try {
      const result = getPublicEnvVars();
      assertEquals(result["PUBLIC_SITE_URL"], "https://steno.dev");
      assertEquals(result["SECRET_KEY"], undefined);
    } finally {
      Deno.env.delete("PUBLIC_SITE_URL");
      Deno.env.delete("SECRET_KEY");
    }
  },
});

Deno.test({
  name: "env: getPublicEnvVars returns empty object when no PUBLIC_ vars",
  permissions: { env: true },
  fn: () => {
    const result = getPublicEnvVars();
    for (const key of Object.keys(result)) {
      assertEquals(key.startsWith("PUBLIC_"), true);
    }
  },
});

Deno.test({
  name: "env: resolveConfigGlobals returns empty object when globals undefined",
  fn: () => {
    const result = resolveConfigGlobals(makeConfig());
    assertEquals(result, {});
  },
});

Deno.test({
  name: "env: resolveConfigGlobals returns globals object",
  fn: () => {
    const result = resolveConfigGlobals(
      makeConfig({ custom: { globals: { tagline: "Ship fast" } } }),
    );
    assertEquals(result, { tagline: "Ship fast" });
  },
});

Deno.test({
  name: "env: resolveConfigGlobals throws when globals is not an object",
  fn: () => {
    assertThrows(
      () =>
        resolveConfigGlobals(
          makeConfig({
            custom: {
              globals: "invalid" as unknown as Record<string, unknown>,
            },
          }),
        ),
      Error,
      "Invalid `custom.globals`",
    );
  },
});

Deno.test({
  name: "env: resolveConfigGlobals throws when globals is an array",
  fn: () => {
    assertThrows(
      () =>
        resolveConfigGlobals(
          makeConfig({
            custom: { globals: [] as unknown as Record<string, unknown> },
          }),
        ),
      Error,
      "Invalid `custom.globals`",
    );
  },
});
