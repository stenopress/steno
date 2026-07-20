export const ISOLATED_PLUGIN_PROTOCOL_VERSION = 1;

export type IsolatedPluginHook =
  | "beforeBuild"
  | "transformAst"
  | "transformHtml"
  | "afterPage"
  | "afterBuild";

export interface IsolatedPluginRequest {
  id: number;
  version: number;
  type: "init" | "hook";
  package?: string;
  options?: Record<string, unknown>;
  hook?: IsolatedPluginHook;
  payload?: unknown;
}

export interface IsolatedPluginResponse {
  id: number;
  version: number;
  ok: boolean;
  result?: unknown;
  plugin?: {
    name: string;
    hooks: IsolatedPluginHook[];
  };
  error?: {
    name: string;
    message: string;
  };
}

export async function* readProtocolLines(
  stream: ReadableStream<Uint8Array>,
  maxBufferedBytes = Number.POSITIVE_INFINITY,
): AsyncGenerator<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffered = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffered += decoder.decode(value, { stream: true });
      if (new TextEncoder().encode(buffered).byteLength > maxBufferedBytes) {
        throw new Error(
          `Protocol message exceeds ${maxBufferedBytes} bytes.`,
        );
      }
      let newline = buffered.indexOf("\n");
      while (newline >= 0) {
        const line = buffered.slice(0, newline).replace(/\r$/, "");
        buffered = buffered.slice(newline + 1);
        yield line;
        newline = buffered.indexOf("\n");
      }
    }
    buffered += decoder.decode();
    if (buffered) yield buffered;
  } finally {
    reader.releaseLock();
  }
}
