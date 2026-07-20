import { assertEquals, assertRejects, assertStringIncludes } from "@std/assert";
import { join } from "@std/path";
import { loadPlugins } from "../core/config.ts";

function writePlugin(
  directory: string,
  name: string,
  source: string,
): string {
  const path = join(directory, name);
  Deno.writeTextFileSync(path, source);
  return `file://${path}`;
}

export function registerIsolatedPluginTests(): void {
  Deno.test({
    name: "isolated plugins: execute hooks in a persistent subprocess",
    permissions: { read: true, write: true, run: true, env: true },
    fn: async () => {
      const directory = Deno.makeTempDirSync();
      const packageName = writePlugin(
        directory,
        "stateful.ts",
        `
          export default function() {
            let builds = 0;
            return {
              name: "stateful-isolated",
              beforeBuild() { builds++; },
              transformHtml(html) { return html + ":" + builds; },
            };
          }
        `,
      );

      const [plugin] = await loadPlugins({
        title: "",
        description: "",
        author: "",
        custom: { pluginSourcePolicy: { allowLocal: true } },
        plugins: [{ package: packageName, mode: "isolated" }],
      });

      assertEquals(plugin.name, "stateful-isolated");
      await plugin.beforeBuild?.({ title: "", description: "", author: "" });
      assertEquals(await plugin.transformHtml?.("<p>x</p>"), "<p>x</p>:1");
      await plugin.afterBuild?.({ title: "", description: "", author: "" });
    },
  });

  Deno.test({
    name: "isolated plugins: deny runtime capabilities including Node APIs",
    permissions: { read: true, write: true, run: true, env: true },
    fn: async () => {
      const directory = Deno.makeTempDirSync();
      const secretPath = join(directory, "secret.txt");
      Deno.writeTextFileSync(secretPath, "sandbox-secret");
      const packageName = writePlugin(
        directory,
        "malicious.ts",
        `
          import { readFileSync } from "node:fs";
          import { spawnSync } from "node:child_process";

          async function denied(operation) {
            try {
              await operation();
              return false;
            } catch (error) {
              return error?.name === "NotCapable" ||
                error?.name === "PermissionDenied";
            }
          }

          export default function(options) {
            return {
              name: "malicious",
              async transformHtml() {
                const results = {
                  read: await denied(() => Deno.readTextFile(options.secret)),
                  env: await denied(() => Deno.env.get("STENO_SECRET")),
                  net: await denied(() => fetch("https://example.com")),
                  run: await denied(() =>
                    new Deno.Command(Deno.execPath()).output()
                  ),
                  ffi: await denied(() => Deno.dlopen(options.secret, {})),
                  sys: await denied(() => Deno.systemMemoryInfo()),
                  nodeRead: await denied(() => readFileSync(options.secret)),
                  nodeRun: await denied(() => spawnSync("echo", ["unsafe"])),
                };
                return JSON.stringify(results);
              },
            };
          }
        `,
      );

      Deno.env.set("STENO_SECRET", "must-not-be-visible");
      try {
        const [plugin] = await loadPlugins({
          title: "",
          description: "",
          author: "",
          custom: { pluginSourcePolicy: { allowLocal: true } },
          plugins: [{
            package: packageName,
            mode: "isolated",
            options: { secret: secretPath },
          }],
        });

        const result = JSON.parse(await plugin.transformHtml?.("") ?? "{}");
        assertEquals(result, {
          read: true,
          env: true,
          net: true,
          run: true,
          ffi: true,
          sys: true,
          nodeRead: true,
          nodeRun: true,
        });
        await plugin.afterBuild?.({ title: "", description: "", author: "" });
      } finally {
        Deno.env.delete("STENO_SECRET");
      }
    },
  });

  Deno.test({
    name: "isolated plugins: enforce hook timeouts and kill the worker",
    permissions: { read: true, write: true, run: true },
    fn: async () => {
      const directory = Deno.makeTempDirSync();
      const packageName = writePlugin(
        directory,
        "timeout.ts",
        `
          export default function() {
            return {
              name: "timeout",
              transformHtml() { while (true) {} },
            };
          }
        `,
      );
      const [plugin] = await loadPlugins({
        title: "",
        description: "",
        author: "",
        custom: { pluginSourcePolicy: { allowLocal: true } },
        plugins: [{
          package: packageName,
          mode: "isolated",
          timeoutMs: 100,
        }],
      });

      await assertRejects(
        () => plugin.transformHtml?.("") as Promise<string>,
        Error,
        "timed out",
      );
    },
  });

  Deno.test({
    name: "isolated plugins: grant only explicitly configured capabilities",
    permissions: { read: true, write: true, run: true, env: true },
    fn: async () => {
      const directory = Deno.makeTempDirSync();
      const readablePath = join(directory, "allowed.txt");
      Deno.writeTextFileSync(readablePath, "allowed-file");
      const packageName = writePlugin(
        directory,
        "granted.ts",
        `
          export default function(options) {
            return {
              name: "granted",
              async transformHtml() {
                return JSON.stringify({
                  file: await Deno.readTextFile(options.path),
                  env: Deno.env.get("STENO_ALLOWED"),
                });
              },
            };
          }
        `,
      );

      Deno.env.set("STENO_ALLOWED", "allowed-env");
      try {
        const [plugin] = await loadPlugins({
          title: "",
          description: "",
          author: "",
          custom: { pluginSourcePolicy: { allowLocal: true } },
          plugins: [{
            package: packageName,
            mode: "isolated",
            options: { path: readablePath },
            permissions: {
              read: [readablePath],
              env: ["STENO_ALLOWED"],
            },
          }],
        });

        assertEquals(
          JSON.parse(await plugin.transformHtml?.("") ?? "{}"),
          { file: "allowed-file", env: "allowed-env" },
        );
        await plugin.afterBuild?.({ title: "", description: "", author: "" });
      } finally {
        Deno.env.delete("STENO_ALLOWED");
      }
    },
  });

  Deno.test({
    name: "isolated plugins: enforce response-size limits",
    permissions: { read: true, write: true, run: true },
    fn: async () => {
      const directory = Deno.makeTempDirSync();
      const packageName = writePlugin(
        directory,
        "oversized.ts",
        `
          export default function() {
            return {
              name: "oversized",
              transformHtml() { return "x".repeat(4096); },
            };
          }
        `,
      );
      const [plugin] = await loadPlugins({
        title: "",
        description: "",
        author: "",
        custom: { pluginSourcePolicy: { allowLocal: true } },
        plugins: [{
          package: packageName,
          mode: "isolated",
          maxOutputBytes: 1024,
        }],
      });

      await assertRejects(
        () => plugin.transformHtml?.("") as Promise<string>,
        Error,
        "exceeds",
      );
    },
  });

  Deno.test({
    name: "isolated plugins: contain worker crashes",
    permissions: { read: true, write: true, run: true },
    fn: async () => {
      const directory = Deno.makeTempDirSync();
      const packageName = writePlugin(
        directory,
        "crash.ts",
        `
          export default function() {
            return {
              name: "crash",
              transformHtml() { Deno.exit(23); },
            };
          }
        `,
      );
      const [plugin] = await loadPlugins({
        title: "",
        description: "",
        author: "",
        custom: { pluginSourcePolicy: { allowLocal: true } },
        plugins: [{ package: packageName, mode: "isolated" }],
      });

      const error = await assertRejects(
        () => plugin.transformHtml?.("") as Promise<string>,
        Error,
      );
      assertStringIncludes(error.message, "exited with code 23");
      assertEquals(1 + 1, 2);
    },
  });
}
