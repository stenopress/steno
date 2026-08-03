import { assertEquals, assertStringIncludes } from "@std/assert";
import { join } from "@std/path";
import { runDoctor } from "./doctor.ts";

export function registerDoctorTests(): void {
  Deno.test({
    name: "doctor: reports each plugin execution mode",
    permissions: { read: true, write: true },
    fn: async () => {
      const tempDir = await Deno.makeTempDir();
      const contentDir = join(tempDir, "content");
      const outputDir = join(tempDir, "dist");
      const configPath = join(tempDir, "config.yml");
      await Deno.mkdir(contentDir);
      await Deno.writeTextFile(join(contentDir, "index.md"), "# Home");
      await Deno.writeTextFile(
        configPath,
        `contentDir: ${JSON.stringify(contentDir)}
output: ${JSON.stringify(outputDir)}
plugins:
  - package: "jsr:@example/trusted@1"
  - package: "jsr:@example/isolated@1"
    mode: isolated
`,
      );

      const messages: string[] = [];
      const original = {
        log: console.log,
        warn: console.warn,
        error: console.error,
      };
      console.log = (...args) => messages.push(args.join(" "));
      console.warn = (...args) => messages.push(args.join(" "));
      console.error = (...args) => messages.push(args.join(" "));
      try {
        await runDoctor(configPath);
      } finally {
        Object.assign(console, original);
      }

      const output = messages.join("\n");
      assertStringIncludes(
        output,
        "Plugin jsr:@example/trusted@1 (trusted, in-process)",
      );
      assertStringIncludes(
        output,
        "Plugin jsr:@example/isolated@1 (isolated, subprocess)",
      );
      assertStringIncludes(
        output,
        'Consider "mode: isolated" for third-party plugins',
      );
    },
  });

  Deno.test({
    name:
      "doctor: does not suggest isolation when all plugins are already isolated",
    permissions: { read: true, write: true },
    fn: async () => {
      const tempDir = await Deno.makeTempDir();
      const contentDir = join(tempDir, "content");
      const outputDir = join(tempDir, "dist");
      const configPath = join(tempDir, "config.yml");
      await Deno.mkdir(contentDir);
      await Deno.writeTextFile(join(contentDir, "index.md"), "# Home");
      await Deno.writeTextFile(
        configPath,
        `contentDir: ${JSON.stringify(contentDir)}
output: ${JSON.stringify(outputDir)}
plugins:
  - package: "jsr:@example/isolated@1"
    mode: isolated
`,
      );

      const messages: string[] = [];
      const original = {
        log: console.log,
        warn: console.warn,
        error: console.error,
      };
      console.log = (...args) => messages.push(args.join(" "));
      console.warn = (...args) => messages.push(args.join(" "));
      console.error = (...args) => messages.push(args.join(" "));
      try {
        await runDoctor(configPath);
      } finally {
        Object.assign(console, original);
      }

      const output = messages.join("\n");
      const hintCount =
        output.split('Consider "mode: isolated" for third-party plugins')
          .length - 1;
      assertEquals(hintCount, 0);
    },
  });
}
