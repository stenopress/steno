import { assertEquals, assertRejects, assertStringIncludes } from "@std/assert";
import { join } from "@std/path";
import { Steno, StenoDiagnosticError } from "../../mod.ts";

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
  Deno.writeTextFileSync(join(contentDir, "index.md"), `---\ntitle: "Home"\n---\n# Hello\n`);
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
  return (steno as unknown as { loadRuntime: () => Promise<unknown> }).loadRuntime();
}

/** Same as {@link reloadRuntime}, but forces `dev` mode explicitly - the
 * permissive path a real `steno dev` rebuild takes. */
function reloadRuntimeDev(steno: Steno): Promise<unknown> {
  return (steno as unknown as { loadRuntime: (dev: boolean) => Promise<unknown> }).loadRuntime(
    true,
  );
}

/** Waits for the constructor's initial `loadRuntime()` call to settle. */
function initialLoad(steno: Steno): Promise<unknown> {
  return (steno as unknown as { runtimeLoadingPromise: Promise<unknown> }).runtimeLoadingPromise;
}

export function registerStenoTests(): void {
  Deno.test({
    name: "Steno: reuses a trusted plugin instance across rebuilds when config.plugins is unchanged",
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
        assertEquals(callCount(f), 2, "changing plugin options should force a reload");

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

  Deno.test({
    name: "Steno: a production build throws StenoDiagnosticError when the configured theme fails to load",
    permissions: { read: true, write: true, run: true, env: true },
    fn: async () => {
      const tempDir = Deno.makeTempDirSync();
      const contentDir = join(tempDir, "content");
      const configPath = join(contentDir, ".steno", "config.yml");
      Deno.mkdirSync(join(contentDir, ".steno"), { recursive: true });
      Deno.writeTextFileSync(join(contentDir, "index.md"), `---\ntitle: "Home"\n---\n# Hello\n`);
      // A local theme directory with no theme.yaml and no mod.ts/theme.ts/
      // index.ts - resolvable as a path, but nothing loadable inside it.
      Deno.mkdirSync(join(contentDir, "broken-theme"), { recursive: true });
      Deno.writeTextFileSync(
        configPath,
        `title: "Test"
description: ""
author: ""
contentDir: "${contentDir}"
output: "${join(tempDir, "dist")}"
theme: "${join(contentDir, "broken-theme")}"
`,
      );

      try {
        const error = await assertRejects(
          () => new Steno(configPath, true).ready(),
          StenoDiagnosticError,
        );
        assertEquals(error.diagnostics.length, 1);
        assertEquals(error.diagnostics[0].code, "theme-load-failed");
        assertStringIncludes(error.diagnostics[0].message, "mod.ts");
      } finally {
        Deno.removeSync(tempDir, { recursive: true });
      }
    },
  });

  Deno.test({
    name: "Steno: a production build throws StenoDiagnosticError when a configured plugin fails to load",
    permissions: { read: true, write: true, run: true, env: true },
    fn: async () => {
      const tempDir = Deno.makeTempDirSync();
      const contentDir = join(tempDir, "content");
      const configPath = join(contentDir, ".steno", "config.yml");
      const pluginPath = join(tempDir, "broken-plugin.ts");
      Deno.mkdirSync(join(contentDir, ".steno"), { recursive: true });
      Deno.writeTextFileSync(join(contentDir, "index.md"), `---\ntitle: "Home"\n---\n# Hello\n`);
      // Exports a default that isn't a function.
      Deno.writeTextFileSync(pluginPath, `export default { not: "a factory" };\n`);
      Deno.writeTextFileSync(
        configPath,
        `title: "Test"
description: ""
author: ""
contentDir: "${contentDir}"
output: "${join(tempDir, "dist")}"
custom:
  pluginSourcePolicy:
    allowLocal: true
plugins:
  - package: "file://${pluginPath}"
`,
      );

      try {
        const error = await assertRejects(
          () => new Steno(configPath, true).ready(),
          StenoDiagnosticError,
        );
        assertEquals(error.diagnostics.length, 1);
        assertEquals(error.diagnostics[0].code, "plugin-load-failed");
      } finally {
        Deno.removeSync(tempDir, { recursive: true });
      }
    },
  });

  Deno.test({
    name: "Steno: dev mode does not throw on a broken theme, only reports it",
    permissions: { read: true, write: true, run: true, env: true },
    fn: async () => {
      const tempDir = Deno.makeTempDirSync();
      const contentDir = join(tempDir, "content");
      const configPath = join(contentDir, ".steno", "config.yml");
      Deno.mkdirSync(join(contentDir, ".steno"), { recursive: true });
      Deno.writeTextFileSync(join(contentDir, "index.md"), `---\ntitle: "Home"\n---\n# Hello\n`);
      Deno.mkdirSync(join(contentDir, "broken-theme"), { recursive: true });
      Deno.writeTextFileSync(
        configPath,
        `title: "Test"
description: ""
author: ""
contentDir: "${contentDir}"
output: "${join(tempDir, "dist")}"
theme: "${join(contentDir, "broken-theme")}"
`,
      );

      try {
        const steno = new Steno(configPath, false);
        // The constructor's own initial load still defaults to strict here
        // (this test process's Deno.args don't contain "dev"), so it
        // rejects same as the production-build tests above - acknowledge
        // that first so it isn't left an unhandled rejection. A real
        // `steno dev` process's args always do contain "dev", so its
        // construction-time load already takes the lenient path this test
        // exercises explicitly below via loadRuntime(true).
        await initialLoad(steno).catch(() => {});
        await reloadRuntimeDev(steno); // should not throw
      } finally {
        Deno.removeSync(tempDir, { recursive: true });
      }
    },
  });

  Deno.test({
    name: "Steno: warns (but does not fail the build) when two plugins share a name",
    permissions: { read: true, write: true, run: true, env: true },
    fn: async () => {
      const tempDir = Deno.makeTempDirSync();
      const contentDir = join(tempDir, "content");
      const configPath = join(contentDir, ".steno", "config.yml");
      const pluginPath = join(tempDir, "dup-plugin.ts");
      Deno.mkdirSync(join(contentDir, ".steno"), { recursive: true });
      Deno.writeTextFileSync(join(contentDir, "index.md"), `---\ntitle: "Home"\n---\n# Hello\n`);
      Deno.writeTextFileSync(
        pluginPath,
        `import type { StenoPlugin } from "${import.meta.resolve("../types.ts")}";
export default function (tag: unknown): StenoPlugin {
  return { name: "dup" };
}
`,
      );
      Deno.writeTextFileSync(
        configPath,
        `title: "Test"
description: ""
author: ""
contentDir: "${contentDir}"
output: "${join(tempDir, "dist")}"
custom:
  pluginSourcePolicy:
    allowLocal: true
plugins:
  - package: "file://${pluginPath}"
  - package: "file://${pluginPath}"
    options: { tag: "second" }
`,
      );

      const warnings: string[] = [];
      const originalWarn = console.warn;
      console.warn = (...args) => warnings.push(args.join(" "));
      try {
        const steno = new Steno(configPath, true);
        await steno.ready();
      } finally {
        console.warn = originalWarn;
        Deno.removeSync(tempDir, { recursive: true });
      }

      const joined = warnings.join("\n");
      assertStringIncludes(joined, "plugin-name-duplicate");
      assertStringIncludes(joined, '"dup"');
    },
  });
}
