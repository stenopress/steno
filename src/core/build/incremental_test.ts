import { assertEquals, assertStringIncludes } from "@std/assert";
import { join } from "@std/path";
import { Steno } from "../../../mod.ts";
import type { Theme } from "../../theme/theme.ts";

interface Fixture {
  root: string;
  content: string;
  output: string;
  theme: string;
  cleanup(): void;
  write(relPath: string, source: string): string;
}

function createFixture(): Fixture {
  const root = Deno.makeTempDirSync({ prefix: "steno-incremental-" });
  const content = join(root, "content");
  const output = join(root, "dist");
  const theme = join(root, "theme");
  Deno.mkdirSync(join(content, ".steno"), { recursive: true });
  Deno.mkdirSync(join(theme, "layouts"), { recursive: true });
  Deno.mkdirSync(join(theme, "components"), { recursive: true });
  Deno.mkdirSync(join(theme, "assets"), { recursive: true });
  Deno.writeTextFileSync(
    join(theme, "theme.yaml"),
    `name: "incremental-test"\nversion: "1.0.0"\ncomponents:\n  Badge: "components/Badge.tau"\n`,
  );
  Deno.writeTextFileSync(
    join(theme, "layouts", "layout.tau"),
    `<html><body>{@html content}</body></html>`,
  );
  Deno.writeTextFileSync(join(theme, "components", "Badge.tau"), `<b>Badge</b>`);
  Deno.writeTextFileSync(
    join(content, ".steno", "config.yml"),
    `title: "Incremental test"\ndescription: ""\nauthor: ""\ncontentDir: "${content}"\noutput: "${output}"\ntheme: "${theme}"\n`,
  );
  return {
    root,
    content,
    output,
    theme,
    cleanup: () => Deno.removeSync(root, { recursive: true }),
    write: (relPath, source) => {
      const path = join(content, relPath);
      Deno.mkdirSync(join(path, ".."), { recursive: true });
      Deno.writeTextFileSync(path, source);
      return path;
    },
  };
}

async function buildAndCount(configPath: string, rendered: string[]): Promise<void> {
  const steno = new Steno(configPath, false);
  const internals = steno as unknown as {
    runtimeLoadingPromise: Promise<void>;
    theme: Theme;
  };
  await internals.runtimeLoadingPromise;
  const theme = internals.theme;
  const originalRenderLayout = theme.renderLayout.bind(theme);
  theme.renderLayout = async (...args: Parameters<Theme["renderLayout"]>) => {
    const [name, content] = args;
    rendered.push(`${name}:${content}`);
    return await originalRenderLayout(...args);
  };
  await steno.build();
}

Deno.test({
  name: "incremental: shared theme inputs rerender only their consumers",
  permissions: { read: true, write: true },
  fn: async () => {
    const f = createFixture();
    try {
      Deno.writeTextFileSync(
        join(f.theme, "layouts", "shared.tau"),
        `<html><body><Badge />{@html content}</body></html>`,
      );
      Deno.writeTextFileSync(
        join(f.theme, "layouts", "independent.tau"),
        `<html><body>Independent v1{@html content}</body></html>`,
      );
      Deno.writeTextFileSync(join(f.theme, "components", "Badge.tau"), `<b>Badge v1</b>`);
      f.write("index.md", `---\ntitle: Home\nlayout: shared\n---\nHome body.`);
      f.write("about.md", `---\ntitle: About\nlayout: shared\n---\nAbout body.`);
      f.write("plain.md", `---\ntitle: Plain\nlayout: independent\n---\nPlain body.`);

      const rendered: string[] = [];
      const configPath = join(f.content, ".steno", "config.yml");
      await buildAndCount(configPath, rendered);
      assertEquals(rendered.length, 3);

      rendered.length = 0;
      await buildAndCount(configPath, rendered);
      assertEquals(rendered, []);

      rendered.length = 0;
      Deno.writeTextFileSync(join(f.theme, "components", "Badge.tau"), `<b>Badge v2</b>`);
      await buildAndCount(configPath, rendered);
      assertEquals(rendered.map((entry) => entry.split(":", 1)[0]).sort(), ["shared", "shared"]);
      assertStringIncludes(Deno.readTextFileSync(join(f.output, "index.html")), "Badge v2");
      assertStringIncludes(Deno.readTextFileSync(join(f.output, "plain.html")), "Independent v1");

      rendered.length = 0;
      Deno.writeTextFileSync(
        join(f.theme, "layouts", "independent.tau"),
        `<html><body>Independent v2{@html content}</body></html>`,
      );
      await buildAndCount(configPath, rendered);
      assertEquals(
        rendered.map((entry) => entry.split(":", 1)[0]),
        ["independent"],
      );
      assertStringIncludes(Deno.readTextFileSync(join(f.output, "plain.html")), "Independent v2");

      rendered.length = 0;
      f.write("about.md", `---\ntitle: About\nlayout: shared\n---\nChanged about body.`);
      await buildAndCount(configPath, rendered);
      assertEquals(
        rendered.map((entry) => entry.split(":", 1)[0]),
        ["shared"],
      );
      assertStringIncludes(
        Deno.readTextFileSync(join(f.output, "about.html")),
        "Changed about body.",
      );
    } finally {
      f.cleanup();
    }
  },
});

