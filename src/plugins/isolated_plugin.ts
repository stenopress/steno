import type {
  GeneratedPage,
  IsolatedPluginPermissions,
  PluginEntry,
  SiteConfig,
  StenoPlugin,
} from "../types.ts";
import type { TokensList } from "marked";
import {
  ISOLATED_PLUGIN_PROTOCOL_VERSION,
  type IsolatedPluginHook,
  type IsolatedPluginRequest,
  type IsolatedPluginResponse,
  readProtocolLines,
} from "./isolated_protocol.ts";
import { utf8ByteLength } from "../utils/text.ts";

const DEFAULT_TIMEOUT_MS = 5_000;
const DEFAULT_MAX_OUTPUT_BYTES = 4 * 1024 * 1024;
const DEFAULT_MEMORY_MB = 128;
const workerUrl = new URL("./isolated_worker.ts", import.meta.url);
const isolatedClients = new WeakMap<StenoPlugin, IsolatedPluginClient>();
const isolatedSignatures = new WeakMap<StenoPlugin, string>();
const encoder = new TextEncoder();

/**
 * Returns a build-cache signature fragment for an isolated plugin, or
 * `undefined` for trusted (in-process) plugins.
 *
 * Isolated plugins expose only a wrapper closure to the trusted process, so
 * `.toString()` on the hook functions can't detect changes to the actual
 * subprocess-executed plugin code. This signature instead covers everything
 * Steno controls about what will run: the module specifier, options,
 * permissions, and integrity hash, plus the source file's mtime/size for
 * local `file://` plugins so edits without a bumped `integrity` still
 * invalidate the cache.
 */
export function getIsolatedPluginSignature(
  plugin: StenoPlugin,
): string | undefined {
  return isolatedSignatures.get(plugin);
}

function fileSignature(packageName: string): unknown {
  if (!packageName.startsWith("file://")) return null;
  try {
    const stat = Deno.statSync(new URL(packageName));
    return { mtime: stat.mtime?.getTime() ?? null, size: stat.size };
  } catch {
    return null;
  }
}

function permissionArg(
  name: string,
  values: string[] | undefined,
): string {
  return values?.length ? `--allow-${name}=${values.join(",")}` : `--deny-${name}`;
}

function inferredImportHosts(packageName: string): string[] {
  if (packageName.startsWith("jsr:")) return ["jsr.io:443"];
  if (packageName.startsWith("https://") || packageName.startsWith("http://")) {
    return [new URL(packageName).host];
  }
  return [];
}

function workerArgs(
  packageName: string,
  permissions: IsolatedPluginPermissions,
  memoryMb: number,
  lockFile: string | undefined,
): string[] {
  const importHosts = [
    ...inferredImportHosts(packageName),
    ...(permissions.import ?? []),
  ];
  const moduleReadPaths = packageName.startsWith("file://") ? [new URL(packageName).pathname] : [];
  const readPaths = [...moduleReadPaths, ...(permissions.read ?? [])];
  const lockArgs = lockFile ? [`--lock=${lockFile}`, "--frozen"] : ["--no-lock"];
  return [
    "run",
    "--quiet",
    "--no-config",
    ...lockArgs,
    "--no-prompt",
    `--v8-flags=--max-old-space-size=${memoryMb}`,
    permissionArg("read", [...new Set(readPaths)]),
    permissionArg("write", permissions.write),
    permissionArg("net", permissions.net),
    permissionArg("env", permissions.env),
    permissionArg("run", permissions.run),
    permissionArg("ffi", permissions.ffi),
    permissionArg("sys", permissions.sys),
    permissionArg("import", [...new Set(importHosts)]),
    workerUrl.href,
  ];
}

function resolveLockFile(entry: PluginEntry): string | undefined {
  if (entry.package.startsWith("file://")) return undefined;
  const lockFile = entry.lockFile ?? `${Deno.cwd()}/deno.lock`;
  try {
    if (Deno.statSync(lockFile).isFile) return lockFile;
  } catch {
    // Report the required lockfile below.
  }
  throw new Error(
    `Isolated remote plugin "${entry.package}" requires a frozen Deno lockfile at "${lockFile}".`,
  );
}

