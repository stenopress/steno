import { basename, dirname, extname, join, relative, resolve } from "@std/path";
import { contentType } from "@std/media-types";
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
export function isTransactionalOutputPath(path: string, outputDir: string): boolean {
  const absoluteOutput = resolve(outputDir);
  const absolutePath = resolve(path);
  if (isPathInsideOrEqual(absolutePath, absoluteOutput)) return true;

  const outputParent = dirname(absoluteOutput);
  const relativePath = relative(outputParent, absolutePath);
  if (relativePath === "" || relativePath.startsWith("..") || relativePath.startsWith("/")) {
    return false;
  }

  const firstSegment = relativePath.replaceAll("\\", "/").split("/")[0];
  const outputName = basename(absoluteOutput);
  return (
    firstSegment.startsWith(`.${outputName}.steno-stage-`) ||
    firstSegment === `.${outputName}.steno-backup` ||
    firstSegment.startsWith(`.${outputName}.steno-backup.retired-`)
  );
}

type PortAvailabilityCheck = (port: number) => boolean | Promise<boolean>;

function isPortAvailable(port: number, hostname: string): boolean {
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
  const portCheck = options.isPortAvailable ?? ((port: number) => isPortAvailable(port, hostname));

  for (let port = startPort; port <= maxPort; port++) {
    if (await portCheck(port)) {
      return port;
    }
  }

  throw new Error(`No available port found in range ${startPort}-${maxPort}.`);
}

/** Internal state for connected reload clients. */
interface DevServerState {
  clients: Set<ReadableStreamDefaultController<Uint8Array>>;
}

/** Injects the live-reload script before the closing body tag. */
export function injectReloadScript(html: string): string {
  return html.replace(/<\/body>/, `${reloadScript}</body>`);
}

/** Creates the dev static handler for serving built files with optional live reload. */
export function createStaticHandler(
  outputDir: string,
  liveReload = false,
): (request: Request) => Promise<Response> {
  const absoluteOutput = resolve(outputDir);

  return async (request) => {
    const url = new URL(request.url);
    let pathname: string;

    try {
      pathname = decodeURIComponent(url.pathname);
    } catch {
      return new Response("400 - Bad Request", { status: 400 });
    }

    let filePath = resolve(absoluteOutput, `.${pathname}`);

    if (!isPathInsideOrEqual(filePath, absoluteOutput)) {
      return new Response("404 - Not Found", { status: 404 });
    }

    if (pathname.endsWith("/")) {
      filePath = join(filePath, "index.html");
    }

    try {
      const stat = await Deno.stat(filePath);
      if (stat.isDirectory) {
        filePath = join(filePath, "index.html");
      }

      const contents = await Deno.readFile(filePath);
      const contentType = getContentType(filePath);

      if (contentType.startsWith("text/html")) {
        const html = new TextDecoder().decode(contents);
        return new Response(liveReload ? injectReloadScript(html) : html, {
          headers: { "Content-Type": contentType },
        });
      }

      return new Response(contents, {
        headers: { "Content-Type": contentType },
      });
    } catch (error) {
      if (!(error instanceof Deno.errors.NotFound)) throw error;

      const notFoundPath = join(absoluteOutput, "404.html");

      try {
        return new Response(await Deno.readFile(notFoundPath), {
          status: 404,
          headers: { "Content-Type": "text/html; charset=utf-8" },
        });
      } catch (notFoundError) {
        if (!(notFoundError instanceof Deno.errors.NotFound)) {
          throw notFoundError;
        }

        return new Response("404 - Not Found", { status: 404 });
      }
    }
  };
}

function getContentType(filePath: string): string {
  const type = contentType(extname(filePath)) ?? "application/octet-stream";
  return type.replace("charset=UTF-8", "charset=utf-8");
}

/** Creates the dev-server handler and reload broadcaster. */
export function createDevServerHandler(outputDir: string): {
  handler: (req: Request) => Promise<Response>;
  broadcastReload: () => void;
} {
  const state: DevServerState = { clients: new Set() };
  const staticHandler = createStaticHandler(outputDir, true);

  const broadcastReload = () => {
    for (const client of state.clients) {
      client.enqueue(textEncoder.encode("data: reload\n\n"));
    }
  };

  const handler = (req: Request): Promise<Response> => {
    const url = new URL(req.url);

    if (url.pathname !== "/reload") {
      return staticHandler(req);
    }

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

    return Promise.resolve(
      new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      }),
    );
  };

  return { handler, broadcastReload };
}