Deno.test({
  name: "incremental: Markdown include chains invalidate consumers and preserve unrelated pages",
  permissions: { read: true, write: true },
  fn: async () => {
    const f = createFixture();
    try {
      Deno.writeTextFileSync(
        join(f.theme, "layouts", "layout.tau"),
        `<html><body>{@html content}</body></html>`,
      );
      f.write("index.md", `---\ntitle: Home\n---\n{@include \"partials/outer.md\"}`);
      f.write("partials/outer.md", `Outer {@include \"inner.md\"}`);
      f.write("partials/inner.md", `Leaf v1`);
      f.write("other.md", `---\ntitle: Other\n---\nNo include.`);

      const rendered: string[] = [];
      const configPath = join(f.content, ".steno", "config.yml");
      await buildAndCount(configPath, rendered);
      assertStringIncludes(Deno.readTextFileSync(join(f.output, "index.html")), "Leaf v1");

      rendered.length = 0;
      f.write("partials/inner.md", `Leaf v2`);
      await buildAndCount(configPath, rendered);
      assertEquals(rendered.length, 3);
      assertEquals(
        rendered.every((entry) => entry.startsWith("layout:")),
        true,
      );
      assertStringIncludes(Deno.readTextFileSync(join(f.output, "index.html")), "Leaf v2");
      assertStringIncludes(Deno.readTextFileSync(join(f.output, "other.html")), "No include.");
    } finally {
      f.cleanup();
    }
  },
});

Deno.test({
  name: "incremental: persisted snapshots invalidate changed template inputs in a fresh build",
  permissions: { read: true, write: true },
  fn: async () => {
    const f = createFixture();
    try {
      Deno.writeTextFileSync(
        join(f.theme, "layouts", "layout.tau"),
        `<html><body>Layout v1{@html content}</body></html>`,
      );
      f.write("index.md", `---\ntitle: Home\nlayout: layout\n---\nHome body.`);
      f.write("about.md", `---\ntitle: About\nlayout: layout\n---\nAbout body.`);
      const configPath = join(f.content, ".steno", "config.yml");
      await new Steno(configPath, false).build();

      Deno.writeTextFileSync(
        join(f.theme, "layouts", "layout.tau"),
        `<html><body>Layout v2{@html content}</body></html>`,
      );
      const rendered: string[] = [];
      await buildAndCount(configPath, rendered);

      assertEquals(
        rendered.map((entry) => entry.split(":", 1)[0]),
        ["layout", "layout"],
      );
      assertStringIncludes(Deno.readTextFileSync(join(f.output, "about.html")), "Layout v2");
    } finally {
      f.cleanup();
    }
  },
});

Deno.test({
  name: "incremental: data reads and missing keys invalidate only pages reading that data file",
  permissions: { read: true, write: true },
  fn: async () => {
    const f = createFixture();
    try {
      Deno.writeTextFileSync(
        join(f.theme, "layouts", "site-data.tau"),
        `<html><body>{data.site.message}{@html content}</body></html>`,
      );
      Deno.writeTextFileSync(
        join(f.theme, "layouts", "other-data.tau"),
        `<html><body>{data.other.message}{@html content}</body></html>`,
      );
      Deno.writeTextFileSync(
        join(f.theme, "layouts", "missing-key.tau"),
        `<html><body>{data.site.added}{@html content}</body></html>`,
      );
      Deno.writeTextFileSync(
        join(f.theme, "layouts", "dynamic-branch.tau"),
        `<html><body>{#if data.site.enabled}enabled{:else}disabled{/if}{@html content}</body></html>`,
      );
      f.write("_data/site.json", `{"message":"site-v1","enabled":false}`);
      f.write("_data/other.json", `{"message":"other-v1"}`);
      f.write("site.md", `---\ntitle: Site\nlayout: site-data\n---\nSite page.`);
      f.write("other.md", `---\ntitle: Other\nlayout: other-data\n---\nOther page.`);
      f.write("missing.md", `---\ntitle: Missing\nlayout: missing-key\n---\nMissing page.`);
      f.write("branch.md", `---\ntitle: Branch\nlayout: dynamic-branch\n---\nBranch page.`);
      const rendered: string[] = [];
      const configPath = join(f.content, ".steno", "config.yml");
      await buildAndCount(configPath, rendered);

      rendered.length = 0;
      f.write("_data/site.json", `{"message":"site-v2","added":"now present","enabled":true}`);
      await buildAndCount(configPath, rendered);

      assertEquals(rendered.map((entry) => entry.split(":", 1)[0]).sort(), [
        "dynamic-branch",
        "missing-key",
        "site-data",
      ]);
      assertStringIncludes(Deno.readTextFileSync(join(f.output, "site.html")), "site-v2");
      assertStringIncludes(Deno.readTextFileSync(join(f.output, "missing.html")), "now present");
      assertStringIncludes(Deno.readTextFileSync(join(f.output, "branch.html")), "enabled");
      assertStringIncludes(Deno.readTextFileSync(join(f.output, "other.html")), "other-v1");
    } finally {
      f.cleanup();
    }
  },
});

