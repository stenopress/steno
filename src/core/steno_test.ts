import { assertEquals } from "@std/assert";
import { join } from "@std/path";
import { Steno } from "../../mod.ts";

interface Fixture {
  tempDir: string;
  contentDir: string;
  configPath: string;
  countFile: string;
  cleanup: () => void;
  writeConfig: (pluginOptions: string) => void;
}

/**
 * A trusted plugin whose factory appends one line to `countFile` every time
 * it runs, so a test can observe how many times `loadPlugins` actually
 * re-instantiated it across repeated dev-server rebuilds without needing
 * to reach into `Steno`'s private plugin list.
 */
function createFixture(): Fixture {
  const tempDir = Deno.makeTempDirSync();
  const contentDir = join(tempDir, "content");
  const configPath = join(contentDir, ".steno", "config.yml");
  const countFile = join(tempDir, "calls.txt");
  const pluginPath = join(tempDir, "counting-plugin.ts");

  Deno.mkdirSync(join(contentDir, ".steno"), { recursive: true });
  Deno.mkdirSync(join(contentDir, "theme", "layouts"), { recursive: true });
  Deno.writeTextFileSync(
    join(contentDir, "theme", "layouts", "layout.tau"),
    `<html><body>{@html content}</body></html>`,
  );
  Deno.writeTextFileSync(
    join(contentDir, "theme", "theme.yaml"),
    `name: "counting-test-theme"\nversion: "1.0.0"\n`,
  );
  Deno.writeTextFileSync(
    join(contentDir, "index.md"),
    `---\ntitle: "Home"\n---\n# Hello\n`,
  );
  Deno.writeTextFileSync(countFile, "");
  Deno.writeTextFileSync(
    pluginPath,
    `
    import type { StenoPlugin } from "${import.meta.resolve("../types.ts")}";
    export default function(options: Record<string, unknown> = {}): StenoPlugin {
      Deno.writeTextFileSync(${JSON.stringify(countFile)}, "x", { append: true });
      return { name: "counting-plugin", ...options };
    }
    `,
  );

  return {
    tempDir,
    contentDir,
    configPath,
    countFile,
    cleanup: () => Deno.removeSync(tempDir, { recursive: true }),
    writeConfig: (pluginOptions) => {
      Deno.writeTextFileSync(
        configPath,
        `title: "Test"
description: ""
author: ""
contentDir: "${contentDir}"
output: "${join(tempDir, "dist")}"
theme: "${join(contentDir, "theme")}"
custom:
  pluginSourcePolicy:
    allowLocal: true
plugins:
  - package: "file://${pluginPath}"
    options: { ${pluginOptions} }
`,
      );
    },
  };
}

function callCount(f: Fixture): number {
  return Deno.readTextFileSync(f.countFile).length;
}

/**
 * `loadRuntime` is private - it's exactly what the dev-server rebuild loop
 * calls on every file change (`executeBuild(true)` -> `this.loadRuntime()`),
 * so calling it directly here is the most faithful way to exercise that
 * path without spinning up a real dev server and file watcher.
 */
function reloadRuntime(steno: Steno): Promise<unknown> {
  return (steno as unknown as { loadRuntime: () => Promise<unknown> })
    .loadRuntime();
}

/** Waits for the constructor's initial `loadRuntime()` call to settle. */
function initialLoad(steno: Steno): Promise<unknown> {
  return (steno as unknown as { runtimeLoadingPromise: Promise<unknown> })
    .runtimeLoadingPromise;
}

export function registerStenoTests(): void {
  Deno.test({
    name:
      "Steno: reuses a trusted plugin instance across rebuilds when config.plugins is unchanged",
    permissions: { read: true, write: true, run: true, env: true },
    fn: async () => {
      const f = createFixture();
      try {
        f.writeConfig('tag: "v1"');

        const steno = new Steno(f.configPath, false);
        await initialLoad(steno);
        assertEquals(callCount(f), 1);

        await reloadRuntime(steno);
        await reloadRuntime(steno);
        assertEquals(
          callCount(f),
          1,
          "the plugin factory should not re-run when config.plugins didn't change",
        );
      } finally {
        f.cleanup();
      }
    },
  });

  Deno.test({
    name: "Steno: re-instantiates a trusted plugin once its config.plugins entry actually changes",
    permissions: { read: true, write: true, run: true, env: true },
    fn: async () => {
      const f = createFixture();
      try {
        f.writeConfig('tag: "v1"');

        const steno = new Steno(f.configPath, false);
        await initialLoad(steno);
        assertEquals(callCount(f), 1);

        f.writeConfig('tag: "v2"');
        await reloadRuntime(steno);
        assertEquals(
          callCount(f),
          2,
          "changing plugin options should force a reload",
        );

        await reloadRuntime(steno);
        assertEquals(
          callCount(f),
          2,
          "the new config should itself now be cached across further rebuilds",
        );
      } finally {
        f.cleanup();
      }
    },
  });
}