/** Creates a preview-server handler for static files. */
export function createPreviewHandler(outputDir: string): (request: Request) => Promise<Response> {
  return createStaticHandler(outputDir, false);
}

/**
 * Default quiet period after the last relevant fs event before a rebuild
 * fires. A single save often emits several raw events (content write,
 * rename, metadata touch); without this, each would trigger its own full
 * rebuild back-to-back.
 */
export const DEFAULT_WATCH_DEBOUNCE_MS = 75;

/** Processes filesystem events as serialized, debounced development rebuilds. */
export async function processWatchEvents(
  events: AsyncIterable<Deno.FsEvent>,
  options: {
    outputDir: string;
    ignoredPaths?: string[];
    buildFn: () => void | Promise<void>;
    broadcastReload?: () => void;
    debounceMs?: number;
  },
): Promise<void> {
  const ignoredPaths = options.ignoredPaths ?? [];
  const debounceMs = options.debounceMs ?? DEFAULT_WATCH_DEBOUNCE_MS;

  let pending = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  // Chains rebuilds so they never overlap.
  let rebuildChain: Promise<void> = Promise.resolve();

  const runRebuild = () => {
    pending = false;
    rebuildChain = rebuildChain.then(async () => {
      changeDetected();
      await options.buildFn();
      options.broadcastReload?.();
    });
  };

  const scheduleRebuild = () => {
    pending = true;
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      if (pending) runRebuild();
    }, debounceMs);
  };

  for await (const event of events) {
    if (event.kind !== "modify" && event.kind !== "create" && event.kind !== "remove") {
      continue;
    }
    if (
      event.paths.length > 0 &&
      event.paths.every(
        (path) =>
          isTransactionalOutputPath(path, options.outputDir) ||
          ignoredPaths.some((ignoredPath) => isPathInsideOrEqual(path, ignoredPath)),
      )
    ) {
      continue;
    }

    scheduleRebuild();
  }

  if (timer !== undefined) clearTimeout(timer);
  if (pending) runRebuild();
  await rebuildChain;
}

/** Serves the built site and rebuilds on filesystem changes. */
export async function filterExistingWatchPaths(paths: string[]): Promise<string[]> {
  const existing: string[] = [];
  for (const path of paths) {
    try {
      await Deno.stat(path);
      existing.push(path);
    } catch (error) {
      if (!(error instanceof Deno.errors.NotFound)) throw error;
    }
  }
  return existing;
}

export async function startDevServer(
  outputDir: string,
  buildFn: () => void | Promise<void>,
  watchDirs: string | string[] = "content",
  ignoredPaths: string[] = [],
  preferredPort: number = DEFAULT_DEV_PORT,
  // Loopback-only by default: dev server serves unpublished content.
  hostname: string = "127.0.0.1",
): Promise<void> {
  const { handler, broadcastReload } = createDevServerHandler(outputDir);

  await buildFn();

  const requestedWatchDirs = Array.isArray(watchDirs) ? watchDirs : [watchDirs];
  const dirsToWatch = await filterExistingWatchPaths(requestedWatchDirs);
  if (!dirsToWatch.length) {
    throw new Error("No existing paths are available for the dev server to watch.");
  }
  const watcher = Deno.watchFs(dirsToWatch);
  const port = await findAvailablePort(preferredPort, { hostname });

  Deno.serve({ port, hostname, handler });

  devServerReady(port, preferredPort, hostname);

  await processWatchEvents(watcher, {
    outputDir,
    ignoredPaths,
    buildFn,
    broadcastReload,
  });
}

export const DEFAULT_PREVIEW_PORT = 4173;

export async function startPreviewServer(
  outputDir: string,
  preferredPort = DEFAULT_PREVIEW_PORT,
): Promise<void> {
  let stat: Deno.FileInfo;

  try {
    stat = await Deno.stat(outputDir);
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      throw new Error(`Preview output not found at "${outputDir}". Run "steno build" first.`);
    }
    throw error;
  }

  if (!stat.isDirectory) {
    throw new Error(`Preview output "${outputDir}" is not a directory.`);
  }

  const hostname = "127.0.0.1";
  const port = await findAvailablePort(preferredPort, { hostname });
  const handler = createPreviewHandler(outputDir);

  const server = Deno.serve({
    hostname,
    port,
    handler,
    onListen: () => {
      console.log(`Preview: http://${hostname}:${port}/`);
    },
  });

  await server.finished;
}
