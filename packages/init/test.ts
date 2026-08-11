import { assertEquals, assertMatch, assertRejects, assertThrows } from "@std/assert";
import { join } from "@std/path";
import {
  OnboardingError,
  parsePluginChoices,
  parseThemeChoice,
  runOnboarding,
} from "./src/onboarding.ts";

// helpers

async function scaffold(opts: Parameters<typeof runOnboarding>[1] = {}): Promise<string> {
  const dir = await Deno.makeTempDir({ prefix: "steno_init_test_" });
  await runOnboarding(dir, {
    title: "Test Site",
    description: "A test",
    author: "Tester",
    plugins: [],
    theme: "minimal",
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

// tests

Deno.test("onboarding: scaffolds all expected files", async () => {
  const dir = await scaffold();

  const expected = [["content", ".steno", "config.yml"], ["content", "index.md"], ["deno.json"]];

  for (const segments of expected) {
    assertEquals(
      fileExists(dir, ...segments),
      true,
      `Expected file to exist: ${segments.join("/")}`,
    );
  }

  // local theme dir should NOT be created anymore
  assertEquals(fileExists(dir, "themes"), false, "themes/ directory should not be scaffolded");

  // mod.ts should NOT be created anymore
  assertEquals(fileExists(dir, "mod.ts"), false, "mod.ts should not be scaffolded");

  await Deno.remove(dir, { recursive: true });
});

Deno.test("onboarding: config.yml contains correct title/author", async () => {
  const dir = await scaffold({ title: "My Blog", author: "Alice" });

  const config = readFile(dir, "content", ".steno", "config.yml");
  assertMatch(config, /title: "My Blog"/);
  assertMatch(config, /author: "Alice"/);

  await Deno.remove(dir, { recursive: true });
});

Deno.test("onboarding: config.yml uses JSR theme package for minimal", async () => {
  const dir = await scaffold({ theme: "minimal" });

  const config = readFile(dir, "content", ".steno", "config.yml");
  assertMatch(config, /theme: "jsr:@steno\/theme-minimal@\^0\.10\.0"/);

  await Deno.remove(dir, { recursive: true });
});

Deno.test("onboarding: config.yml uses JSR theme package for docs-minimal", async () => {
  const dir = await scaffold({ theme: "docs-minimal" });

  const config = readFile(dir, "content", ".steno", "config.yml");
  assertMatch(config, /theme: "jsr:@steno\/theme-docs-minimal@\^0\.10\.0"/);

  await Deno.remove(dir, { recursive: true });
});

Deno.test("onboarding: config.yml uses a local theme path when set", async () => {
  const dir = await scaffold({
    theme: undefined,
    localTheme: "./my-theme",
  });

  const config = readFile(dir, "content", ".steno", "config.yml");
  assertMatch(config, /theme: "\.\/my-theme"/);

  await Deno.remove(dir, { recursive: true });
});

Deno.test("onboarding: pins a custom theme version for an official theme", async () => {
  const dir = await scaffold({
    theme: "minimal",
    themeVersion: "^1.2.3",
  });

  const config = readFile(dir, "content", ".steno", "config.yml");
  assertMatch(config, /theme: "jsr:@steno\/theme-minimal@\^1\.2\.3"/);

  await Deno.remove(dir, { recursive: true });
});

Deno.test("onboarding: pins a custom @steno/steno version in deno.json", async () => {
  const dir = await scaffold({ stenoVersion: "^1.0.0" });

  const denoJson = JSON.parse(readFile(dir, "deno.json"));
  assertEquals(denoJson.imports["@steno/steno"], "jsr:@steno/steno@^1.0.0");

  await Deno.remove(dir, { recursive: true });
});

Deno.test("onboarding: respects custom content/output dirs, short URLs, and dev port", async () => {
  const dir = await Deno.makeTempDir({ prefix: "steno_init_test_" });
  await runOnboarding(dir, {
    title: "Test Site",
    description: "A test",
    author: "Tester",
    plugins: [],
    theme: "minimal",
    contentDir: "src",
    outputDir: "public",
    shortUrls: false,
    devPort: 6100,
  });

  const config = readFile(dir, "src", ".steno", "config.yml");
  assertMatch(config, /contentDir: "src"/);
  assertMatch(config, /output: "public"/);
  assertMatch(config, /shortUrls: false/);
  assertMatch(config, /devPort: 6100/);
  assertEquals(fileExists(dir, "src", "index.md"), true);

  await Deno.remove(dir, { recursive: true });
});

Deno.test("onboarding: config.yml uses a community theme package when set", async () => {
  const dir = await scaffold({
    theme: undefined,
    communityTheme: "jsr:@user/theme-custom",
  });

  const config = readFile(dir, "content", ".steno", "config.yml");
  assertMatch(config, /theme: "jsr:@user\/theme-custom"/);

  await Deno.remove(dir, { recursive: true });
});

Deno.test(
  "onboarding: official theme takes priority over community theme when both set",
  async () => {
    const dir = await scaffold({
      theme: "minimal",
      communityTheme: "jsr:@user/theme-custom",
    });

    const config = readFile(dir, "content", ".steno", "config.yml");
    assertMatch(config, /theme: "jsr:@steno\/theme-minimal@\^0\.10\.0"/);

    await Deno.remove(dir, { recursive: true });
  },
);

Deno.test("onboarding: config.yml uses JSR theme package for marketing-minimal", async () => {
  const dir = await scaffold({ theme: "marketing-minimal" });

  const config = readFile(dir, "content", ".steno", "config.yml");
  assertMatch(config, /theme: "jsr:@steno\/theme-marketing-minimal@\^0\.10\.0"/);

  await Deno.remove(dir, { recursive: true });
});

Deno.test("onboarding: index.md contains site title", async () => {
  const dir = await scaffold({ title: "Hello World" });

  const index = readFile(dir, "content", "index.md");
  assertMatch(index, /# Welcome to Hello World/);
  assertMatch(index, /layout: layout/);

  await Deno.remove(dir, { recursive: true });
});

Deno.test("onboarding: deno.json scaffold has build/dev tasks", async () => {
  const dir = await scaffold();

  const denoJson = JSON.parse(readFile(dir, "deno.json"));
  assertEquals(typeof denoJson.tasks.build, "string");
  assertEquals(typeof denoJson.tasks.dev, "string");
  assertEquals(denoJson.imports["@steno/steno"], "jsr:@steno/steno@^0.11.2");
  assertMatch(denoJson.tasks.build, /--allow-read=\./);
  assertMatch(denoJson.tasks.build, /--allow-write=\./);
  assertMatch(denoJson.tasks.build, /--allow-net=jsr\.io/);
  assertEquals(denoJson.tasks.build.includes("--allow-env"), true);
  assertMatch(denoJson.tasks.build, /@steno\/steno build/);
  assertMatch(denoJson.tasks.dev, /--allow-net=127\.0\.0\.1,0\.0\.0\.0,jsr\.io/);

  await Deno.remove(dir, { recursive: true });
});

Deno.test("onboarding: config.yml includes selected plugins", async () => {
  const dir = await scaffold({ plugins: ["tailwind", "shiki"] });

  const config = readFile(dir, "content", ".steno", "config.yml");
  assertMatch(config, /plugins:/);
  assertMatch(config, /package: "jsr:@steno\/plugin-tailwind/);
  assertMatch(config, /package: "jsr:@steno\/plugin-shiki/);
  assertEquals(config.match(/mode: trusted/g)?.length, 2);

  await Deno.remove(dir, { recursive: true });
});

Deno.test("onboarding: config.yml has no plugins section when none selected", async () => {
  const dir = await scaffold({ plugins: [] });

  const config = readFile(dir, "content", ".steno", "config.yml");
  assertEquals(config.includes("plugins:"), false);

  await Deno.remove(dir, { recursive: true });
});

Deno.test("onboarding: config.yml includes all official plugins", async () => {
  const dir = await scaffold({
    plugins: ["tailwind", "shiki", "seo", "docs", "search", "og", "image"],
  });

  const config = readFile(dir, "content", ".steno", "config.yml");
  assertMatch(config, /package: "jsr:@steno\/plugin-tailwind/);
  assertMatch(config, /package: "jsr:@steno\/plugin-shiki/);
  assertMatch(config, /package: "jsr:@steno\/plugin-seo/);
  assertMatch(config, /package: "jsr:@steno\/plugin-docs/);
  assertMatch(config, /package: "jsr:@steno\/plugin-search/);
  assertMatch(config, /package: "jsr:@steno\/plugin-og/);
  assertMatch(config, /package: "jsr:@steno\/plugin-image/);
  assertEquals(config.match(/mode: trusted/g)?.length, 7);

  await Deno.remove(dir, { recursive: true });
});

Deno.test("onboarding: config.yml includes community plugins in isolated mode", async () => {
  const dir = await scaffold({
    plugins: [],
    communityPlugins: ["jsr:@user/plugin-foo", "npm:some-plugin"],
  });

  const config = readFile(dir, "content", ".steno", "config.yml");
  assertMatch(config, /plugins:/);
  assertMatch(config, /package: "jsr:@user\/plugin-foo"/);
  assertMatch(config, /package: "npm:some-plugin"/);
  assertEquals(config.match(/mode: isolated/g)?.length, 2);
  assertEquals(config.includes("mode: trusted"), false);

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
        plugins: [],
        theme: "minimal",
      }),
    OnboardingError,
    "already exist",
  );

  await Deno.remove(dir, { recursive: true });
});

Deno.test("onboarding: --force allows overwrite of existing files", async () => {
  const dir = await scaffold();

  await runOnboarding(dir, {
    title: "Overwritten",
    description: "Overwrite test",
    author: "Bob",
    plugins: [],
    theme: "minimal",
    force: true,
  });

  const config = readFile(dir, "content", ".steno", "config.yml");
  assertMatch(config, /title: "Overwritten"/);

  await Deno.remove(dir, { recursive: true });
});

Deno.test("onboarding: does not overwrite existing deno.json", async () => {
  const dir = await Deno.makeTempDir({ prefix: "steno_init_preexist_" });

  Deno.writeTextFileSync(join(dir, "deno.json"), '{"custom":true}\n');

  await runOnboarding(dir, {
    title: "T",
    description: "D",
    author: "A",
    plugins: [],
    theme: "minimal",
  });

  assertEquals(readFile(dir, "deno.json"), '{"custom":true}\n');

  await Deno.remove(dir, { recursive: true });
});

Deno.test("onboarding: parses theme choices", () => {
  assertEquals(parseThemeChoice(undefined), undefined);
  assertEquals(parseThemeChoice("minimal"), "minimal");
  assertEquals(parseThemeChoice(" DOCS-MINIMAL "), "docs-minimal");
  assertEquals(parseThemeChoice("marketing-minimal"), "marketing-minimal");
});

Deno.test("onboarding: rejects unknown themes", () => {
  assertThrows(
    () => parseThemeChoice("unknown"),
    OnboardingError,
    "Available themes: minimal, docs-minimal, marketing-minimal",
  );
});

Deno.test("onboarding: parses plugin choices", () => {
  assertEquals(parsePluginChoices(undefined), []);
  assertEquals(parsePluginChoices("tailwind"), ["tailwind"]);
  assertEquals(parsePluginChoices("tailwind, shiki"), ["tailwind", "shiki"]);
  assertEquals(parsePluginChoices("seo,docs,search,og"), ["seo", "docs", "search", "og"]);
});

Deno.test("onboarding: rejects unknown plugin choices", () => {
  assertThrows(
    () => parsePluginChoices("not-a-plugin"),
    OnboardingError,
    "Available plugins: tailwind, shiki, seo, docs, search, og, image",
  );
});