function allowedEnvironment(
  names: string[] | undefined,
): Record<string, string> {
  const environment: Record<string, string> = {};
  for (const name of names ?? []) {
    try {
      const value = Deno.env.get(name);
      if (value !== undefined) environment[name] = value;
    } catch {
      // The parent cannot forward an environment variable it cannot read.
    }
  }
  return environment;
}

class IsolatedPluginClient {
  readonly #packageName: string;
  readonly #options: Record<string, unknown>;
  readonly #permissions: IsolatedPluginPermissions;
  readonly #timeoutMs: number;
  readonly #maxOutputBytes: number;
  readonly #memoryMb: number;
  readonly #lockFile?: string;
  #child?: Deno.ChildProcess;
  #writer?: WritableStreamDefaultWriter<Uint8Array>;
  #nextId = 1;
  #pending = new Map<number, {
    resolve: (response: IsolatedPluginResponse) => void;
    reject: (error: Error) => void;
  }>();
  #starting?: Promise<IsolatedPluginResponse>;

  constructor(entry: PluginEntry) {
    this.#packageName = entry.package;
    this.#options = entry.options ?? {};
    this.#permissions = entry.permissions ?? {};
    this.#timeoutMs = entry.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.#maxOutputBytes = entry.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;
    this.#memoryMb = entry.memoryMb ?? DEFAULT_MEMORY_MB;
    this.#lockFile = resolveLockFile(entry);
  }

  async initialize(): Promise<IsolatedPluginResponse> {
    if (this.#child && this.#starting) return await this.#starting;

    const command = new Deno.Command(Deno.execPath(), {
      args: workerArgs(
        this.#packageName,
        this.#permissions,
        this.#memoryMb,
        this.#lockFile,
      ),
      stdin: "piped",
      stdout: "piped",
      stderr: "null",
      clearEnv: true,
      env: allowedEnvironment(this.#permissions.env),
    });
    this.#child = command.spawn();
    this.#writer = this.#child.stdin.getWriter();
    this.#readResponses(this.#child.stdout);
    this.#watchExit(this.#child);
    this.#starting = this.#request({
      type: "init",
      package: this.#packageName,
      options: this.#options,
    }, Math.max(DEFAULT_TIMEOUT_MS, this.#timeoutMs));
    return await this.#starting;
  }

  async call(hook: IsolatedPluginHook, payload: unknown): Promise<unknown> {
    await this.initialize();
    return (await this.#request({ type: "hook", hook, payload })).result;
  }

  close(): void {
    const child = this.#child;
    this.#child = undefined;
    this.#writer = undefined;
    this.#starting = undefined;
    if (child) {
      try {
        child.kill();
      } catch {
        // The worker already exited.
      }
    }
    this.#rejectAll(
      new Error(`Isolated plugin "${this.#packageName}" closed.`),
    );
  }

  async #request(
    request: Omit<IsolatedPluginRequest, "id" | "version">,
    timeoutMs = this.#timeoutMs,
  ): Promise<IsolatedPluginResponse> {
    const id = this.#nextId++;
    const message: IsolatedPluginRequest = {
      ...request,
      id,
      version: ISOLATED_PLUGIN_PROTOCOL_VERSION,
    };
    const encoded = encoder.encode(`${JSON.stringify(message)}\n`);
    if (encoded.byteLength > this.#maxOutputBytes) {
      throw new Error(
        `Isolated plugin request exceeds ${this.#maxOutputBytes} bytes.`,
      );
    }
    if (!this.#writer) {
      throw new Error("Isolated plugin worker is unavailable.");
    }

    const response = new Promise<IsolatedPluginResponse>((resolve, reject) => {
      this.#pending.set(id, { resolve, reject });
    });
    await this.#writer.write(encoded);

    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        const error = new Error(
          `Isolated plugin "${this.#packageName}" timed out after ${timeoutMs}ms.`,
        );
        this.#pending.delete(id);
        reject(error);
        this.close();
      }, timeoutMs);
    });

    try {
      return await Promise.race([response, timeout]);
    } finally {
      clearTimeout(timer);
      this.#pending.delete(id);
    }
  }

  async #readResponses(stream: ReadableStream<Uint8Array>): Promise<void> {
    try {
      for await (
        const line of readProtocolLines(stream, this.#maxOutputBytes)
      ) {
        if (utf8ByteLength(line) > this.#maxOutputBytes) {
          throw new Error(
            `Isolated plugin response exceeds ${this.#maxOutputBytes} bytes.`,
          );
        }
        const response = JSON.parse(line) as IsolatedPluginResponse;
        if (response.version !== ISOLATED_PLUGIN_PROTOCOL_VERSION) {
          throw new Error("Isolated plugin protocol version mismatch.");
        }
        const pending = this.#pending.get(response.id);
        if (!pending) continue;
        if (response.ok) {
          pending.resolve(response);
        } else {
          pending.reject(
            new Error(
              `Isolated plugin "${this.#packageName}" failed: ${
                response.error?.message ?? "unknown worker error"
              }`,
            ),
          );
          this.close();
          return;
        }
      }
    } catch (error) {
      this.#rejectAll(
        error instanceof Error ? error : new Error(String(error)),
      );
      this.close();
    }
  }

  async #watchExit(child: Deno.ChildProcess): Promise<void> {
    const status = await child.status;
    if (this.#child !== child) return;
    this.#child = undefined;
    this.#writer = undefined;
    this.#starting = undefined;
    this.#rejectAll(
      new Error(
        `Isolated plugin "${this.#packageName}" exited with code ${status.code}.`,
      ),
    );
  }

  #rejectAll(error: Error): void {
    for (const pending of this.#pending.values()) pending.reject(error);
    this.#pending.clear();
  }
}

