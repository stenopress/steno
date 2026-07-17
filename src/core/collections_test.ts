import { assertEquals, assertStringIncludes } from "@std/assert";
import { join } from "@std/path";
import { buildCollections } from "./collections.ts";
import type { SiteConfig } from "../types.ts";

function makeConfig(overrides: Partial<SiteConfig> = {}): SiteConfig {
  return {
    title: "Test Site",
    description: "Test",
    author: "Tester",
    ...overrides,
  };
}

export function registerCollectionTests(): void {
  Deno.test({
    name: "collections: auto-detects collection from subdirectory",
    permissions: { read: true, write: true },
    fn: async () => {
      const tempDir = Deno.makeTempDirSync();
      const contentDir = join(tempDir, "content");
      Deno.mkdirSync(join(contentDir, "blog"), { recursive: true });

      Deno.writeTextFileSync(
        join(contentDir, "blog", "first-post.md"),
        `---\ntitle: "First Post"\ndate: "2024-01-01"\n---\nHello world.`,
      );

      const collections = await buildCollections(contentDir, makeConfig(), []);

      assertEquals(Object.keys(collections), ["blog"]);
      assertEquals(collections.blog.items.length, 1);
      assertEquals(collections.blog.items[0].frontmatter.title, "First Post");
    },
  });

  Deno.test({
    name: "collections: root-level pages are not collected",
    permissions: { read: true, write: true },
    fn: async () => {
      const tempDir = Deno.makeTempDirSync();
      const contentDir = join(tempDir, "content");
      Deno.mkdirSync(contentDir, { recursive: true });

      Deno.writeTextFileSync(
        join(contentDir, "index.md"),
        `---\ntitle: "Home"\n---\nWelcome.`,
      );

      const collections = await buildCollections(contentDir, makeConfig(), []);

      assertEquals(Object.keys(collections).length, 0);
    },
  });

  Deno.test({
    name: "collections: item contains url, frontmatter and rendered content",
    permissions: { read: true, write: true },
    fn: async () => {
      const tempDir = Deno.makeTempDirSync();
      const contentDir = join(tempDir, "content");
      Deno.mkdirSync(join(contentDir, "blog"), { recursive: true });

      Deno.writeTextFileSync(
        join(contentDir, "blog", "my-post.md"),
        `---\ntitle: "My Post"\n---\n# Heading`,
      );

      const collections = await buildCollections(contentDir, makeConfig(), []);
      const item = collections.blog.items[0];

      assertEquals(item.url, "/blog/my-post.html");
      assertEquals(item.frontmatter.title, "My Post");
      assertStringIncludes(item.content, "<h1>Heading</h1>");
    },
  });

  Deno.test({
    name: "collections: shortUrls affects item url",
    permissions: { read: true, write: true },
    fn: async () => {
      const tempDir = Deno.makeTempDirSync();
      const contentDir = join(tempDir, "content");
      Deno.mkdirSync(join(contentDir, "blog"), { recursive: true });

      Deno.writeTextFileSync(
        join(contentDir, "blog", "my-post.md"),
        `---\ntitle: "My Post"\n---\nContent.`,
      );

      const collections = await buildCollections(
        contentDir,
        makeConfig({ custom: { shortUrls: true } }),
        [],
      );

      assertEquals(collections.blog.items[0].url, "/blog/my-post");
    },
  });

  Deno.test({
    name: "collections: multiple collections are detected independently",
    permissions: { read: true, write: true },
    fn: async () => {
      const tempDir = Deno.makeTempDirSync();
      const contentDir = join(tempDir, "content");
      Deno.mkdirSync(join(contentDir, "blog"), { recursive: true });
      Deno.mkdirSync(join(contentDir, "projects"), { recursive: true });

      Deno.writeTextFileSync(
        join(contentDir, "blog", "post.md"),
        `---\ntitle: "Post"\n---\nBlog.`,
      );
      Deno.writeTextFileSync(
        join(contentDir, "projects", "steno.md"),
        `---\ntitle: "Steno"\n---\nProject.`,
      );

      const collections = await buildCollections(contentDir, makeConfig(), []);

      assertEquals(collections.blog.items.length, 1);
      assertEquals(collections.projects.items.length, 1);
    },
  });

  Deno.test({
    name: "collections: sortBy sorts items ascending by default",
    permissions: { read: true, write: true },
    fn: async () => {
      const tempDir = Deno.makeTempDirSync();
      const contentDir = join(tempDir, "content");
      Deno.mkdirSync(join(contentDir, "blog"), { recursive: true });

      Deno.writeTextFileSync(
        join(contentDir, "blog", "b.md"),
        `---\ntitle: "B Post"\ndate: "2024-02-01"\n---\nB.`,
      );
      Deno.writeTextFileSync(
        join(contentDir, "blog", "a.md"),
        `---\ntitle: "A Post"\ndate: "2024-01-01"\n---\nA.`,
      );

      const collections = await buildCollections(
        contentDir,
        makeConfig({ collections: { blog: { sortBy: "date", order: "asc" } } }),
        [],
      );

      assertEquals(collections.blog.items[0].frontmatter.date, "2024-01-01");
      assertEquals(collections.blog.items[1].frontmatter.date, "2024-02-01");
    },
  });

  Deno.test({
    name: "collections: sortBy desc reverses order",
    permissions: { read: true, write: true },
    fn: async () => {
      const tempDir = Deno.makeTempDirSync();
      const contentDir = join(tempDir, "content");
      Deno.mkdirSync(join(contentDir, "blog"), { recursive: true });

      Deno.writeTextFileSync(
        join(contentDir, "blog", "a.md"),
        `---\ntitle: "A Post"\ndate: "2024-01-01"\n---\nA.`,
      );
      Deno.writeTextFileSync(
        join(contentDir, "blog", "b.md"),
        `---\ntitle: "B Post"\ndate: "2024-02-01"\n---\nB.`,
      );

      const collections = await buildCollections(
        contentDir,
        makeConfig({
          collections: { blog: { sortBy: "date", order: "desc" } },
        }),
        [],
      );

      assertEquals(collections.blog.items[0].frontmatter.date, "2024-02-01");
      assertEquals(collections.blog.items[1].frontmatter.date, "2024-01-01");
    },
  });

  Deno.test({
    name: "collections: limit caps the number of items",
    permissions: { read: true, write: true },
    fn: async () => {
      const tempDir = Deno.makeTempDirSync();
      const contentDir = join(tempDir, "content");
      Deno.mkdirSync(join(contentDir, "blog"), { recursive: true });

      for (let i = 1; i <= 5; i++) {
        Deno.writeTextFileSync(
          join(contentDir, "blog", `post-${i}.md`),
          `---\ntitle: "Post ${i}"\n---\nContent.`,
        );
      }

      const collections = await buildCollections(
        contentDir,
        makeConfig({ collections: { blog: { limit: 3 } } }),
        [],
      );

      assertEquals(collections.blog.items.length, 3);
    },
  });

  Deno.test({
    name: "collections: html transforms from plugins are applied",
    permissions: { read: true, write: true },
    fn: async () => {
      const tempDir = Deno.makeTempDirSync();
      const contentDir = join(tempDir, "content");
      Deno.mkdirSync(join(contentDir, "blog"), { recursive: true });

      Deno.writeTextFileSync(
        join(contentDir, "blog", "post.md"),
        `---\ntitle: "Post"\n---\nHello.`,
      );

      const plugin = {
        name: "test",
        transformHtml: (html: string) => html + "<!-- transformed -->",
      };

      const collections = await buildCollections(contentDir, makeConfig(), [
        plugin,
      ]);

      assertStringIncludes(
        collections.blog.items[0].content,
        "<!-- transformed -->",
      );
    },
  });

  Deno.test({
    name: "collections: .steno directory is ignored",
    permissions: { read: true, write: true },
    fn: async () => {
      const tempDir = Deno.makeTempDirSync();
      const contentDir = join(tempDir, "content");
      Deno.mkdirSync(join(contentDir, ".steno"), { recursive: true });

      Deno.writeTextFileSync(
        join(contentDir, ".steno", "config.md"),
        `---\ntitle: "Internal"\n---\nInternal.`,
      );

      const collections = await buildCollections(contentDir, makeConfig(), []);

      assertEquals(Object.keys(collections).length, 0);
    },
  });

  Deno.test({
    name: "collections: collections are injected into layout render context",
    permissions: { read: true, write: true, net: true },
    fn: async () => {
      const tempDir = Deno.makeTempDirSync();
      const contentDir = join(tempDir, "content");
      const outputDir = join(tempDir, "dist");
      const themeDir = join(tempDir, "theme");

      Deno.mkdirSync(join(contentDir, ".steno"), { recursive: true });
      Deno.mkdirSync(join(contentDir, "blog"), { recursive: true });
      Deno.mkdirSync(join(themeDir, "layouts"), { recursive: true });

      const configPath = join(contentDir, ".steno", "config.yml");
      Deno.writeTextFileSync(
        configPath,
        `
title: "Collections Test"
description: "Test"
author: "Tester"
contentDir: "${contentDir}"
output: "${outputDir}"
custom:
  theme: "${themeDir}"
`,
      );

      Deno.writeTextFileSync(
        join(themeDir, "theme.yaml"),
        `name: "test"\nversion: "1.0.0"\n`,
      );

      Deno.writeTextFileSync(
        join(themeDir, "layouts", "layout.scr"),
        `{#each collections.blog.items as post}<a href={post.url}>{post.frontmatter.title}</a>{/each}`,
      );

      Deno.writeTextFileSync(
        join(contentDir, "index.md"),
        `---\ntitle: "Home"\nlayout: "layout"\n---\nHome.`,
      );

      Deno.writeTextFileSync(
        join(contentDir, "blog", "hello.md"),
        `---\ntitle: "Hello"\n---\nHello.`,
      );

      const { Steno } = await import("../../mod.ts");
      const steno = new Steno(configPath, false);
      await steno.build();

      const html = Deno.readTextFileSync(join(outputDir, "index.html"));
      assertStringIncludes(html, "Hello");
      assertStringIncludes(html, "/blog/hello.html");

      Deno.removeSync(tempDir, { recursive: true });
    },
  });

  Deno.test({
    name: "collections: filter removes items based on frontmatter",
    permissions: { read: true, write: true },
    fn: async () => {
      const tempDir = Deno.makeTempDirSync();
      const contentDir = join(tempDir, "content");
      Deno.mkdirSync(join(contentDir, "blog"), { recursive: true });

      // Create one draft post and one published post
      Deno.writeTextFileSync(
        join(contentDir, "blog", "draft.md"),
        `---\ntitle: "Draft"\ndraft: true\n---\nDraft content.`,
      );
      Deno.writeTextFileSync(
        join(contentDir, "blog", "live.md"),
        `---\ntitle: "Live"\ndraft: false\n---\nLive content.`,
      );

      // Filter for draft: false
      const collections = await buildCollections(
        contentDir,
        makeConfig({
          collections: {
            blog: { filter: { draft: false } },
          },
        }),
        [],
      );

      assertEquals(collections.blog.items.length, 1);
      assertEquals(collections.blog.items[0].frontmatter.title, "Live");
    },
  });

  Deno.test({
    name: "collections: throws when required field is missing",
    permissions: { read: true, write: true },
    fn: async () => {
      const tempDir = Deno.makeTempDirSync();
      const contentDir = join(tempDir, "content");
      Deno.mkdirSync(join(contentDir, "blog"), { recursive: true });

      Deno.writeTextFileSync(
        join(contentDir, "blog", "post.md"),
        `---\ntitle: "My Post"\n---\nContent.`,
      );

      let threw = false;
      try {
        await buildCollections(
          contentDir,
          makeConfig({
            collections: {
              blog: {
                schema: {
                  title: { type: "string", required: true },
                  date: { type: "string", required: true }, // missing
                },
              },
            },
          }),
          [],
        );
      } catch (e) {
        threw = true;
        assertStringIncludes((e as Error).message, "date");
        assertStringIncludes((e as Error).message, "required but missing");
        assertStringIncludes((e as Error).message, "blog");
      }

      assertEquals(threw, true);
      Deno.removeSync(tempDir, { recursive: true });
    },
  });

  Deno.test({
    name: "collections: throws when field has wrong type",
    permissions: { read: true, write: true },
    fn: async () => {
      const tempDir = Deno.makeTempDirSync();
      const contentDir = join(tempDir, "content");
      Deno.mkdirSync(join(contentDir, "blog"), { recursive: true });

      Deno.writeTextFileSync(
        join(contentDir, "blog", "post.md"),
        `---\ntitle: 42\n---\nContent.`, // title is number, not string
      );

      let threw = false;
      try {
        await buildCollections(
          contentDir,
          makeConfig({
            collections: {
              blog: {
                schema: {
                  title: { type: "string", required: true },
                },
              },
            },
          }),
          [],
        );
      } catch (e) {
        threw = true;
        assertStringIncludes((e as Error).message, "title");
        assertStringIncludes((e as Error).message, `type "string"`);
        assertStringIncludes((e as Error).message, `got "number"`);
      }

      assertEquals(threw, true);
      Deno.removeSync(tempDir, { recursive: true });
    },
  });

  Deno.test({
    name:
      "collections: passes when all required fields are present and correct",
    permissions: { read: true, write: true },
    fn: async () => {
      const tempDir = Deno.makeTempDirSync();
      const contentDir = join(tempDir, "content");
      Deno.mkdirSync(join(contentDir, "blog"), { recursive: true });

      Deno.writeTextFileSync(
        join(contentDir, "blog", "post.md"),
        `---\ntitle: "My Post"\ndate: "2026-01-01"\ntags:\n  - deno\n---\nContent.`,
      );

      // should not throw
      const collections = await buildCollections(
        contentDir,
        makeConfig({
          collections: {
            blog: {
              schema: {
                title: { type: "string", required: true },
                date: { type: "string", required: true },
                tags: { type: "array", required: false },
              },
            },
          },
        }),
        [],
      );

      assertEquals(collections.blog.items.length, 1);
      Deno.removeSync(tempDir, { recursive: true });
    },
  });

  Deno.test({
    name: "collections: optional field missing does not throw",
    permissions: { read: true, write: true },
    fn: async () => {
      const tempDir = Deno.makeTempDirSync();
      const contentDir = join(tempDir, "content");
      Deno.mkdirSync(join(contentDir, "blog"), { recursive: true });

      Deno.writeTextFileSync(
        join(contentDir, "blog", "post.md"),
        `---\ntitle: "My Post"\n---\nContent.`,
      );

      // tags is optional — should not throw even though it's missing
      const collections = await buildCollections(
        contentDir,
        makeConfig({
          collections: {
            blog: {
              schema: {
                title: { type: "string", required: true },
                tags: { type: "array", required: false },
              },
            },
          },
        }),
        [],
      );

      assertEquals(collections.blog.items.length, 1);
      Deno.removeSync(tempDir, { recursive: true });
    },
  });

  Deno.test({
    name: "collections: error message includes page path and collection name",
    permissions: { read: true, write: true },
    fn: async () => {
      const tempDir = Deno.makeTempDirSync();
      const contentDir = join(tempDir, "content");
      Deno.mkdirSync(join(contentDir, "blog"), { recursive: true });

      Deno.writeTextFileSync(
        join(contentDir, "blog", "my-post.md"),
        `---\ntitle: "Post"\n---\nContent.`,
      );

      let errorMessage = "";
      try {
        await buildCollections(
          contentDir,
          makeConfig({
            collections: {
              blog: {
                schema: {
                  date: { type: "string", required: true },
                },
              },
            },
          }),
          [],
        );
      } catch (e) {
        errorMessage = (e as Error).message;
      }

      assertStringIncludes(errorMessage, "blog/my-post.md");
      assertStringIncludes(errorMessage, "blog");
    },
  });
}
