import { assertEquals, assertStringIncludes } from "@std/assert";
import { join } from "@std/path";
import { createDevServerHandler, injectReloadScript } from "./server.ts";

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
        new Request("http://localhost:8000/"),
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
        new Request("http://localhost:8000/style.css"),
      );
      assertEquals(cssResponse.status, 200);
      assertEquals(cssResponse.headers.get("Content-Type"), "text/css");
      assertEquals(await cssResponse.text(), "body { color: red; }");

      const reloadResponse = await handler(
        new Request("http://localhost:8000/reload"),
      );
      assertEquals(reloadResponse.status, 200);
      assertEquals(
        reloadResponse.headers.get("Content-Type"),
        "text/event-stream",
      );
    },
  });
}
