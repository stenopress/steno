import { assertEquals, assertStringIncludes } from "@std/assert";
import { join } from "@std/path";
import { buildRedirects } from "./redirects.ts";

function fileExists(path: string): boolean {
  try {
    Deno.statSync(path);
    return true;
  } catch {
    return false;
  }
}

Deno.test({
  name: "redirects: writes meta-refresh html file",
  permissions: { read: true, write: true },
  fn: () => {
    const tempDir = Deno.makeTempDirSync();
    buildRedirects(tempDir, { "/old": "/new" }, false);

    const html = Deno.readTextFileSync(join(tempDir, "old.html"));
    assertStringIncludes(html, `content="0; url=/new"`);
    assertStringIncludes(html, `href="/new"`);
    assertStringIncludes(html, "Redirecting...");

    Deno.removeSync(tempDir, { recursive: true });
  },
});

Deno.test({
  name: "redirects: uses directory structure with shortUrls",
  permissions: { read: true, write: true },
  fn: () => {
    const tempDir = Deno.makeTempDirSync();
    buildRedirects(tempDir, { "/old-post": "/new-post" }, true);

    assertEquals(
      fileExists(join(tempDir, "old-post", "index.html")),
      true,
    );

    Deno.removeSync(tempDir, { recursive: true });
  },
});

Deno.test({
  name: "redirects: writes multiple redirects",
  permissions: { read: true, write: true },
  fn: () => {
    const tempDir = Deno.makeTempDirSync();
    buildRedirects(
      tempDir,
      { "/a": "/b", "/c": "/d" },
      false,
    );

    assertEquals(fileExists(join(tempDir, "a.html")), true);
    assertEquals(fileExists(join(tempDir, "c.html")), true);

    Deno.removeSync(tempDir, { recursive: true });
  },
});

Deno.test({
  name: "redirects: skips entry missing leading slash",
  permissions: { read: true, write: true },
  fn: () => {
    const tempDir = Deno.makeTempDirSync();
    // should not throw
    buildRedirects(tempDir, { "no-slash": "/new" }, false);
    assertEquals(fileExists(join(tempDir, "no-slash.html")), false);

    Deno.removeSync(tempDir, { recursive: true });
  },
});

Deno.test({
  name: "redirects: skips entry with empty target",
  permissions: { read: true, write: true },
  fn: () => {
    const tempDir = Deno.makeTempDirSync();
    buildRedirects(tempDir, { "/old": "" }, false);
    assertEquals(fileExists(join(tempDir, "old.html")), false);

    Deno.removeSync(tempDir, { recursive: true });
  },
});

Deno.test({
  name: "redirects: handles nested paths",
  permissions: { read: true, write: true },
  fn: () => {
    const tempDir = Deno.makeTempDirSync();
    buildRedirects(tempDir, { "/blog/old-post": "/blog/new-post" }, false);

    const html = Deno.readTextFileSync(
      join(tempDir, "blog", "old-post.html"),
    );
    assertStringIncludes(html, `url=/blog/new-post`);

    Deno.removeSync(tempDir, { recursive: true });
  },
});

Deno.test({
  name: "redirects: canonical link points to new url",
  permissions: { read: true, write: true },
  fn: () => {
    const tempDir = Deno.makeTempDirSync();
    buildRedirects(tempDir, { "/old": "/new" }, false);

    const html = Deno.readTextFileSync(join(tempDir, "old.html"));
    assertStringIncludes(html, `<link rel="canonical" href="/new"`);

    Deno.removeSync(tempDir, { recursive: true });
  },
});
