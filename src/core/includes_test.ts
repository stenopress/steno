import { assertEquals, assertStringIncludes } from "@std/assert";
import { join } from "@std/path";
import { processIncludes } from "./includes.ts";

function makeContentDir(files: Record<string, string>): string {
  const tempDir = Deno.makeTempDirSync();
  for (const [relPath, content] of Object.entries(files)) {
    const fullPath = join(tempDir, relPath);
    Deno.mkdirSync(join(fullPath, ".."), { recursive: true });
    Deno.writeTextFileSync(fullPath, content);
  }
  return tempDir;
}

Deno.test("includes: resolves path relative to current file", async () => {
  const dir = makeContentDir({
    "index.md": `Hello\n{@include "partials/cta.md"}\nWorld`,
    "partials/cta.md": `Sign up today!`,
  });

  const result = await processIncludes(
    `Hello\n{@include "partials/cta.md"}\nWorld`,
    join(dir, "index.md"),
    dir,
  );

  assertStringIncludes(result, "Sign up today!");
  Deno.removeSync(dir, { recursive: true });
});

Deno.test("includes: falls back to contentDir if not relative to file", async () => {
  const dir = makeContentDir({
    "blog/post.md": `{@include "partials/cta.md"}`,
    "partials/cta.md": `Subscribe!`,
  });

  const result = await processIncludes(
    `{@include "partials/cta.md"}`,
    join(dir, "blog", "post.md"),
    dir,
  );

  assertStringIncludes(result, "Subscribe!");
  Deno.removeSync(dir, { recursive: true });
});

Deno.test("includes: processes nested includes", async () => {
  const dir = makeContentDir({
    "index.md": `{@include "a.md"}`,
    "a.md": `A\n{@include "b.md"}`,
    "b.md": `B`,
  });

  const result = await processIncludes(`{@include "a.md"}`, join(dir, "index.md"), dir);

  assertStringIncludes(result, "A");
  assertStringIncludes(result, "B");
  Deno.removeSync(dir, { recursive: true });
});

Deno.test("includes: throws on circular include", async () => {
  const dir = makeContentDir({
    "a.md": `{@include "b.md"}`,
    "b.md": `{@include "a.md"}`,
  });

  let threw = false;
  try {
    await processIncludes(`{@include "a.md"}`, join(dir, "index.md"), dir);
  } catch (e) {
    threw = true;
    assertStringIncludes((e as Error).message, "Circular include");
  }

  assertEquals(threw, true);
  Deno.removeSync(dir, { recursive: true });
});

Deno.test("includes: throws with clear message when file not found", async () => {
  const dir = makeContentDir({
    "index.md": `{@include "nonexistent.md"}`,
  });

  let threw = false;
  try {
    await processIncludes(`{@include "nonexistent.md"}`, join(dir, "index.md"), dir);
  } catch (e) {
    threw = true;
    assertStringIncludes((e as Error).message, "Include not found");
    assertStringIncludes((e as Error).message, "nonexistent.md");
  }

  assertEquals(threw, true);
  Deno.removeSync(dir, { recursive: true });
});

Deno.test("includes: no-op when no includes present", async () => {
  const dir = makeContentDir({ "index.md": `Hello world` });

  const result = await processIncludes(`Hello world`, join(dir, "index.md"), dir);

  assertEquals(result, "Hello world");
  Deno.removeSync(dir, { recursive: true });
});

Deno.test("includes: multiple includes in same file", async () => {
  const dir = makeContentDir({
    "index.md": `{@include "a.md"}\n{@include "b.md"}`,
    "a.md": `Part A`,
    "b.md": `Part B`,
  });

  const result = await processIncludes(
    `{@include "a.md"}\n{@include "b.md"}`,
    join(dir, "index.md"),
    dir,
  );

  assertStringIncludes(result, "Part A");
  assertStringIncludes(result, "Part B");
  Deno.removeSync(dir, { recursive: true });
});
