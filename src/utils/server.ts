import { join } from "@std/path";

const reloadScript = `
  <script>
    if (typeof(EventSource) !== "undefined") {
      const eventSource = new EventSource("/reload");
      eventSource.onmessage = function(_event) {
        location.reload();
      };
    } else {
      console.log("Sorry, your browser does not support server-sent events...");
    }
  </script>
`;

const textEncoder = new TextEncoder();

/** Internal state for connected reload clients. */
interface DevServerState {
  clients: Set<ReadableStreamDefaultController<Uint8Array>>;
}

/** Injects the live-reload script before the closing body tag. */
export function injectReloadScript(html: string): string {
  return html.replace(/<\/body>/, `${reloadScript}</body>`);
}

/** Creates the dev-server handler and reload broadcaster. */
export function createDevServerHandler(outputDir: string): {
  handler: (req: Request) => Promise<Response>;
  broadcastReload: () => void;
} {
  const state: DevServerState = { clients: new Set() };

  const broadcastReload = () => {
    for (const client of state.clients) {
      client.enqueue(textEncoder.encode("data: reload\n\n"));
    }
  };

  const handler = async (req: Request): Promise<Response> => {
    const url = new URL(req.url);

    if (url.pathname === "/reload") {
      let client: ReadableStreamDefaultController<Uint8Array> | undefined;
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          client = controller;
          state.clients.add(controller);
          controller.enqueue(textEncoder.encode("retry: 1000\n\n"));
        },
        cancel() {
          if (client) state.clients.delete(client);
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }

    let filePath = join(outputDir, url.pathname);
    if (url.pathname === "/") {
      filePath = join(outputDir, "index.html");
    }

    try {
      let fileContents = await Deno.readTextFile(filePath);
      const contentType = filePath.endsWith(".css") ? "text/css" : "text/html";
      if (contentType === "text/html") {
        fileContents = injectReloadScript(fileContents);
      }
      return new Response(fileContents, {
        status: 200,
        headers: { "Content-Type": contentType },
      });
    } catch {
      return new Response("404 - Not Found", { status: 404 });
    }
  };

  return { handler, broadcastReload };
}

/** Serves the built site and rebuilds on filesystem changes. */
export async function startDevServer(
  outputDir: string,
  buildFn: () => void | Promise<void>,
  watchDir: string = "content",
): Promise<void> {
  const { handler, broadcastReload } = createDevServerHandler(outputDir);

  await buildFn();

  const watcher = Deno.watchFs([watchDir]);

  Deno.serve({ port: 8000, handler });

  console.log("");
  console.log("  \x1b[32msteno\x1b[0m  \x1b[90mdev server\x1b[0m");
  console.log("");
  console.log(
    "  \x1b[90m➜\x1b[0m  \x1b[1mLocal\x1b[0m:   \x1b[36mhttp://localhost:8000/\x1b[0m",
  );
  console.log(
    "  \x1b[90m➜\x1b[0m  \x1b[1mNetwork\x1b[0m: \x1b[36mhttp://0.0.0.0:8000/\x1b[0m",
  );
  console.log("");

  for await (const event of watcher) {
    if (
      event.kind === "modify" || event.kind === "create" ||
      event.kind === "remove"
    ) {
      console.log(`  \x1b[90mchange detected, rebuilding...\x1b[0m`);
      await buildFn();
      broadcastReload();
    }
  }
}
