import { assertEquals, assertStringIncludes } from "@std/assert";
import { createColors, createSymbols, debugBuildStart, debugPageContext } from "./output.ts";

function captureLogs(fn: () => void): string[] {
  const messages: string[] = [];
  const original = console.log;
  console.log = (...args) => messages.push(args.join(" "));
  try {
    fn();
  } finally {
    console.log = original;
  }
  return messages;
}

export function registerOutputTests(): void {
  Deno.test("output: colors are enabled by default", () => {
    const colors = createColors(false);

    assertEquals(colors.green.startsWith("\x1b["), true);
    assertEquals(colors.bold.startsWith("\x1b["), true);
    assertEquals(colors.reset, "\x1b[0m");
  });

  Deno.test("output: NO_COLOR removes ANSI sequences", () => {
    const colors = createColors(true);

    for (const value of Object.values(colors)) {
      assertEquals(value, "");
    }
  });

  Deno.test("output: NO_COLOR uses readable text markers", () => {
    assertEquals(createSymbols(true), {
      ok: "OK",
      warn: "WARN",
      fail: "ERROR",
      info: "INFO",
      change: "CHANGE",
    });
  });

  Deno.test({
    name: "output: respects NO_COLOR environment variable",
    permissions: { run: true, env: true, read: true },
    fn: async () => {
      const command = new Deno.Command(Deno.execPath(), {
        args: [
          "eval",
          'import { c } from "./src/utils/output.ts"; console.log(JSON.stringify(c));',
        ],
        env: {
          ...Deno.env.toObject(),
          NO_COLOR: "1",
        },
        stdout: "piped",
      });

      const result = await command.output();
      const colors = JSON.parse(new TextDecoder().decode(result.stdout));

      assertEquals(result.success, true);
      assertEquals(colors.green, "");
      assertEquals(colors.bold, "");
    },
  });

  Deno.test({
    name: "output: NO_COLOR output remains meaningful without ANSI",
    permissions: { run: true, env: true, read: true },
    fn: async () => {
      const command = new Deno.Command(Deno.execPath(), {
        args: [
          "eval",
          'import { buildComplete, info } from "./src/utils/output.ts"; info("plain detail"); buildComplete(2);',
        ],
        env: {
          ...Deno.env.toObject(),
          NO_COLOR: "",
        },
        stdout: "piped",
      });

      const result = await command.output();
      const output = new TextDecoder().decode(result.stdout);

      assertEquals(result.success, true);
      assertEquals(output.includes("\x1b["), false);
      assertEquals(output.includes("INFO  plain detail"), true);
      assertEquals(output.includes("OK  Build complete"), true);
    },
  });

  Deno.test("output: debugBuildStart prints the resolved theme and plugins", () => {
    const messages = captureLogs(() => {
      debugBuildStart({ name: "my-theme", version: "1.2.3" }, [
        { name: "seo" },
        { name: "shiki" },
      ]);
    });
    const output = messages.join("\n");
    assertStringIncludes(output, "theme: my-theme@1.2.3");
    assertStringIncludes(output, "plugins: seo, shiki");
  });

  Deno.test("output: debugBuildStart reports (none) for no theme/plugins", () => {
    const messages = captureLogs(() => {
      debugBuildStart(undefined, []);
    });
    const output = messages.join("\n");
    assertStringIncludes(output, "theme: ");
    assertStringIncludes(output, "(none)");
    assertStringIncludes(output, "plugins: ");
  });

  Deno.test("output: debugPageContext prints the route, layout, and full context", () => {
    const messages = captureLogs(() => {
      debugPageContext("blog/post.html", "layout", {
        title: "Hello",
        site: { title: "My Site" },
      });
    });
    const output = messages.join("\n");
    assertStringIncludes(output, "blog/post.html");
    assertStringIncludes(output, "(layout: layout)");
    assertStringIncludes(output, "title:");
    assertStringIncludes(output, "Hello");
    assertStringIncludes(output, "My Site");
  });

  Deno.test("output: debugPageContext reports layout: none when there's no theme", () => {
    const messages = captureLogs(() => {
      debugPageContext("index.html", undefined, { title: "Home" });
    });
    assertStringIncludes(messages.join("\n"), "(layout: none)");
  });
}
