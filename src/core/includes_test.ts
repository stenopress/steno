import { assertEquals, assertRejects, assertStringIncludes } from "@std/assert";
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

Deno.test("includes: resolves path relative to current file", () => {
    const dir = makeContentDir({
        "index.md": `Hello\n{@include "partials/cta.md"}\nWorld`,
        "partials/cta.md": `Sign up today!`,
    });

    const result = processIncludes(
        `Hello\n{@include "partials/cta.md"}\nWorld`,
        join(dir, "index.md"),
        dir,
    );

    assertStringIncludes(result, "Sign up today!");
    Deno.removeSync(dir, { recursive: true });
});

Deno.test("includes: falls back to contentDir if not relative to file", () => {
    const dir = makeContentDir({
        "blog/post.md": `{@include "partials/cta.md"}`,
        "partials/cta.md": `Subscribe!`,
    });

    const result = processIncludes(
        `{@include "partials/cta.md"}`,
        join(dir, "blog", "post.md"),
        dir,
    );

    assertStringIncludes(result, "Subscribe!");
    Deno.removeSync(dir, { recursive: true });
});

Deno.test("includes: processes nested includes", () => {
    const dir = makeContentDir({
        "index.md": `{@include "a.md"}`,
        "a.md": `A\n{@include "b.md"}`,
        "b.md": `B`,
    });

    const result = processIncludes(
        `{@include "a.md"}`,
        join(dir, "index.md"),
        dir,
    );

    assertStringIncludes(result, "A");
    assertStringIncludes(result, "B");
    Deno.removeSync(dir, { recursive: true });
});

Deno.test("includes: throws on circular include", () => {
    const dir = makeContentDir({
        "a.md": `{@include "b.md"}`,
        "b.md": `{@include "a.md"}`,
    });

    let threw = false;
    try {
        processIncludes(
            `{@include "a.md"}`,
            join(dir, "index.md"),
            dir,
        );
    } catch (e) {
        threw = true;
        assertStringIncludes((e as Error).message, "Circular include");
    }

    assertEquals(threw, true);
    Deno.removeSync(dir, { recursive: true });
});

Deno.test("includes: throws with clear message when file not found", () => {
    const dir = makeContentDir({
        "index.md": `{@include "nonexistent.md"}`,
    });

    let threw = false;
    try {
        processIncludes(
            `{@include "nonexistent.md"}`,
            join(dir, "index.md"),
            dir,
        );
    } catch (e) {
        threw = true;
        assertStringIncludes((e as Error).message, "Include not found");
        assertStringIncludes((e as Error).message, "nonexistent.md");
    }

    assertEquals(threw, true);
    Deno.removeSync(dir, { recursive: true });
});

Deno.test("includes: no-op when no includes present", () => {
    const dir = makeContentDir({ "index.md": `Hello world` });

    const result = processIncludes(
        `Hello world`,
        join(dir, "index.md"),
        dir,
    );

    assertEquals(result, "Hello world");
    Deno.removeSync(dir, { recursive: true });
});

Deno.test("includes: multiple includes in same file", () => {
    const dir = makeContentDir({
        "index.md": `{@include "a.md"}\n{@include "b.md"}`,
        "a.md": `Part A`,
        "b.md": `Part B`,
    });

    const result = processIncludes(
        `{@include "a.md"}\n{@include "b.md"}`,
        join(dir, "index.md"),
        dir,
    );

    assertStringIncludes(result, "Part A");
    assertStringIncludes(result, "Part B");
    Deno.removeSync(dir, { recursive: true });
});