Deno.test({
  name: "incremental: theme asset changes rerender only pages that embed its hashed path",
  permissions: { read: true, write: true },
  fn: async () => {
    const f = createFixture();
    try {
      Deno.writeTextFileSync(
        join(f.theme, "layouts", "asset.tau"),
        `<html><head><link href="/assets/{assets["style.css"]}"></head><body>{@html content}</body></html>`,
      );
      Deno.writeTextFileSync(
        join(f.theme, "layouts", "plain.tau"),
        `<html><body>Plain{@html content}</body></html>`,
      );
      Deno.writeTextFileSync(join(f.theme, "assets", "style.css"), `body { color: red; }`);
      f.write("asset.md", `---\ntitle: Asset\nlayout: asset\n---\nAsset page.`);
      f.write("plain.md", `---\ntitle: Plain\nlayout: plain\n---\nPlain page.`);
      const rendered: string[] = [];
      const configPath = join(f.content, ".steno", "config.yml");
      await buildAndCount(configPath, rendered);

      rendered.length = 0;
      Deno.writeTextFileSync(join(f.theme, "assets", "style.css"), `body { color: blue; }`);
      await buildAndCount(configPath, rendered);

      assertEquals(
        rendered.map((entry) => entry.split(":", 1)[0]),
        ["asset"],
      );
      assertStringIncludes(Deno.readTextFileSync(join(f.output, "asset.html")), "assets/style.");
      assertStringIncludes(Deno.readTextFileSync(join(f.output, "plain.html")), "Plain");
    } finally {
      f.cleanup();
    }
  },
});

Deno.test({
  name: "incremental: collection consumers rerender when membership changes",
  permissions: { read: true, write: true },
  fn: async () => {
    const f = createFixture();
    try {
      Deno.writeTextFileSync(
        join(f.theme, "layouts", "layout.tau"),
        `<html><body>{@html content}</body></html>`,
      );
      Deno.writeTextFileSync(
        join(f.theme, "layouts", "posts.tau"),
        `<html><body>{#each collections.posts.items as post}<p>{post.frontmatter.title}</p>{/each}{@html content}</body></html>`,
      );
      Deno.writeTextFileSync(
        join(f.theme, "layouts", "docs.tau"),
        `<html><body>{#each collections.docs.items as doc}<p>{doc.frontmatter.title}</p>{/each}{@html content}</body></html>`,
      );
      f.write("posts-index.md", `---\ntitle: Posts\nlayout: posts\n---\nPosts index.`);
      f.write("docs-index.md", `---\ntitle: Docs\nlayout: docs\n---\nDocs index.`);
      f.write("posts/one.md", `---\ntitle: First post\n---\nFirst body.`);
      f.write("docs/one.md", `---\ntitle: First doc\n---\nFirst body.`);
      const rendered: string[] = [];
      const configPath = join(f.content, ".steno", "config.yml");
      await buildAndCount(configPath, rendered);
      assertStringIncludes(Deno.readTextFileSync(join(f.output, "posts-index.html")), "First post");

      rendered.length = 0;
      f.write("posts/two.md", `---\ntitle: Second post\n---\nSecond body.`);
      await buildAndCount(configPath, rendered);

      assertEquals(rendered.length, 2);
      assertEquals(rendered.map((entry) => entry.split(":", 1)[0]).sort(), ["layout", "posts"]);
      assertStringIncludes(
        Deno.readTextFileSync(join(f.output, "posts-index.html")),
        "Second post",
      );
      assertStringIncludes(Deno.readTextFileSync(join(f.output, "docs-index.html")), "First doc");
    } finally {
      f.cleanup();
    }
  },
});

Deno.test({
  name: "incremental: changing from an opaque output hook to no hook restores clean HTML",
  permissions: { read: true, write: true },
  fn: async () => {
    const f = createFixture();
    try {
      Deno.writeTextFileSync(
        join(f.content, ".steno", "config.yml"),
        `title: "Incremental test"\ndescription: ""\nauthor: ""\ncontentDir: "${f.content}"\noutput: "${f.output}"\n`,
      );
      f.write("index.md", `---\ntitle: Home\n---\nClean page.`);
      const configPath = join(f.content, ".steno", "config.yml");
      await new Steno(configPath, false, {
        afterPage: ({ stagingPath }) => {
          if (!stagingPath) throw new Error("Expected afterPage to receive a staging path.");
          Deno.writeTextFileSync(stagingPath, "<p>hook output</p>");
        },
      }).build();
      assertEquals(Deno.readTextFileSync(join(f.output, "index.html")), "<p>hook output</p>");

      await new Steno(configPath, false).build();

      const html = Deno.readTextFileSync(join(f.output, "index.html"));
      assertStringIncludes(html, "Clean page.");
      assertEquals(html.includes("hook output"), false);
    } finally {
      f.cleanup();
    }
  },
});
