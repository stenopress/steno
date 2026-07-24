import {
  assert,
  assertEquals,
  assertRejects,
  assertStringIncludes,
} from "@std/assert";
import { join } from "@std/path";
import {
  createDevServerHandler,
  findAvailablePort,
  injectReloadScript,
  isTransactionalOutputPath,
  processWatchEvents,
} from "./server.ts";
import { buildSite } from "../core/build/build.ts";

function createEventQueue(): {
  events: AsyncIterable<Deno.FsEvent>;
  push: (event: Deno.FsEvent) => void;
  close: () => void;
} {
  const queued: Deno.FsEvent[] = [];
  const waiting: Array<
    (result: IteratorResult<Deno.FsEvent>) => void
  > = [];
  let closed = false;
  return {
    events: {
      [Symbol.asyncIterator]() {
        return {
          next(): Promise<IteratorResult<Deno.FsEvent>> {
            const event = queued.shift();
            if (event) return Promise.resolve({ value: event, done: false });
            if (closed) {
              return Promise.resolve({
                value: undefined,
                done: true,
              });
            }
            return new Promise((resolve) => waiting.push(resolve));
          },
        };
      },
    },
    push(event) {
      const resolve = waiting.shift();
      if (resolve) resolve({ value: event, done: false });
      else queued.push(event);
    },
    close() {
      closed = true;
      for (const resolve of waiting.splice(0)) {
        resolve({ value: undefined, done: true });
      }
    },
  };
}

export function registerServerTests(): void {
  Deno.test("server: injectReloadScript adds the reload script before body close", () => {
    const html = "<html><body><h1>Hi</h1></body></html>";
    const out = injectReloadScript(html);

    assertStringIncludes(out, 'new EventSource("/reload")');
    assertStringIncludes(out, "</body>");
  });

  Deno.test({
    name: "server: handler serves HTML, CSS and reload stream",
    permissions: { read: true, write: true },
    fn: async () => {
      const tempDir = Deno.makeTempDirSync();
      Deno.writeTextFileSync(
        join(tempDir, "index.html"),
        "<html><body><h1>Home</h1></body></html>",
      );
      Deno.writeTextFileSync(
        join(tempDir, "style.css"),
        "body { color: red; }",
      );

      const { handler } = createDevServerHandler(tempDir);

      const htmlResponse = await handler(
        new Request("http://localhost:5735/"),
      );
      assertEquals(htmlResponse.status, 200);
      assertEquals(
        htmlResponse.headers.get("Content-Type"),
        "text/html",
      );
      assertStringIncludes(
        await htmlResponse.text(),
        'new EventSource("/reload")',
      );

      const cssResponse = await handler(
        new Request("http://localhost:5735/style.css"),
      );
      assertEquals(cssResponse.status, 200);
      assertEquals(cssResponse.headers.get("Content-Type"), "text/css");
      assertEquals(await cssResponse.text(), "body { color: red; }");

      const reloadResponse = await handler(
        new Request("http://localhost:5735/reload"),
      );
      assertEquals(reloadResponse.status, 200);
      assertEquals(
        reloadResponse.headers.get("Content-Type"),
        "text/event-stream",
      );
    },
  });

  Deno.test("server: findAvailablePort returns first free port", async () => {
    const port = await findAvailablePort(5735, {
      maxPort: 5737,
      isPortAvailable: (candidatePort) =>
        Promise.resolve(candidatePort === 5737),
    });

    assertEquals(port, 5737);
  });

  Deno.test("server: findAvailablePort throws when range is exhausted", async () => {
    await assertRejects(
      () =>
        findAvailablePort(5735, {
          maxPort: 5736,
          isPortAvailable: () => Promise.resolve(false),
        }),
      Error,
      "No available port found in range 5735-5736.",
    );
  });

  Deno.test("server: ignores transactional output paths beside dist", () => {
    const root = join(Deno.cwd(), "sandbox");
    const outputDir = join(root, "dist");

    assertEquals(
      isTransactionalOutputPath(join(outputDir, "index.html"), outputDir),
      true,
    );
    assertEquals(
      isTransactionalOutputPath(
        join(root, ".dist.steno-stage-abc123", "assets", "style.css"),
        outputDir,
      ),
      true,
    );
    assertEquals(
      isTransactionalOutputPath(
        join(root, ".dist.steno-backup", "index.html"),
        outputDir,
      ),
      true,
    );
    assertEquals(
      isTransactionalOutputPath(
        join(root, ".dist.steno-backup.retired-abc123", "index.html"),
        outputDir,
      ),
      true,
    );
    assertEquals(
      isTransactionalOutputPath(join(root, "index.md"), outputDir),
      false,
    );
    assertEquals(
      isTransactionalOutputPath(
        join(root, "dist-notes", "index.md"),
        outputDir,
      ),
      false,
    );
  });

  Deno.test({
    name: "server: rapid concurrent edits converge on the latest content",
    permissions: { read: true, write: true },
    fn: async () => {
      const root = await Deno.makeTempDir({ prefix: "steno-rapid-edits-" });
      const contentDir = join(root, "content");
      const outputDir = join(root, "dist");
      const pagePath = join(contentDir, "index.md");
      await Deno.mkdir(contentDir);
      await Deno.writeTextFile(pagePath, "# Revision 0");
      await buildSite({
        config: {
          title: "Rapid edits",
          description: "Watcher stress fixture",
          author: "Steno",
          contentDir,
          output: outputDir,
        },
        plugins: [],
        hooks: {},
      });

      const queue = createEventQueue();
      let buildCount = 0;
      let resolveBuildStarted: (() => void) | undefined;
      const buildStarted = new Promise<void>((resolve) => {
        resolveBuildStarted = resolve;
      });
      const watchLoop = processWatchEvents(queue.events, {
        outputDir,
        buildFn: async () => {
          buildCount++;
          resolveBuildStarted?.();
          resolveBuildStarted = undefined;
          await new Promise((resolve) => setTimeout(resolve, 5));
          await buildSite({
            config: {
              title: "Rapid edits",
              description: "Watcher stress fixture",
              author: "Steno",
              contentDir,
              output: outputDir,
            },
            plugins: [],
            hooks: {},
            dev: true,
          });
        },
      });

      try {
        await Deno.writeTextFile(pagePath, "# Revision 1");
        queue.push({ kind: "modify", paths: [pagePath] });
        await buildStarted;

        for (let revision = 2; revision <= 20; revision++) {
          await Deno.writeTextFile(pagePath, `# Revision ${revision}`);
          queue.push({ kind: "modify", paths: [pagePath] });
        }
        await Deno.writeTextFile(pagePath, "# Revision final");
        queue.push({ kind: "modify", paths: [pagePath] });

        const deadline = Date.now() + 5_000;
        while (Date.now() < deadline) {
          const html = await Deno.readTextFile(join(outputDir, "index.html"));
          if (html.includes("Revision final")) break;
          await new Promise((resolve) => setTimeout(resolve, 10));
        }

        assert(buildCount > 0, "Expected at least one watched rebuild");
        assertStringIncludes(
          await Deno.readTextFile(join(outputDir, "index.html")),
          "Revision final",
        );
      } finally {
        queue.close();
        await watchLoop;
        await Deno.remove(root, { recursive: true });
      }
    },
  });
}
