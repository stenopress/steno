import { assertEquals, assertRejects } from "@std/assert";
import { errorResponse, handleRequest } from "./isolated_worker.ts";
import { ISOLATED_PLUGIN_PROTOCOL_VERSION } from "./isolated_protocol.ts";

const VALID_PLUGIN_URL = "data:application/javascript," + encodeURIComponent(
  `export default (options) => ({
      name: "test-plugin",
      afterBuild: () => options,
    });`,
);

const INVALID_PLUGIN_URL = "data:application/javascript," + encodeURIComponent(
  `export default () => ({ notAPlugin: true });`,
);

const NON_FUNCTION_URL = "data:application/javascript," +
  encodeURIComponent(`export default 42;`);

Deno.test({
  name:
    "isolated_worker: rejects a request with an unsupported protocol version",
  fn: async () => {
    await assertRejects(
      () =>
        handleRequest({
          id: 1,
          version: ISOLATED_PLUGIN_PROTOCOL_VERSION + 1,
          type: "init",
          package: VALID_PLUGIN_URL,
        }),
      Error,
      "protocol version",
    );
  },
});

Deno.test({
  name: "isolated_worker: init requires a package specifier",
  fn: async () => {
    await assertRejects(
      () =>
        handleRequest({
          id: 1,
          version: ISOLATED_PLUGIN_PROTOCOL_VERSION,
          type: "init",
        }),
      Error,
      "Missing plugin package",
    );
  },
});

Deno.test({
  name: "isolated_worker: init rejects a factory that isn't a function",
  fn: async () => {
    await assertRejects(
      () =>
        handleRequest({
          id: 1,
          version: ISOLATED_PLUGIN_PROTOCOL_VERSION,
          type: "init",
          package: NON_FUNCTION_URL,
        }),
      Error,
      "must default-export a factory function",
    );
  },
});

Deno.test({
  name:
    "isolated_worker: init rejects a factory result that isn't a valid plugin",
  fn: async () => {
    await assertRejects(
      () =>
        handleRequest({
          id: 1,
          version: ISOLATED_PLUGIN_PROTOCOL_VERSION,
          type: "init",
          package: INVALID_PLUGIN_URL,
        }),
      Error,
      "invalid plugin object",
    );
  },
});

Deno.test({
  name:
    "isolated_worker: init succeeds and reports the plugin's declared hooks",
  fn: async () => {
    const response = await handleRequest({
      id: 1,
      version: ISOLATED_PLUGIN_PROTOCOL_VERSION,
      type: "init",
      package: VALID_PLUGIN_URL,
    });
    assertEquals(response.ok, true);
    assertEquals(response.plugin?.name, "test-plugin");
    assertEquals(response.plugin?.hooks, ["afterBuild"]);
  },
});

Deno.test({
  name: "isolated_worker: hook dispatch rejects an unknown hook name",
  fn: async () => {
    await handleRequest({
      id: 1,
      version: ISOLATED_PLUGIN_PROTOCOL_VERSION,
      type: "init",
      package: VALID_PLUGIN_URL,
    });
    await assertRejects(
      () =>
        handleRequest({
          id: 2,
          version: ISOLATED_PLUGIN_PROTOCOL_VERSION,
          type: "hook",
          // deno-lint-ignore no-explicit-any
          hook: "notAHook" as any,
        }),
      Error,
      "Unknown plugin hook",
    );
  },
});

Deno.test({
  name: "isolated_worker: hook dispatch runs the initialized plugin's hook",
  fn: async () => {
    await handleRequest({
      id: 1,
      version: ISOLATED_PLUGIN_PROTOCOL_VERSION,
      type: "init",
      package: VALID_PLUGIN_URL,
      options: { flag: true },
    });
    const response = await handleRequest({
      id: 2,
      version: ISOLATED_PLUGIN_PROTOCOL_VERSION,
      type: "hook",
      hook: "afterBuild",
    });
    assertEquals(response.ok, true);
    assertEquals(response.result, { flag: true });
  },
});

Deno.test({
  name: "errorResponse: normalizes a non-Error throw into a response",
  fn: () => {
    const response = errorResponse(7, "plain string failure");
    assertEquals(response.id, 7);
    assertEquals(response.ok, false);
    assertEquals(response.error?.message, "plain string failure");
  },
});

Deno.test({
  name: "errorResponse: preserves an Error's name and message",
  fn: () => {
    const response = errorResponse(3, new TypeError("bad type"));
    assertEquals(response.error?.name, "TypeError");
    assertEquals(response.error?.message, "bad type");
  },
});
