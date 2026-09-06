import { assertEquals, assertRejects } from "@std/assert";
import { render } from "./tau.ts";

function evaluate(expression: string, context: Record<string, unknown> = {}) {
  return render({ template: expression, context, components: {} });
}

Deno.test("tau filters: slugify normalizes accents and preserves Unicode letters", async () => {
  for (const [value, expected] of [
    [" Crème brûlée & Tea! ", "creme-brulee-tea"],
    ["中文 東京", "中文-東京"],
    ["__Already--a-slug__", "already-a-slug"],
    [0, "0"],
    [null, ""],
    [undefined, ""],
  ]) {
    assertEquals(await evaluate("{value | slugify}", { value }), expected);
  }
  assertEquals(
    await evaluate("{value | slugify | upper}", { value: "hello world" }),
    "HELLO-WORLD",
  );
});

Deno.test("tau filters: pluralize supports suffixes and explicit irregular forms", async () => {
  assertEquals(await evaluate("{n} post{n | pluralize}", { n: 1 }), "1 post");
  assertEquals(await evaluate("{n} post{n | pluralize}", { n: 0 }), "0 posts");
  for (const n of [1, "1", 2, -1, 1.5]) {
    assertEquals(
      await evaluate('{n | pluralize("person", "people")}', { n }),
      Number(n) === 1 ? "person" : "people",
    );
  }
});

Deno.test(
  "tau filters: number_format has deterministic defaults and explicit locale/precision",
  async () => {
    assertEquals(await evaluate("{n | number_format}", { n: 12345.6789 }), "12,345.679");
    assertEquals(
      await evaluate('{n | number_format("de-DE", 2)}', { n: "12345.6789" }),
      "12.345,68",
    );
    assertEquals(await evaluate('{n | number_format("en-US", 0)}', { n: -1234.5 }), "-1,235");
    assertEquals(await evaluate("{n | number_format}", { n: 0 }), "0");
    for (const n of [null, undefined, ""]) {
      assertEquals(await evaluate("{n | number_format}", { n }), "");
    }
    assertEquals(await evaluate("{n | number_format}", { n: "not numeric" }), "not numeric");
    for (const digits of [-1, 21, 1.5, "invalid"]) {
      await assertRejects(
        () => evaluate('{n | number_format("en-US", digits)}', { n: 1, digits }),
        Error,
        "precision must be an integer",
      );
    }
  },
);

Deno.test("tau filters: markdown_inline returns inline HTML with explicit raw output", async () => {
  const context = { value: "A **bold** and *italic* [link](/docs)." };
  assertEquals(
    await evaluate("{@html value | markdown_inline}", context),
    'A <strong>bold</strong> and <em>italic</em> <a href="/docs">link</a>.',
  );
  assertEquals(
    await evaluate("{value | markdown_inline}", { value: "**bold**" }),
    "&lt;strong&gt;bold&lt;/strong&gt;",
  );
  assertEquals(await evaluate("{@html value | markdown_inline}", { value: null }), "");
  assertEquals(
    await evaluate("{@html value | markdown_inline}", { value: "# heading" }),
    "# heading",
  );
});
