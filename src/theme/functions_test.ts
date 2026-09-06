import { assertEquals, assertNotEquals, assertRejects, assertThrows } from "@std/assert";
import { join } from "@std/path";
import { clearTauCache, filters } from "../utils/tau.ts";
import type { StenoTheme } from "../types.ts";
import { mergeTheme, Theme } from "./theme.ts";

const base: StenoTheme = {
  name: "helpers",
  version: "1.0.0",
  layouts: { layout: '{translate("hello")} {"hello" | translate} <Label /> {@include "Label"}' },
  components: { Label: '{translate("hello")}' },
};

Deno.test(
  "theme functions: async calls and filters stay scoped across cached templates",
  async () => {
    clearTauCache();
    const first = new Theme({ ...base, functions: { translate: async () => await "<first>" } });
    const second = new Theme({ ...base, functions: { translate: () => "second" } });
    assertEquals(
      await Promise.all([
        first.renderLayout("layout", "", { translate: () => "page override" }),
        second.renderLayout("layout", "", {}),
      ]),
      ["&lt;first&gt; &lt;first&gt; &lt;first&gt; &lt;first&gt;", "second second second second"],
    );
    assertEquals(await first.renderComponent("Label", {}), "&lt;first&gt;");
    assertEquals(Object.hasOwn(filters, "translate"), false);
    await assertRejects(() => new Theme(base).renderLayout("layout", "", {}));
  },
);

Deno.test(
  "theme functions: pipe overrides do not change built-ins or leak through cache",
  async () => {
    const data = { ...base, layouts: { layout: '{"hello" | upper}' } };
    const custom = new Theme({ ...data, functions: { upper: () => "custom" } });
    assertEquals(await custom.renderLayout("layout", "", {}), "custom");
    assertEquals(await new Theme(data).renderLayout("layout", "", {}), "HELLO");
    const missing = { ...base, layouts: { layout: '{"hello" | translate}' } };
    await new Theme({ ...missing, functions: { translate: (value) => value } }).renderLayout(
      "layout",
      "",
      {},
    );
    await assertRejects(
      () => new Theme(missing).renderLayout("layout", "", {}),
      Error,
      'Unknown Tau filter "translate"',
    );
  },
);

Deno.test("theme functions: validate registrations and merge inheritance", async () => {
  for (const functions of [
    { bad: 42 },
    { constructor: () => "unsafe" },
    { "bad-name": () => "bad" },
  ]) {
    assertThrows(
      () => new Theme({ ...base, functions } as unknown as StenoTheme),
      Error,
      "Invalid theme function",
    );
  }
  const inherited = mergeTheme(
    { ...base, functions: { translate: () => "base", extra: () => "extra" } },
    { functions: { translate: () => "child" } },
  );
  assertEquals(inherited.functions?.extra(), "extra");
  assertEquals(await new Theme(inherited).renderComponent("Label", {}), "child");
});

Deno.test("theme functions: cache signatures account for closures with identical source", () => {
  const make = (value: string) => new Theme({ ...base, functions: { translate: () => value } });
  const first = make("first");
  assertEquals(first.getBuildSignatureData(), first.getBuildSignatureData());
  assertNotEquals(first.getBuildSignatureData(), make("second").getBuildSignatureData());
  assertEquals(new Theme(base).getBuildSignatureData(), new Theme(base).getBuildSignatureData());
});

Deno.test("theme functions: directory modules reload and inherit", async () => {
  const dir = await Deno.makeTempDir();
  try {
    await Deno.mkdir(join(dir, "layouts"));
    await Deno.writeTextFile(join(dir, "layouts/layout.tau"), '{translate("hello")}');
    await Deno.writeTextFile(join(dir, "theme.yaml"), "name: helpers\nfunctions: ./functions.ts\n");
    const path = join(dir, "functions.ts");
    await Deno.writeTextFile(path, 'export default { translate: () => "first" };');
    const first = await Theme.loadFromDirectory(dir);
    assertEquals(await first.renderLayout("layout", "", {}), "first");
    await Deno.writeTextFile(path, 'export default { translate: () => "second" };');
    const second = await Theme.loadFromDirectory(dir);
    assertEquals(await second.renderLayout("layout", "", {}), "second");
    await Deno.mkdir(join(dir, "child"));
    await Deno.writeTextFile(join(dir, "child/theme.yaml"), "name: child\nextends: ../\n");
    assertEquals(
      await (await Theme.loadFromDirectory(join(dir, "child"))).renderLayout("layout", "", {}),
      "second",
    );
    await Deno.writeTextFile(path, 'export default { translate: "invalid" };');
    await assertRejects(() => Theme.loadFromDirectory(dir), Error, "Invalid theme function");
    await Deno.writeTextFile(
      join(dir, "theme.yaml"),
      "functions: https://example.com/helpers.ts\n",
    );
    await assertRejects(() => Theme.loadFromDirectory(dir), Error, "local module path");
    await Deno.writeTextFile(join(dir, "child/theme.yaml"), "functions: ./../functions.ts\n");
    await assertRejects(
      () => Theme.loadFromDirectory(join(dir, "child")),
      Error,
      "inside its theme directory",
    );
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});
