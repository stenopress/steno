import { basename, dirname, join, relative, resolve } from "@std/path";
import { isPathInsideOrEqual } from "../core/path_utils.ts";
import { changeDetected, devServerReady } from "./output.ts";

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

/**
 * Returns whether a watch event was produced by Steno's transactional output.
 *
 * Transactions use sibling directories so an atomic rename can promote the
 * completed build. In zero-config mode the project root itself is watched,
 * which means those siblings must be ignored alongside the final output.
 */
export function isTransactionalOutputPath(
  path: string,
  outputDir: string,
): boolean {
  const absoluteOutput = resolve(outputDir);
  const absolutePath = resolve(path);
  if (isPathInsideOrEqual(absolutePath, absoluteOutput)) return true;

  const outputParent = dirname(absoluteOutput);
  const relativePath = relative(outputParent, absolutePath);
  if (
    relativePath === "" || relativePath.startsWith("..") ||
    relativePath.startsWith("/")
  ) {
    return false;
  }

  const firstSegment = relativePath.replaceAll("\\", "/").split("/")[0];
  const outputName = basename(absoluteOutput);
  return firstSegment.startsWith(`.${outputName}.steno-stage-`) ||
    firstSegment === `.${outputName}.steno-backup` ||
    firstSegment.startsWith(`.${outputName}.steno-backup.retired-`);
}

type PortAvailabilityCheck = (
  port: number,
) => boolean | Promise<boolean>;

function isPortAvailable(
  port: number,
  hostname: string,
): boolean {
  let listener: Deno.Listener | undefined;
  try {
    listener = Deno.listen({ hostname, port });
    return true;
  } catch (error) {
    if (error instanceof Deno.errors.AddrInUse) {
      return false;
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

/** Processes filesystem events as serialized development rebuilds. */
export async function processWatchEvents(
  events: AsyncIterable<Deno.FsEvent>,
  options: {
    outputDir: string;
    ignoredPaths?: string[];
    buildFn: () => void | Promise<void>;
    broadcastReload?: () => void;
  },
): Promise<void> {
  const ignoredPaths = options.ignoredPaths ?? [];
  for await (const event of events) {
    if (
      event.kind !== "modify" && event.kind !== "create" &&
      event.kind !== "remove"
    ) {
      continue;
    }
    if (
      event.paths.length > 0 &&
      event.paths.every((path) =>
        isTransactionalOutputPath(path, options.outputDir) ||
        ignoredPaths.some((ignoredPath) =>
          isPathInsideOrEqual(path, ignoredPath)
        )
      )
    ) {
      continue;
    }

    changeDetected();
    await options.buildFn();
    options.broadcastReload?.();
  }
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

  devServerReady(port, preferredPort);

  await processWatchEvents(watcher, {
    outputDir,
    ignoredPaths,
    buildFn,
    broadcastReload,
  });
}
