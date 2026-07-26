import { assertEquals, assertNotEquals } from "@std/assert";
import { createBuildSignature } from "./signature.ts";
import type { SiteConfig } from "../../types.ts";

function makeConfig(overrides: Partial<SiteConfig> = {}): SiteConfig {
  return { title: "Test", description: "", author: "", ...overrides };
}

Deno.test("signature: same config produces same signature", () => {
  const config = makeConfig();
  const a = createBuildSignature(config);
  const b = createBuildSignature(config);
  assertEquals(a, b);
});

Deno.test("signature: different config produces different signature", () => {
  const a = createBuildSignature(makeConfig({ title: "Site A" }));
  const b = createBuildSignature(makeConfig({ title: "Site B" }));
  assertNotEquals(a, b);
});

Deno.test("signature: different plugins produce different signature", () => {
  const config = makeConfig();
  const a = createBuildSignature(config, undefined, [{
    name: "plugin-a",
    transformHtml: (html) => html,
  }]);
  const b = createBuildSignature(config, undefined, [{
    name: "plugin-b",
    transformHtml: (html) => html + "<!-- b -->",
  }]);
  assertNotEquals(a, b);
});

Deno.test("signature: no plugins produces consistent signature", () => {
  const config = makeConfig();
  const a = createBuildSignature(config, undefined, []);
  const b = createBuildSignature(config, undefined, undefined);
  assertEquals(a, b);
});

Deno.test("signature: returns a non-empty string", () => {
  const sig = createBuildSignature(makeConfig());
  assertEquals(typeof sig, "string");
  assertNotEquals(sig, "");
});
