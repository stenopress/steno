import { join } from "@std/path";
import type { SiteConfig } from "../src/types.ts";
import { buildSite, type BuildState } from "../src/core/build/build.ts";

interface BuildFixture {
  contentDir: string;
  outputDir: string;
  cachePath: string;
  config: SiteConfig;
  state: BuildState;
  mutablePagePath: string;
}

const createdTempDirs = new Set<string>();

function createPageMarkdown(index: number, revision = 0): string {
  return `---
title: "Post ${index}"
category: "category-${index % 8}"
tags:
  - benchmark
  - steno
  - ${index % 5}
---
# Benchmark Post ${index}

This is synthetic benchmark content for page ${index}.
Revision: ${revision}.
`;
}

function createFixture(name: string, pageCount: number): BuildFixture {
  const tempDir = Deno.makeTempDirSync({ prefix: `steno-bench-${name}-` });
  createdTempDirs.add(tempDir);

  const contentDir = join(tempDir, "content");
  const outputDir = join(tempDir, "dist");
  Deno.mkdirSync(contentDir, { recursive: true });

  for (let i = 0; i < pageCount; i++) {
    const section = `section-${i % 12}`;
    const filePath = join(contentDir, section, `post-${i}.md`);
    Deno.mkdirSync(join(contentDir, section), { recursive: true });
    Deno.writeTextFileSync(filePath, createPageMarkdown(i));
  }

  Deno.writeTextFileSync(
    join(contentDir, "index.md"),
    `---
title: "Home"
---
# Home
`,
  );

  return {
    contentDir,
    outputDir,
    cachePath: join(contentDir, ".steno", "build-cache.json"),
    config: {
      title: "Benchmark Site",
      description: "Synthetic benchmark",
      author: "benchmark",
      contentDir,
      output: outputDir,
      custom: {
        shortUrls: true,
      },
    },
    state: {
      signature: null,
      pages: new Map(),
    },
    mutablePagePath: join(contentDir, "section-0", "post-0.md"),
  };
}

function removePathIfPresent(path: string): void {
  try {
    Deno.removeSync(path, { recursive: true });
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) {
      throw error;
    }
  }
}

async function runBuild(config: SiteConfig, state?: BuildState): Promise<void> {
  const originalLog = console.log;
  console.log = () => {};
  try {
    await buildSite({
      config,
      plugins: [],
      hooks: {},
      state,
    });
  } finally {
    console.log = originalLog;
  }
}

const coldFixture = createFixture("cold", 250);
const coldLargeFixture = createFixture("cold-large", 1000);
const coldScaleFixture = createFixture("cold-scale", 4000);
const warmFixture = createFixture("warm", 1000);

await runBuild(warmFixture.config, warmFixture.state);

let changedRevision = 0;

Deno.bench(
  "build (cold, 250 pages)",
  { group: "build-cold", baseline: true },
  async (b) => {
    removePathIfPresent(coldFixture.outputDir);
    removePathIfPresent(coldFixture.cachePath);
    coldFixture.state.signature = null;
    coldFixture.state.pages.clear();

    b.start();
    await runBuild(coldFixture.config, coldFixture.state);
    b.end();
  },
);

Deno.bench("build (cold, 1000 pages)", { group: "build-cold" }, async (b) => {
  removePathIfPresent(coldLargeFixture.outputDir);
  removePathIfPresent(coldLargeFixture.cachePath);
  coldLargeFixture.state.signature = null;
  coldLargeFixture.state.pages.clear();

  b.start();
  await runBuild(coldLargeFixture.config, coldLargeFixture.state);
  b.end();
});

Deno.bench("build (cold, 4000 pages)", { group: "build-cold" }, async (b) => {
  removePathIfPresent(coldScaleFixture.outputDir);
  removePathIfPresent(coldScaleFixture.cachePath);
  coldScaleFixture.state.signature = null;
  coldScaleFixture.state.pages.clear();

  b.start();
  await runBuild(coldScaleFixture.config, coldScaleFixture.state);
  b.end();
});

Deno.bench(
  "build (warm, 1000 pages unchanged)",
  { group: "build-warm", baseline: true },
  async (b) => {
    b.start();
    await runBuild(warmFixture.config, warmFixture.state);
    b.end();
  },
);

Deno.bench(
  "build (atomic incremental, 1 changed page of 1000)",
  { group: "build-warm" },
  async (b) => {
    changedRevision++;
    Deno.writeTextFileSync(
      warmFixture.mutablePagePath,
      createPageMarkdown(0, changedRevision),
    );

    b.start();
    await runBuild(warmFixture.config, warmFixture.state);
    b.end();
  },
);

globalThis.addEventListener("unload", () => {
  for (const tempDir of createdTempDirs) {
    removePathIfPresent(tempDir);
  }
});
