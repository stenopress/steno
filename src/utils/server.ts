import { join } from "@std/path";
import { isPathInsideOrEqual } from "../core/path_utils.ts";

export const DEFAULT_DEV_PORT = 5735;

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
const MAX_PORT = 65535;

type PortAvailabilityCheck = (port: number) => Promise<boolean>;

function isPortAvailable(
  port: number,
  hostname: string,
): Promise<boolean> {
  let listener: Deno.Listener | undefined;
  try {
    listener = Deno.listen({ hostname, port });
    return Promise.resolve(true);
  } catch (error) {
    if (error instanceof Deno.errors.AddrInUse) {
      return Promise.resolve(false);
    }
    throw error;
  } finally {
    listener?.close();
  }
}

/** Finds the first available TCP port starting at the requested port. */
export async function findAvailablePort(
  startPort: number,
  options: {
    hostname?: string;
    maxPort?: number;
    isPortAvailable?: PortAvailabilityCheck;
  } = {},
): Promise<number> {
  if (!Number.isInteger(startPort) || startPort < 1 || startPort > MAX_PORT) {
    throw new Error(
      `Invalid start port "${startPort}". Expected an integer between 1 and ${MAX_PORT}.`,
    );
  }

  const hostname = options.hostname ?? "0.0.0.0";
  const maxPort = options.maxPort ?? MAX_PORT;
  const portCheck = options.isPortAvailable ??
    ((port: number) => isPortAvailable(port, hostname));

  for (let port = startPort; port <= maxPort; port++) {
    if (await portCheck(port)) {
      return port;
    }
  }

  throw new Error(
    `No available port found in range ${startPort}-${maxPort}.`,
  );
}

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
  watchDirs: string | string[] = "content",
  ignoredPaths: string[] = [],
  preferredPort: number = DEFAULT_DEV_PORT,
): Promise<void> {
  const { handler, broadcastReload } = createDevServerHandler(outputDir);

  await buildFn();

  const dirsToWatch = Array.isArray(watchDirs) ? watchDirs : [watchDirs];
  const watcher = Deno.watchFs(dirsToWatch);
  const port = await findAvailablePort(preferredPort);

  Deno.serve({ port, handler });

  if (port !== preferredPort) {
    console.warn(
      `  \x1b[33mport ${preferredPort} is in use, switched to ${port}\x1b[0m`,
    );
  }

  console.log("");
  console.log("  \x1b[32msteno\x1b[0m  \x1b[90mdev server\x1b[0m");
  console.log("");
  console.log(
    `  \x1b[90m➜\x1b[0m  \x1b[1mLocal\x1b[0m:   \x1b[36mhttp://localhost:${port}/\x1b[0m`,
  );
  console.log(
    `  \x1b[90m➜\x1b[0m  \x1b[1mNetwork\x1b[0m: \x1b[36mhttp://0.0.0.0:${port}/\x1b[0m`,
  );
  console.log("");

  for await (const event of watcher) {
    if (
      event.kind === "modify" || event.kind === "create" ||
      event.kind === "remove"
    ) {
      if (
        event.paths.length > 0 &&
        event.paths.every((path) =>
          ignoredPaths.some((ignoredPath) =>
            isPathInsideOrEqual(path, ignoredPath)
          )
        )
      ) {
        continue;
      }

      console.log(`  \x1b[90mchange detected, rebuilding...\x1b[0m`);
      await buildFn();
      broadcastReload();
    }
  }
}
