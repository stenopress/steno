import { assertEquals, assertRejects, assertStringIncludes } from "@std/assert";
import { join } from "@std/path";
import {
  createDevServerHandler,
  findAvailablePort,
  injectReloadScript,
  isTransactionalOutputPath,
} from "./server.ts";

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
}
