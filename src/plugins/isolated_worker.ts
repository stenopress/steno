import {
  ISOLATED_PLUGIN_PROTOCOL_VERSION,
  type IsolatedPluginHook,
  type IsolatedPluginRequest,
  type IsolatedPluginResponse,
  readProtocolLines,
} from "./isolated_protocol.ts";
import { isStenoPlugin } from "./plugins.ts";
import type { StenoPlugin } from "../types.ts";

const encoder = new TextEncoder();
const hookNames: IsolatedPluginHook[] = [
  "beforeBuild",
  "transformAst",
  "transformHtml",
  "afterPage",
  "afterBuild",
];

// Keep plugin logging out of the protocol stream.
for (const method of ["log", "info", "warn", "error", "debug"] as const) {
  console[method] = (...args: unknown[]) => {
    const text = args.map((value) =>
      typeof value === "string" ? value : JSON.stringify(value)
    ).join(" ");
    Deno.stderr.writeSync(encoder.encode(`${text}\n`));
  };
}

let plugin: StenoPlugin | undefined;

function errorResponse(
  id: number,
  error: unknown,
): IsolatedPluginResponse {
  const normalized = error instanceof Error ? error : new Error(String(error));
  return {
    id,
    version: ISOLATED_PLUGIN_PROTOCOL_VERSION,
    ok: false,
    error: {
      name: normalized.name,
      message: normalized.message,
    },
  };
}

async function handleRequest(
  request: IsolatedPluginRequest,
): Promise<IsolatedPluginResponse> {
  if (request.version !== ISOLATED_PLUGIN_PROTOCOL_VERSION) {
    throw new Error(`Unsupported isolated plugin protocol version.`);
  }

  if (request.type === "init") {
    if (!request.package) throw new Error("Missing plugin package.");
    const mod = await import(request.package);
    const factory = mod.default ?? mod;
    if (typeof factory !== "function") {
      throw new Error("Plugin must default-export a factory function.");
    }
    const candidate = await factory(
      Object.freeze(structuredClone(request.options ?? {})),
    );
    if (!isStenoPlugin(candidate)) {
      throw new Error("Plugin factory returned an invalid plugin object.");
    }
    plugin = candidate;
    return {
      id: request.id,
      version: ISOLATED_PLUGIN_PROTOCOL_VERSION,
      ok: true,
      plugin: {
        name: plugin.name,
        hooks: hookNames.filter((hook) => typeof plugin?.[hook] === "function"),
      },
    };
  }

  if (!plugin) throw new Error("Plugin worker has not been initialized.");
  if (!request.hook || !hookNames.includes(request.hook)) {
    throw new Error("Unknown plugin hook.");
  }

  const hook = plugin[request.hook] as
    | ((payload: never) => unknown | Promise<unknown>)
    | undefined;
  const result = hook ? await hook(request.payload as never) : request.payload;
  return {
    id: request.id,
    version: ISOLATED_PLUGIN_PROTOCOL_VERSION,
    ok: true,
    result,
  };
}

for await (const line of readProtocolLines(Deno.stdin.readable)) {
  let response: IsolatedPluginResponse;
  let id = -1;
  try {
    const request = JSON.parse(line) as IsolatedPluginRequest;
    id = request.id;
    response = await handleRequest(request);
  } catch (error) {
    response = errorResponse(id, error);
  }
  await Deno.stdout.write(encoder.encode(`${JSON.stringify(response)}\n`));
}
