import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { dirname, fromFileUrl, join } from "@std/path";

const integrationDir = dirname(fromFileUrl(import.meta.url));
const repositoryRoot = dirname(integrationDir);
const stenoEntry = join(repositoryRoot, "mod.ts");
const decoder = new TextDecoder();

interface FixtureOptions {
  plugin?: string;
  pluginOptions?: Record<string, unknown>;
  body?: string;
  theme?: string;
}

async function createFixture(options: FixtureOptions = {}): Promise<string> {
  const root = await Deno.makeTempDir({ prefix: "steno-ecosystem-" });
  const contentDir = join(root, "content");
  await Deno.mkdir(join(contentDir, ".steno"), { recursive: true });
  await Deno.mkdir(join(contentDir, "posts"), { recursive: true });

  const plugin = options.plugin
    ? `plugins:
  - package: "${options.plugin}"
    mode: trusted
${
      options.pluginOptions
        ? `    options: ${JSON.stringify(options.pluginOptions)}\n`
        : ""
    }`
    : "";
  const theme = options.theme
    ? `custom:
  theme: "${options.theme}"
`
    : "";
  await Deno.writeTextFile(
    join(contentDir, ".steno", "config.yml"),
    `title: "Compatibility"
description: "Official ecosystem compatibility fixture"
author: "Steno"
contentDir: "content"
output: "dist"
${plugin}${theme}`,
  );
  await Deno.writeTextFile(
    join(contentDir, "index.md"),
    `---
title: Home
layout: layout
---

${options.body ?? "# Compatibility"}
`,
  );
  await Deno.writeTextFile(
    join(contentDir, "posts", "hello.md"),
    `---
title: Hello
description: Ecosystem post
date: 2026-07-29
layout: layout
---

# Hello
`,
  );
  return root;
}

async function build(root: string): Promise<string> {
  const result = await new Deno.Command(Deno.execPath(), {
    args: [
      "run",
      "-A",
      stenoEntry,
      "build",
      "--config",
      "content/.steno/config.yml",
    ],
    cwd: root,
    stdout: "piped",
    stderr: "piped",
  }).output();
  const output = decoder.decode(result.stdout) + decoder.decode(result.stderr);
  assertEquals(result.success, true, output);
  assertEquals(output.includes("Failed to load plugin"), false, output);
  return output;
}

async function removeFixture(root: string): Promise<void> {
  await Deno.remove(root, { recursive: true });
}

Deno.test({
  name: "ecosystem: plugin-shiki@1.0.0 highlights code",
  permissions: { env: true, net: true, read: true, run: true, write: true },
  fn: async () => {
    const root = await createFixture({
      plugin: "jsr:@steno/plugin-shiki@1.0.0",
      pluginOptions: { theme: "github-dark" },
      body: "# Code\n\n```ts\nconst answer: number = 42;\n```",
    });
    try {
      await build(root);
      const html = await Deno.readTextFile(join(root, "dist", "index.html"));
      assertStringIncludes(html, 'class="shiki github-dark"');
      assertStringIncludes(html, "const");
    } finally {
      await removeFixture(root);
    }
  },
});

Deno.test({
  name: "ecosystem: plugin-seo@0.7.0 generates feeds and sitemap",
  permissions: { env: true, net: true, read: true, run: true, write: true },
  fn: async () => {
    const root = await createFixture({
      plugin: "jsr:@steno/plugin-seo@0.7.0",
      pluginOptions: {
        siteUrl: "https://example.com",
        title: "Compatibility Feed",
        description: "Official ecosystem feed",
        authorName: "Steno",
      },
    });
    try {
      await build(root);
      const sitemap = await Deno.readTextFile(
        join(root, "dist", "sitemap.xml"),
      );
      const rss = await Deno.readTextFile(join(root, "dist", "feed.xml"));
      const atom = await Deno.readTextFile(join(root, "dist", "atom.xml"));
      assertStringIncludes(sitemap, "https://example.com/posts/hello.html");
      assertStringIncludes(rss, "Compatibility Feed");
      assertStringIncludes(rss, "Ecosystem post");
      assertStringIncludes(atom, "Compatibility Feed");
    } finally {
      await removeFixture(root);
    }
  },
});

Deno.test({
  name: "ecosystem: plugin-image@1.0.0 optimizes theme images",
  permissions: { env: true, net: true, read: true, run: true, write: true },
  fn: async () => {
    const root = await createFixture({
      plugin: "jsr:@steno/plugin-image@1.0.0",
      pluginOptions: {
        widths: [1],
        formats: ["webp"],
        quality: 70,
      },
      theme: "./theme",
    });
    try {
      const themeDir = join(root, "theme");
      await Deno.mkdir(join(themeDir, "layouts"), { recursive: true });
      await Deno.mkdir(join(themeDir, "assets"), { recursive: true });
      await Deno.writeTextFile(
        join(themeDir, "theme.yaml"),
        'name: "compat-image"\nversion: "1.0.0"\n',
      );
      await Deno.writeTextFile(
        join(themeDir, "layouts", "layout.tau"),
        '<!doctype html><img src="/assets/pixel.png" />{@html content}',
      );
      const png = Uint8Array.from(
        atob(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
        ),
        (character) => character.charCodeAt(0),
      );
      await Deno.writeFile(join(themeDir, "assets", "pixel.png"), png);

      await build(root);
      assert(
        (await Deno.stat(join(root, "dist", "assets", "pixel-1.webp"))).isFile,
      );
      const html = await Deno.readTextFile(join(root, "dist", "index.html"));
      assertStringIncludes(html, 'loading="lazy"');
      assertStringIncludes(html, 'width="1"');
      assertStringIncludes(html, 'height="1"');
    } finally {
      await removeFixture(root);
    }
  },
});

Deno.test({
  name: "ecosystem: plugin-tailwind@0.3.0 generates utility CSS",
  permissions: { env: true, net: true, read: true, run: true, write: true },
  fn: async () => {
    const root = await createFixture({
      plugin: "jsr:@steno/plugin-tailwind@0.3.0",
      pluginOptions: { minify: true },
      body: '<p class="font-bold text-red-500">Styled</p>',
    });
    try {
      await build(root);
      const css = await Deno.readTextFile(
        join(root, "dist", "assets", "tailwind.css"),
      );
      assertStringIncludes(css, ".font-bold");
      assertStringIncludes(css, ".text-red-500");
    } finally {
      await removeFixture(root);
    }
  },
});

for (
  const [name, assets] of [
    ["theme-minimal", ["style.css"]],
    ["theme-docs-minimal", ["style.css"]],
    [
      "theme-marketing-minimal",
      ["style.css", "site.js", "steno-logo.svg", "tau.svg"],
    ],
  ] as const
) {
  Deno.test({
    name: `ecosystem: bundled ${name} builds with assets`,
    permissions: { env: true, read: true, run: true, write: true },
    fn: async () => {
      const root = await createFixture({
        theme: join(repositoryRoot, "packages", name),
      });
      try {
        await build(root);
        const html = await Deno.readTextFile(join(root, "dist", "index.html"));
        assertStringIncludes(html, "Compatibility");
        for (const asset of assets) {
          assert(
            (await Deno.stat(join(root, "dist", "assets", asset))).isFile,
            `${name} did not copy ${asset}`,
          );
        }
      } finally {
        await removeFixture(root);
      }
    },
  });
}
