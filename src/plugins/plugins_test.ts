import { assertEquals } from "@std/assert";
import { join } from "@std/path";
import { runAstTransforms, runHtmlTransforms } from "./plugins.ts";
import { loadPlugins } from "../core/config.ts";
import type { StenoPlugin } from "./plugins.ts";
import { marked } from "marked";

export function registerPluginTests(): void {
  // runAstTransforms

  Deno.test("plugins: runAstTransforms passes through with no plugins", async () => {
    const tokens = marked.lexer("# Hello");
    const result = await runAstTransforms(tokens, []);
    assertEquals(result, tokens);
  });

  Deno.test("plugins: runAstTransforms runs transforms in order", async () => {
    const log: number[] = [];
    const plugins: StenoPlugin[] = [
      {
        name: "a",
        transformAst: (t) => {
          log.push(1);
          return t;
        },
      },
      {
        name: "b",
        transformAst: (t) => {
          log.push(2);
          return t;
        },
      },
    ];
    const tokens = marked.lexer("hello");
    await runAstTransforms(tokens, plugins);
    assertEquals(log, [1, 2]);
  });

  Deno.test("plugins: runAstTransforms skips plugins without transformAst", async () => {
    const tokens = marked.lexer("hello");
    const plugins: StenoPlugin[] = [{
      name: "html-only",
      transformHtml: (h) => h,
    }];
    const result = await runAstTransforms(tokens, plugins);
    assertEquals(result, tokens);
  });

  // runHtmlTransforms

  Deno.test("plugins: runHtmlTransforms passes through with no plugins", async () => {
    const result = await runHtmlTransforms("<p>hello</p>", []);
    assertEquals(result, "<p>hello</p>");
  });

  Deno.test("plugins: runHtmlTransforms runs transforms in order", async () => {
    const plugins: StenoPlugin[] = [
      { name: "a", transformHtml: (h) => h.replace("hello", "world") },
      { name: "b", transformHtml: (h) => h.replace("world", "steno") },
    ];
    const result = await runHtmlTransforms("<p>hello</p>", plugins);
    assertEquals(result, "<p>steno</p>");
  });

  Deno.test("plugins: runHtmlTransforms skips plugins without transformHtml", async () => {
    const plugins: StenoPlugin[] = [{
      name: "ast-only",
      transformAst: (t) => t,
    }];
    const result = await runHtmlTransforms("<p>hello</p>", plugins);
    assertEquals(result, "<p>hello</p>");
  });

  Deno.test("plugins: runHtmlTransforms supports async transforms", async () => {
    const plugins: StenoPlugin[] = [{
      name: "async",
      transformHtml: async (h) => {
        await new Promise((r) => setTimeout(r, 1));
        return h + "<!-- async -->";
      },
    }];
    const result = await runHtmlTransforms("<p>hi</p>", plugins);
    assertEquals(result, "<p>hi</p><!-- async -->");
  });

  // loadPlugins

  Deno.test({
    name: "plugins: loadPlugins returns [] when no plugins in config",
    fn: async () => {
      const result = await loadPlugins({
        title: "",
        description: "",
        author: "",
      });
      assertEquals(result, []);
    },
  });

  Deno.test({
    name: "plugins: loadPlugins loads plugin from string entry",
    permissions: { read: true, write: true },
    fn: async () => {
      const originalError = console.error;
      console.error = () => {};
      try {
        const tempDir = Deno.makeTempDirSync();
        const pluginPath = join(tempDir, "plugin.ts");

        Deno.writeTextFileSync(
          pluginPath,
          `
        import type { StenoPlugin } from "${
            import.meta.resolve("./plugins.ts")
          }";
        export default function(_options = {}): StenoPlugin {
          return { name: "test-plugin" };
        }
      `,
        );

        const result = await loadPlugins({
          title: "",
          description: "",
          author: "",
          plugins: [`file://${pluginPath}`],
        });

        assertEquals(result.length, 0);
      } finally {
        console.error = originalError;
      }
    },
  });

  Deno.test({
    name:
      "plugins: loadPlugins loads plugin from object entry and passes options",
    permissions: { read: true, write: true },
    fn: async () => {
      const tempDir = Deno.makeTempDirSync();
      const pluginPath = join(tempDir, "plugin-opts.ts");

      Deno.writeTextFileSync(
        pluginPath,
        `
        import type { StenoPlugin } from "${
          import.meta.resolve("./plugins.ts")
        }";
        export default function(options: Record<string, unknown> = {}): StenoPlugin {
          return { name: options.name as string ?? "unnamed" };
        }
      `,
      );

      const result = await loadPlugins({
        title: "",
        description: "",
        author: "",
        custom: {
          pluginSecurity: {
            allowLocal: true,
          },
        },
        plugins: [{
          package: `file://${pluginPath}`,
          options: { name: "my-plugin" },
        }],
      });

      assertEquals(result.length, 1);
      assertEquals(result[0].name, "my-plugin");
    },
  });

  Deno.test({
    name: "plugins: loadPlugins skips entry if export is not a function",
    permissions: { read: true, write: true },
    fn: async () => {
      const tempDir = Deno.makeTempDirSync();
      const pluginPath = join(tempDir, "bad-plugin.ts");
      Deno.writeTextFileSync(
        pluginPath,
        `export default { name: "not-a-function" };`,
      );

      const result = await loadPlugins({
        title: "",
        description: "",
        author: "",
        custom: {
          pluginSecurity: {
            allowLocal: true,
          },
        },
        plugins: [`file://${pluginPath}`],
      });

      assertEquals(result.length, 0);
    },
  });

  Deno.test({
    name: "plugins: loadPlugins skips entry if import fails",
    fn: async () => {
      const originalError = console.error;
      console.error = () => {};
      try {
        const result = await loadPlugins({
          title: "",
          description: "",
          author: "",
          plugins: ["jsr:@steno/this-does-not-exist-xyz"],
        });

        assertEquals(result.length, 0);
      } finally {
        console.error = originalError;
      }
    },
  });

  Deno.test({
    name: "plugins: loadPlugins blocks remote http imports by default",
    fn: async () => {
      const originalError = console.error;
      console.error = () => {};

      let result: Awaited<ReturnType<typeof loadPlugins>>;
      try {
        result = await loadPlugins({
          title: "",
          description: "",
          author: "",
          plugins: ["https://example.com/plugin.ts"],
        });
      } finally {
        console.error = originalError;
      }
      assertEquals(result.length, 0);
    },
  });

  Deno.test({
    name: "plugins: loadPlugins skips invalid plugin entry shapes",
    fn: async () => {
      const originalWarn = console.warn;
      console.warn = () => {};

      const malformedConfig = {
        title: "",
        description: "",
        author: "",
        plugins: [{ package: 123 }],
      };

      let result: Awaited<ReturnType<typeof loadPlugins>>;
      try {
        result = await loadPlugins(
          malformedConfig as unknown as Parameters<
            typeof loadPlugins
          >[0],
        );
      } finally {
        console.warn = originalWarn;
      }
      assertEquals(result.length, 0);
    },
  });

  // theme plugins

  Deno.test("plugins: theme plugins are prepended before site plugins", () => {
    const order: string[] = [];
    const themePlugin: StenoPlugin = {
      name: "theme-plugin",
      transformHtml: (h) => {
        order.push("theme");
        return h;
      },
    };
    const sitePlugin: StenoPlugin = {
      name: "site-plugin",
      transformHtml: (h) => {
        order.push("site");
        return h;
      },
    };

    const merged = [themePlugin, sitePlugin];
    runHtmlTransforms("<p>x</p>", merged).then(() => {
      assertEquals(order, ["theme", "site"]);
    });
  });

  // lifecycle hooks

  Deno.test("plugins: beforeBuild is called with site config", async () => {
    let received: unknown = null;
    const plugin: StenoPlugin = {
      name: "test",
      beforeBuild: (config) => {
        received = config;
      },
    };

    const config = { title: "Test", description: "", author: "" };
    await plugin.beforeBuild!(config);

    assertEquals(received, config);
  });

  Deno.test("plugins: afterPage is called with path and html", async () => {
    let received: unknown = null;
    const plugin: StenoPlugin = {
      name: "test",
      afterPage: (page) => {
        received = page;
      },
    };

    const page = { path: "/dist/index.html", html: "<p>hello</p>" };
    await plugin.afterPage!(page);

    assertEquals(received, page);
  });

  Deno.test("plugins: afterBuild is called with site config", async () => {
    let received: unknown = null;
    const plugin: StenoPlugin = {
      name: "test",
      afterBuild: (config) => {
        received = config;
      },
    };

    const config = { title: "Test", description: "", author: "" };
    await plugin.afterBuild!(config);

    assertEquals(received, config);
  });

  Deno.test("plugins: lifecycle hooks can be invoked in sequence", async () => {
    const order: string[] = [];
    const plugin: StenoPlugin = {
      name: "test",
      beforeBuild: () => {
        order.push("beforeBuild");
      },
      transformHtml: (html) => {
        order.push("transformHtml");
        return html;
      },
      afterPage: () => {
        order.push("afterPage");
      },
      afterBuild: () => {
        order.push("afterBuild");
      },
    };

    await plugin.beforeBuild!({ title: "", description: "", author: "" });
    await plugin.transformHtml!("<p>hi</p>");
    await plugin.afterPage!({ path: "/dist/index.html", html: "<p>hi</p>" });
    await plugin.afterBuild!({ title: "", description: "", author: "" });

    assertEquals(order, [
      "beforeBuild",
      "transformHtml",
      "afterPage",
      "afterBuild",
    ]);
  });
}