export async function loadIsolatedPlugin(
  entry: PluginEntry,
): Promise<StenoPlugin> {
  const client = new IsolatedPluginClient(entry);
  const initialized = await client.initialize();
  if (!initialized.plugin) {
    client.close();
    throw new Error("Isolated plugin worker returned no plugin metadata.");
  }

  const hooks = new Set(initialized.plugin.hooks);
  const plugin: StenoPlugin = {
    name: initialized.plugin.name,
  };
  isolatedClients.set(plugin, client);
  isolatedSignatures.set(
    plugin,
    JSON.stringify({
      package: entry.package,
      options: entry.options ?? null,
      permissions: entry.permissions ?? null,
      integrity: entry.integrity ?? null,
      timeoutMs: entry.timeoutMs ?? null,
      maxOutputBytes: entry.maxOutputBytes ?? null,
      memoryMb: entry.memoryMb ?? null,
      lockFile: entry.lockFile ?? null,
      hooks: [...hooks].sort(),
      file: fileSignature(entry.package),
    }),
  );
  if (hooks.has("beforeBuild")) {
    plugin.beforeBuild = (config: SiteConfig) =>
      client.call("beforeBuild", config).then(() => undefined);
  }
  if (hooks.has("transformAst")) {
    plugin.transformAst = (tokens: TokensList) =>
      client.call("transformAst", tokens) as Promise<TokensList>;
  }
  if (hooks.has("transformHtml")) {
    plugin.transformHtml = (html: string) => client.call("transformHtml", html) as Promise<string>;
  }
  if (hooks.has("afterPage")) {
    plugin.afterPage = (page: GeneratedPage) =>
      client.call("afterPage", page).then(() => undefined);
  }
  plugin.afterBuild = async (config: SiteConfig) => {
    try {
      if (hooks.has("afterBuild")) {
        await client.call("afterBuild", config);
      }
    } finally {
      client.close();
    }
  };
  return plugin;
}

export function disposeIsolatedPlugins(plugins: StenoPlugin[]): void {
  for (const plugin of plugins) isolatedClients.get(plugin)?.close();
}
