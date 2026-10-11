import { assertEquals } from "@std/assert";
import { renderPage } from "../src/render.ts";
import { Theme } from "../src/theme.ts";

Deno.test("theme: renderPage observes nested component and include sources", async () => {
  const theme = new Theme({
    name: "dependencies",
    version: "1",
    layouts: { layout: '<Outer />{@include "Footer"}' },
    components: { Outer: "<Inner />", Inner: "inner", Footer: "footer", Unused: "unused" },
  });
  const consumed = new Map<string, string | undefined>();
  const output = await renderPage({
    theme,
    layout: "layout",
    content: "",
    context: {},
    head: [],
    minify: false,
    onDependency: (kind, name, source) => consumed.set(`${kind}:${name}`, source),
  });
  assertEquals(output, "innerfooter");
  assertEquals(
    [...consumed.entries()],
    [
      ["layout:layout", '<Outer />{@include "Footer"}'],
      ["component:Outer", "<Inner />"],
      ["component:Inner", "inner"],
      ["component:Footer", "footer"],
    ],
  );
});
