import { assertEquals } from "@std/assert";
import { join } from "@std/path";
import { Theme } from "@steno/core/theme";
import { processIncludes } from "../includes.ts";
import { dependenciesChanged, DependencyTracker } from "./dependencies.ts";
import {
  loadPersistentBuildCache,
  savePersistentBuildCache,
  toBuildStatePageMap,
} from "./cache.ts";

Deno.test("dependencies: key reads isolate consumers and track missing keys", () => {
  const tracker = new DependencyTracker();
  const data = tracker.track("data", { site: { title: "First" }, other: "unrelated" });
  assertEquals(data.site.title, "First");
  assertEquals("future" in data, false);
  assertEquals(
    dependenciesChanged(tracker.snapshots, {
      data: { site: { title: "First" }, other: "changed" },
    }),
    false,
  );
  assertEquals(
    dependenciesChanged(tracker.snapshots, {
      data: { site: { title: "Second" }, other: "unrelated" },
    }),
    true,
  );
  assertEquals(
    dependenciesChanged(tracker.snapshots, {
      data: { site: { title: "First" }, other: "unrelated", future: "added" },
    }),
    true,
  );
});

Deno.test("dependencies: enumeration and coercion conservatively track the namespace", () => {
  for (const consume of [Object.keys, (value: unknown) => String(value)]) {
    const tracker = new DependencyTracker();
    consume(tracker.track("data", { first: "a" }));
    assertEquals(
      dependenciesChanged(tracker.snapshots, { data: { first: "a", second: "b" } }),
      true,
    );
  }
});

Deno.test("dependencies: legacy, malformed, and unavailable inputs require a render", () => {
  assertEquals(dependenciesChanged(undefined, {}), true);
  assertEquals(dependenciesChanged({ broken: "null" }, {}), true);
  assertEquals(dependenciesChanged({ '["unknown","key"]': "null" }, {}), true);
  assertEquals(dependenciesChanged({ '["data",3]': "null" }, { data: {} }), true);
});

Deno.test("dependencies: theme callbacks capture nested components and Tau includes", async () => {
  const theme = new Theme({
    name: "dependencies",
    version: "1",
    layouts: { layout: '<Outer data={data} />{@include "Footer"}' },
    components: {
      Outer: "<Inner data={data} />",
      Inner: "{data.site.title}",
      Footer: "footer",
      Unused: "unused",
    },
  });
  const tracker = new DependencyTracker();
  const rendered = await theme.renderLayout(
    "layout",
    "",
    {
      data: tracker.track("data", { site: { title: "title" }, unused: "unused" }),
    },
    (kind, name, source) => tracker.record(kind, name, source),
  );
  assertEquals(rendered, "titlefooter");
  const inputs = {
    layout: { layout: '<Outer data={data} />{@include "Footer"}' },
    component: {
      Outer: "<Inner data={data} />",
      Inner: "{data.site.title}",
      Footer: "footer",
      Unused: "changed",
    },
    data: { site: { title: "title" }, unused: "changed" },
  };
  assertEquals(dependenciesChanged(tracker.snapshots, inputs), false);
  inputs.component.Inner = "changed";
  assertEquals(dependenciesChanged(tracker.snapshots, inputs), true);
});

Deno.test(
  "dependencies: nested Markdown includes and snapshots survive persistent cache",
  async () => {
    const directory = await Deno.makeTempDir();
    try {
      await Deno.writeTextFile(join(directory, "outer.txt"), '{@include "inner.txt"}');
      await Deno.writeTextFile(join(directory, "inner.txt"), "included");
      const tracker = new DependencyTracker();
      const body = await processIncludes(
        '{@include "outer.txt"}',
        join(directory, "index.md"),
        directory,
        undefined,
        (path, source) => tracker.record("include", path, source),
      );
      assertEquals(body, "included");
      const inputs = {
        include: {
          [join(directory, "outer.txt")]: '{@include "inner.txt"}',
          [join(directory, "inner.txt")]: "included",
        },
      };
      assertEquals(dependenciesChanged(tracker.snapshots, inputs), false);
      const cachePath = join(directory, "cache.json");
      await savePersistentBuildCache(
        cachePath,
        "signature",
        new Map([
          [
            join(directory, "index.md"),
            {
              relPath: "index.md",
              outputPath: "index.html",
              sourceText: "source",
              dependencies: tracker.snapshots,
            },
          ],
        ]),
      );
      const loaded = await loadPersistentBuildCache(cachePath);
      const page = toBuildStatePageMap(loaded!.pages).get(join(directory, "index.md"))!;
      assertEquals(dependenciesChanged(page.dependencies, inputs), false);
      inputs.include[join(directory, "inner.txt")] = "changed";
      assertEquals(dependenciesChanged(page.dependencies, inputs), true);
    } finally {
      await Deno.remove(directory, { recursive: true });
    }
  },
);
