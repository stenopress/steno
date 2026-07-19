import { assertEquals, assertThrows } from "@std/assert";
import { join } from "@std/path";
import {
  loadPersistentBuildCache,
  resolveCachePath,
  savePersistentBuildCache,
  toBuildStatePageMap,
} from "./cache.ts";

Deno.test({
  name: "cache: resolveCachePath returns correct path",
  fn: () => {
    const result = resolveCachePath("content");
    assertEquals(result, join("content", ".steno", "build-cache.json"));
  },
});

Deno.test({
  name: "cache: returns null when cache file does not exist",
  permissions: { read: true },
  fn: () => {
    const result = loadPersistentBuildCache("/nonexistent/path/cache.json");
    assertEquals(result, null);
  },
});

Deno.test({
  name: "cache: throws on invalid JSON",
  permissions: { read: true, write: true },
  fn: () => {
    const tempDir = Deno.makeTempDirSync();
    const cachePath = join(tempDir, "cache.json");
    Deno.writeTextFileSync(cachePath, "not json");

    assertThrows(() => loadPersistentBuildCache(cachePath));
    Deno.removeSync(tempDir, { recursive: true });
  },
});

Deno.test({
  name: "cache: throws on wrong version",
  permissions: { read: true, write: true },
  fn: () => {
    const tempDir = Deno.makeTempDirSync();
    const cachePath = join(tempDir, "cache.json");
    Deno.writeTextFileSync(
      cachePath,
      JSON.stringify({ version: 2, signature: "abc", pages: [] }),
    );

    assertThrows(
      () => loadPersistentBuildCache(cachePath),
      Error,
      "Invalid build cache metadata",
    );
    Deno.removeSync(tempDir, { recursive: true });
  },
});

Deno.test({
  name: "cache: throws on missing signature",
  permissions: { read: true, write: true },
  fn: () => {
    const tempDir = Deno.makeTempDirSync();
    const cachePath = join(tempDir, "cache.json");
    Deno.writeTextFileSync(
      cachePath,
      JSON.stringify({ version: 1, pages: [] }),
    );

    assertThrows(
      () => loadPersistentBuildCache(cachePath),
      Error,
      "Invalid build cache metadata",
    );
    Deno.removeSync(tempDir, { recursive: true });
  },
});

Deno.test({
  name: "cache: throws on invalid pages array",
  permissions: { read: true, write: true },
  fn: () => {
    const tempDir = Deno.makeTempDirSync();
    const cachePath = join(tempDir, "cache.json");
    Deno.writeTextFileSync(
      cachePath,
      JSON.stringify({ version: 1, signature: "abc", pages: "not-an-array" }),
    );

    assertThrows(
      () => loadPersistentBuildCache(cachePath),
      Error,
      "Invalid build cache pages",
    );
    Deno.removeSync(tempDir, { recursive: true });
  },
});

Deno.test({
  name: "cache: throws on invalid page entry",
  permissions: { read: true, write: true },
  fn: () => {
    const tempDir = Deno.makeTempDirSync();
    const cachePath = join(tempDir, "cache.json");
    Deno.writeTextFileSync(
      cachePath,
      JSON.stringify({
        version: 1,
        signature: "abc",
        pages: [{ fullPath: 123, outputPath: "out.html", sourceText: "x" }],
      }),
    );

    assertThrows(
      () => loadPersistentBuildCache(cachePath),
      Error,
      "Invalid build cache page fields",
    );
    Deno.removeSync(tempDir, { recursive: true });
  },
});

Deno.test({
  name: "cache: save and load roundtrip",
  permissions: { read: true, write: true },
  fn: () => {
    const tempDir = Deno.makeTempDirSync();
    const cachePath = join(tempDir, ".steno", "build-cache.json");
    const pages = new Map([
      [
        "/content/index.md",
        {
          relPath: "index.md",
          outputPath: "/dist/index.html",
          sourceText: "# Hello",
        },
      ],
    ]);

    savePersistentBuildCache(cachePath, "sig-123", pages);
    const loaded = loadPersistentBuildCache(cachePath);

    assertEquals(loaded?.signature, "sig-123");
    assertEquals(loaded?.pages.length, 1);
    assertEquals(loaded?.pages[0].fullPath, "/content/index.md");
    assertEquals(loaded?.pages[0].relPath, "index.md");

    Deno.removeSync(tempDir, { recursive: true });
  },
});

Deno.test({
  name: "cache: toBuildStatePageMap converts pages correctly",
  fn: () => {
    const pages = [
      {
        fullPath: "/content/index.md",
        relPath: "index.md",
        outputPath: "/dist/index.html",
        sourceText: "# Hello",
      },
    ];

    const map = toBuildStatePageMap(pages);
    assertEquals(map.size, 1);
    assertEquals(map.get("/content/index.md")?.relPath, "index.md");
    assertEquals(map.get("/content/index.md")?.outputPath, "/dist/index.html");
  },
});

Deno.test({
  name:
    "cache: toBuildStatePageMap falls back to fullPath when relPath is not a string",
  fn: () => {
    const pages = [
      {
        fullPath: "/content/index.md",
        relPath: undefined as unknown as string,
        outputPath: "/dist/index.html",
        sourceText: "# Hello",
      },
    ];

    const map = toBuildStatePageMap(pages);
    assertEquals(map.get("/content/index.md")?.relPath, "/content/index.md");
  },
});
