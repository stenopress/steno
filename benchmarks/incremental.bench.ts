import { join } from "@std/path";
import type { SiteConfig } from "../src/types.ts";
import { buildSite, type BuildState } from "../src/core/build/build.ts";
import { Theme } from "../src/theme/theme.ts";

interface IncrementalFixture {
  root: string;
  contentDir: string;
  config: SiteConfig;
  theme: Theme;
  state: BuildState;
  changedPagePath: string;
  collectionConsumers: number;
  revision: number;
  renderCount: number;
}

const fixtures: IncrementalFixture[] = [];

async function createFixture(
  name: string,
  pageCount: number,
  collectionConsumers: number,
): Promise<IncrementalFixture> {
  const root = Deno.makeTempDirSync({ prefix: `steno-incremental-${name}-` });
  fixtures.push({
    root,
    contentDir: "",
    config: {} as SiteConfig,
    theme: null as unknown as Theme,
    state: { signature: null, pages: new Map() },
    changedPagePath: "",
    collectionConsumers,
    revision: 0,
    renderCount: 0,
  });
  const fixture = fixtures.at(-1)!;
  const contentDir = join(root, "content");
  const themeDir = join(root, "theme");
  Deno.mkdirSync(contentDir, { recursive: true });
  Deno.mkdirSync(join(themeDir, "layouts"), { recursive: true });
  Deno.mkdirSync(join(themeDir, "components"), { recursive: true });
  Deno.writeTextFileSync(
    join(themeDir, "theme.yaml"),
    `name: "incremental-benchmark"\nversion: "1.0.0"\ncomponents:\n  Badge: "components/Badge.tau"\n`,
  );
  Deno.writeTextFileSync(
    join(themeDir, "components", "Badge.tau"),
    `<span>Shared component</span>`,
  );
  Deno.writeTextFileSync(
    join(themeDir, "layouts", "plain.tau"),
    `<html><body><Badge />{@html content}</body></html>`,
  );
  Deno.writeTextFileSync(
    join(themeDir, "layouts", "collection.tau"),
    `<html><body><Badge />{collections.posts.items.length}{@html content}</body></html>`,
  );

  for (let i = 0; i < pageCount; i++) {
    const isConsumer = i < collectionConsumers;
    const dir = isConsumer ? "posts" : "docs";
    const title = isConsumer ? `Post ${i}` : `Doc ${i}`;
    const layout = isConsumer ? "collection" : "plain";
    const pagePath = join(contentDir, dir, `page-${i}.md`);
    Deno.mkdirSync(join(contentDir, dir), { recursive: true });
    Deno.writeTextFileSync(
      pagePath,
      `---\ntitle: "${title}"\nlayout: "${layout}"\n---\n# ${title}\n\nBenchmark page ${i}.\n`,
    );
    if (i === 0) fixture.changedPagePath = pagePath;
  }

  fixture.contentDir = contentDir;
  fixture.config = {
    title: "Incremental benchmark",
    description: "Selective dependency benchmark",
    author: "benchmark",
    contentDir,
    output: join(root, "dist"),
    custom: { theme: themeDir },
  };
  fixture.theme = await Theme.loadFromDirectory(themeDir);
  const renderLayout = fixture.theme.renderLayout.bind(fixture.theme);
  fixture.theme.renderLayout = async (...args: Parameters<Theme["renderLayout"]>) => {
    fixture.renderCount++;
    return await renderLayout(...args);
  };
  await runBuild(fixture);
  if (fixture.renderCount !== pageCount) {
    throw new Error(
      `${name}: initial build rendered ${fixture.renderCount} layouts; expected ${pageCount}`,
    );
  }
  fixture.renderCount = 0;
  return fixture;
}

async function runBuild(fixture: IncrementalFixture): Promise<void> {
  const originalLog = console.log;
  console.log = () => {};
  try {
    await buildSite({
      config: fixture.config,
      theme: fixture.theme,
      plugins: [],
      hooks: {},
      state: fixture.state,
    });
  } finally {
    console.log = originalLog;
  }
}

function registerBenchmark(name: string, fixture: IncrementalFixture): void {
  Deno.bench(name, { group: "build-selective" }, async (b) => {
    fixture.revision++;
    const revision = String(fixture.revision).padStart(8, "0");
    const layout = fixture.collectionConsumers > 0 ? "collection" : "plain";
    Deno.writeTextFileSync(
      fixture.changedPagePath,
      `---\ntitle: "Page 0 ${revision}"\nlayout: "${layout}"\n---\n# Page 0\n\nBenchmark revision ${fixture.revision}.\n`,
    );

    fixture.renderCount = 0;
    b.start();
    await runBuild(fixture);
    b.end();

    const expectedRenderCount = fixture.collectionConsumers || 1;
    if (fixture.renderCount !== expectedRenderCount) {
      throw new Error(
        `${name}: rendered ${fixture.renderCount} pages; expected ${expectedRenderCount}`,
      );
    }
  });
}

const smallFixture = await createFixture("small", 100, 10);
const plainFixture = await createFixture("plain", 1000, 0);
const selectiveFixture = await createFixture("selective", 1000, 100);
const sharedFixture = await createFixture("shared", 1000, 1000);

registerBenchmark("build (themed selective collection, 10 of 100 pages)", smallFixture);
registerBenchmark("build (themed plain baseline, 1 of 1000 pages)", plainFixture);
registerBenchmark("build (themed selective collection, 100 of 1000 pages)", selectiveFixture);
registerBenchmark("build (themed shared collection, 1000 of 1000 pages)", sharedFixture);

globalThis.addEventListener("unload", () => {
  for (const fixture of fixtures) {
    try {
      Deno.removeSync(fixture.root, { recursive: true });
    } catch (error) {
      if (!(error instanceof Deno.errors.NotFound)) throw error;
    }
  }
});
