import { assertEquals } from "@std/assert";
import { render } from "../src/utils/tau.ts";

const options = {
  template:
    '{title | slugify} {count | number_format} {count | pluralize("item", "items")} {@html text | markdown_inline}',
  context: { title: "Crème & Tea", count: 1200, text: "**hello**" },
  components: {},
};

assertEquals(await render(options), "creme-tea 1,200 items <strong>hello</strong>");

Deno.bench("tau render (extended built-in filters)", async () => {
  await render(options);
});
