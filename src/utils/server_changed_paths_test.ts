import { assertEquals, assertStringIncludes } from "@std/assert";
import { join } from "@std/path";
import { Steno } from "../core/steno.ts";
import { processWatchEvents } from "./server.ts";

Deno.test("watch: batches changed input paths and excludes output/cache paths", async () => {
  async function* events(): AsyncGenerator<Deno.FsEvent> {
    yield { kind: "modify", paths: ["/content/a.md", "/dist/a.html"] };
    yield { kind: "modify", paths: ["/content/a.md", "/content/b.md"] };
    yield { kind: "modify", paths: ["/content/.steno/build-cache.json"] };
  }
  const builds: Array<string[] | undefined> = [];
  await processWatchEvents(events(), {
    outputDir: "/dist",
    ignoredPaths: ["/content/.steno/build-cache.json"],
    buildFn: (paths) => {
      builds.push(paths);
    },
  });
  assertEquals(builds, [["/content/a.md", "/content/b.md"]]);
});

Deno.test("watch: events without paths request a complete parser cache refresh", async () => {
  async function* events(): AsyncGenerator<Deno.FsEvent> {
    yield { kind: "modify", paths: ["/content/a.md"] };
    yield { kind: "modify", paths: [] };
  }
  const builds: Array<string[] | undefined> = [];
  await processWatchEvents(events(), {
    outputDir: "/dist",
    buildFn: (paths) => {
      builds.push(paths);
    },
  });
  assertEquals(builds, [undefined]);
});

Deno.test({
  name: "watch: same-size edits with preserved timestamps invalidate the parsed page",
  permissions: { read: true, write: true },
  fn: async () => {
    const root = await Deno.makeTempDir({ prefix: "steno-watch-cache-" });
    const contentDir = join(root, "content");
    const output = join(root, "dist");
    const configPath = join(contentDir, ".steno", "config.yml");
    const pagePath = join(contentDir, "index.md");
    try {
      await Deno.mkdir(join(contentDir, ".steno"), { recursive: true });
      await Deno.writeTextFile(
        configPath,
        `title: Watch\ncontentDir: ${JSON.stringify(contentDir)}\noutput: ${JSON.stringify(output)}\n`,
      );
      await Deno.writeTextFile(pagePath, "# First");
      const steno = new Steno(configPath, false);
      const runtime = steno as unknown as {
        runtimeLoadingPromise: Promise<unknown>;
        executeBuild: (dev: boolean, changedPaths?: string[]) => Promise<void>;
      };
      await runtime.runtimeLoadingPromise;
      await runtime.executeBuild(true);
      const before = await Deno.stat(pagePath);
      await Deno.writeTextFile(pagePath, "# Later");
      await Deno.utime(pagePath, before.atime!, before.mtime!);
      await runtime.executeBuild(true, [pagePath]);
      assertStringIncludes(await Deno.readTextFile(join(output, "index.html")), "Later");
    } finally {
      await Deno.remove(root, { recursive: true });
    }
  },
});
