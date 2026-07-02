import { assertEquals, assertMatch, assertRejects } from "@std/assert";
import { join } from "@std/path";
import { OnboardingError, runOnboarding } from "./src/onboarding.ts";

// helpers

async function scaffold(
  opts: Parameters<typeof runOnboarding>[1] = {},
): Promise<string> {
  const dir = await Deno.makeTempDir({ prefix: "steno_init_test_" });
  await runOnboarding(dir, {
    title: "Test Site",
    description: "A test",
    author: "Tester",
    theme: "starter",
    ...opts,
  });
  return dir;
}

function readFile(dir: string, ...segments: string[]): string {
  return Deno.readTextFileSync(join(dir, ...segments));
}

function fileExists(dir: string, ...segments: string[]): boolean {
  try {
    Deno.statSync(join(dir, ...segments));
    return true;
  } catch {
    return false;
  }
}

// tetsd

Deno.test("onboarding: scaffolds all expected files", async () => {
  const dir = await scaffold();

  const expected = [
    ["content", ".steno", "config.yml"],
    ["content", "index.md"],
    ["themes", "starter", "theme.yaml"],
    ["themes", "starter", "layouts", "layout.scr"],
    ["themes", "starter", "components", "header.scr"],
    ["themes", "starter", "components", "footer.scr"],
    ["themes", "starter", "assets", "style.css"],
    ["mod.ts"],
    ["deno.json"],
  ];

  for (const segments of expected) {
    assertEquals(
      fileExists(dir, ...segments),
      true,
      `Expected file to exist: ${segments.join("/")}`,
    );
  }

  await Deno.remove(dir, { recursive: true });
});

Deno.test("onboarding: config.yml contains correct title/author", async () => {
  const dir = await scaffold({ title: "My Blog", author: "Alice" });

  const config = readFile(dir, "content", ".steno", "config.yml");
  assertMatch(config, /title: "My Blog"/);
  assertMatch(config, /author: "Alice"/);
  assertMatch(config, /theme: "\.\/themes\/starter"/);

  await Deno.remove(dir, { recursive: true });
});

Deno.test("onboarding: index.md contains site title", async () => {
  const dir = await scaffold({ title: "Hello World" });

  const index = readFile(dir, "content", "index.md");
  assertMatch(index, /# Welcome to Hello World/);
  assertMatch(index, /layout: layout/);

  await Deno.remove(dir, { recursive: true });
});

Deno.test("onboarding: layout.scr is a valid HTML shell", async () => {
  const dir = await scaffold();

  const layout = readFile(dir, "themes", "starter", "layouts", "layout.scr");
  assertMatch(layout, /<!doctype html>/);
  assertMatch(layout, /<Header \/>/);
  assertMatch(layout, /<Footer \/>/);
  assertMatch(layout, /\{@html content\}/);

  await Deno.remove(dir, { recursive: true });
});

Deno.test("onboarding: theme.yaml has correct name and components", async () => {
  const dir = await scaffold();

  const theme = readFile(dir, "themes", "starter", "theme.yaml");
  assertMatch(theme, /name: "Starter Theme"/);
  assertMatch(theme, /header: "components\/header\.scr"/);
  assertMatch(theme, /footer: "components\/footer\.scr"/);

  await Deno.remove(dir, { recursive: true });
});

Deno.test("onboarding: deno.json scaffold has build/dev tasks", async () => {
  const dir = await scaffold();

  const denoJson = JSON.parse(readFile(dir, "deno.json"));
  assertEquals(typeof denoJson.tasks.build, "string");
  assertEquals(typeof denoJson.tasks.dev, "string");
  assertEquals(denoJson.imports["@steno/steno"], "jsr:@steno/steno");

  await Deno.remove(dir, { recursive: true });
});

Deno.test("onboarding: throws OnboardingError when files exist (no force)", async () => {
  const dir = await scaffold();

  await assertRejects(
    () =>
      runOnboarding(dir, {
        title: "Again",
        description: "Again",
        author: "Again",
        theme: "starter",
      }),
    OnboardingError,
    "already exist",
  );

  await Deno.remove(dir, { recursive: true });
});

Deno.test("onboarding: --force allows overwrite of existing files", async () => {
  const dir = await scaffold();

  // should not throw
  await runOnboarding(dir, {
    title: "Overwritten",
    description: "Overwrite test",
    author: "Bob",
    theme: "starter",
    force: true,
  });

  const config = readFile(dir, "content", ".steno", "config.yml");
  assertMatch(config, /title: "Overwritten"/);

  await Deno.remove(dir, { recursive: true });
});

Deno.test("onboarding: does not overwrite existing mod.ts or deno.json", async () => {
  const dir = await Deno.makeTempDir({ prefix: "steno_init_preexist_" });

  Deno.writeTextFileSync(join(dir, "mod.ts"), "// custom entry\n");
  Deno.writeTextFileSync(join(dir, "deno.json"), '{"custom":true}\n');

  await runOnboarding(dir, {
    title: "T",
    description: "D",
    author: "A",
    theme: "starter",
  });

  assertEquals(readFile(dir, "mod.ts"), "// custom entry\n");
  assertEquals(readFile(dir, "deno.json"), '{"custom":true}\n');

  await Deno.remove(dir, { recursive: true });
});
