import { assertEquals, assertThrows } from "@std/assert";
import { resolvePageConfigOverrides } from "./page_config.ts";

Deno.test({
  name: "page_config: returns empty overrides when steno namespace is absent",
  fn: () => {
    const overrides = resolvePageConfigOverrides({}, "post.md");
    assertEquals(overrides, {});
  },
});

Deno.test({
  name: "page_config: throws when steno namespace is not an object",
  fn: () => {
    assertThrows(
      () => resolvePageConfigOverrides({ steno: "nope" }, "post.md"),
      Error,
      `Invalid per-page configuration in "post.md" at "steno": expected an object.`,
    );
  },
});

Deno.test({
  name: "page_config: reads string overrides",
  fn: () => {
    const overrides = resolvePageConfigOverrides({
      steno: { title: "Custom Title", description: "Custom Desc", author: "Dev" },
    }, "post.md");
    assertEquals(overrides.title, "Custom Title");
    assertEquals(overrides.description, "Custom Desc");
    assertEquals(overrides.author, "Dev");
  },
});

Deno.test({
  name: "page_config: throws when a string override has the wrong type",
  fn: () => {
    assertThrows(
      () =>
        resolvePageConfigOverrides({ steno: { title: 123 } }, "post.md"),
      Error,
      `at "steno.title": expected a string`,
    );
  },
});

Deno.test({
  name: "page_config: reads object overrides (themeConfig, globals)",
  fn: () => {
    const overrides = resolvePageConfigOverrides({
      steno: { themeConfig: { accent: "blue" }, globals: { flag: true } },
    }, "post.md");
    assertEquals(overrides.themeConfig, { accent: "blue" });
    assertEquals(overrides.globals, { flag: true });
  },
});

Deno.test({
  name: "page_config: throws when an object override is not an object",
  fn: () => {
    assertThrows(
      () =>
        resolvePageConfigOverrides({ steno: { themeConfig: "nope" } }, "post.md"),
      Error,
      `at "steno.themeConfig": expected an object`,
    );
  },
});

Deno.test({
  name: "page_config: delegates head validation and wraps its error",
  fn: () => {
    assertThrows(
      () =>
        resolvePageConfigOverrides({
          steno: { head: [{ tag: "meta" }] },
        }, "post.md"),
      Error,
      `Invalid per-page configuration in "post.md":`,
    );
  },
});

Deno.test({
  name: "page_config: accepts a valid navigation tree",
  fn: () => {
    const overrides = resolvePageConfigOverrides({
      steno: {
        navigation: [
          { title: "Home", url: "/" },
          {
            title: "Docs",
            children: [{ title: "Getting Started", url: "/docs/start" }],
          },
        ],
      },
    }, "post.md");
    assertEquals(overrides.navigation?.length, 2);
    assertEquals(overrides.navigation?.[1].children?.[0].title, "Getting Started");
  },
});

Deno.test({
  name: "page_config: throws when navigation is not an array",
  fn: () => {
    assertThrows(
      () =>
        resolvePageConfigOverrides({ steno: { navigation: "nope" } }, "post.md"),
      Error,
      `at "steno.navigation": expected an array`,
    );
  },
});

Deno.test({
  name: "page_config: throws when a navigation entry is missing a title",
  fn: () => {
    assertThrows(
      () =>
        resolvePageConfigOverrides({
          steno: { navigation: [{ url: "/" }] },
        }, "post.md"),
      Error,
      `at "steno.navigation[0].title": expected a string`,
    );
  },
});

Deno.test({
  name: "page_config: throws when a nested navigation child is invalid",
  fn: () => {
    assertThrows(
      () =>
        resolvePageConfigOverrides({
          steno: {
            navigation: [
              { title: "Docs", children: [{ url: "/docs/start" }] },
            ],
          },
        }, "post.md"),
      Error,
      `at "steno.navigation[0].children[0].title": expected a string`,
    );
  },
});
